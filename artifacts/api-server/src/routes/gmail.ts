import { Router } from "express";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../lib/requireAuth";
import {
  getGmailClientForUser,
  isGmailConnected,
  parseEmailAddress,
  getHeader,
  decodeBody,
  extractAttachments,
  getConnectedGmailAccounts,
} from "../lib/gmailClient";
import { SendReplyBody } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { emailSnoozesTable, gmailAccountsTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import rateLimit from "express-rate-limit";

const emailSendRateLimit = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getAuth(req).userId ?? req.ip ?? "anon",
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many email send requests. Please wait a moment.", code: "RATE_LIMITED" });
  },
});

interface SignatureData {
  text?: string;
  imageUrl?: string | null;
  links?: Array<{ label: string; url: string }>;
}

function parseSignatureData(raw: string | null | undefined): SignatureData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) return parsed as SignatureData;
  } catch {}
  // Legacy plain text
  return { text: raw.trim() };
}

function buildPlainSignature(sig: SignatureData): string {
  const parts: string[] = [];
  if (sig.text?.trim()) parts.push(sig.text.trim());
  if (sig.links?.length) {
    for (const link of sig.links) {
      parts.push(link.label ? `${link.label}: ${link.url}` : link.url);
    }
  }
  return parts.join("\n");
}

function buildHtmlSignature(sig: SignatureData): string {
  const parts: string[] = [`<table cellpadding="0" cellspacing="0" border="0" style="font-family:sans-serif;font-size:13px;color:#333;">`];
  if (sig.imageUrl) {
    parts.push(`<tr><td style="padding-bottom:8px;"><img src="${sig.imageUrl}" style="max-height:60px;max-width:200px;display:block;" /></td></tr>`);
  }
  if (sig.text?.trim()) {
    const escaped = sig.text.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
    parts.push(`<tr><td style="padding-bottom:4px;">${escaped}</td></tr>`);
  }
  if (sig.links?.length) {
    const linkHtml = sig.links.map(l =>
      `<a href="${l.url}" style="color:#1a6aff;text-decoration:none;">${l.label || l.url}</a>`
    ).join(" &nbsp;·&nbsp; ");
    parts.push(`<tr><td style="padding-top:4px;">${linkHtml}</td></tr>`);
  }
  parts.push(`</table>`);
  return parts.join("");
}

function buildMultipartEmail(headers: string[], plainBody: string, htmlBody: string): string {
  const boundary = `boundary_${Date.now().toString(36)}`;
  const lines = [
    ...headers,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    "",
    plainBody,
    "",
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    "",
    htmlBody,
    "",
    `--${boundary}--`,
  ];
  return lines.join("\r\n");
}

async function getAccountSignatureData(userId: string, email: string): Promise<SignatureData | null> {
  const [row] = await db.select({ signature: gmailAccountsTable.signature })
    .from(gmailAccountsTable)
    .where(and(eq(gmailAccountsTable.userId, userId), eq(gmailAccountsTable.email, email)))
    .limit(1);
  return parseSignatureData(row?.signature);
}

const router = Router();

function getAccount(req: any): string | undefined {
  return (req.query.account as string) || (req.body?.account as string) || undefined;
}

// Fetch one thread's metadata (for inbox list)
async function fetchThreadMeta(gmail: any, threadId: string, accountEmail: string) {
  const thread = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "metadata",
    metadataHeaders: ["From", "To", "Subject", "Date"],
  });
  const firstMsg = thread.data.messages?.[0];
  const lastMsg = thread.data.messages?.[thread.data.messages!.length - 1];
  if (!firstMsg || !lastMsg) return null;
  const headers = lastMsg.payload?.headers || [];
  const fromRaw = getHeader(headers, "From");
  const toRaw = getHeader(headers, "To");
  const { name: fromName, email: fromEmail } = parseEmailAddress(fromRaw);
  const subject = getHeader(firstMsg.payload?.headers || [], "Subject");
  const date = getHeader(headers, "Date");
  const isUnread = (lastMsg.labelIds || []).includes("UNREAD");
  const isStarred = (lastMsg.labelIds || []).includes("STARRED");
  return {
    id: lastMsg.id,
    threadId,
    from: fromRaw,
    fromName,
    fromEmail,
    to: toRaw,
    subject,
    snippet: thread.data.snippet || "",
    body: "",
    date,
    isUnread,
    isStarred,
    labelIds: lastMsg.labelIds || [],
    accountEmail,
  };
}

// Priority inbox: fetch from ALL connected accounts, merge by priority
router.get("/gmail/priority-inbox", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const accounts = await getConnectedGmailAccounts(userId);
    const q = req.query.q as string | undefined;
    const pageTokensRaw = req.query.pageToken as string | undefined;
    const pageTokens: Record<string, string> = pageTokensRaw ? JSON.parse(pageTokensRaw) : {};

    if (accounts.length === 0) {
      res.status(400).json({ error: "Gmail not connected", notConnected: true });
      return;
    }

    const perAccount = 100;

    const accountResults = await Promise.allSettled(
      accounts.map(async (account) => {
        const gmail = await getGmailClientForUser(userId, account.email);
        const listRes = await gmail.users.threads.list({
          userId: "me",
          labelIds: ["INBOX"],
          maxResults: perAccount,
          ...(q ? { q } : {}),
          ...(pageTokens[account.email] ? { pageToken: pageTokens[account.email] } : {}),
        });
        const threads = listRes.data.threads || [];
        const emails = await Promise.allSettled(
          threads.map((t: any) => fetchThreadMeta(gmail, t.id!, account.email))
        );
        return {
          emails: emails
            .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value !== null)
            .map(r => r.value),
          nextPageToken: listRes.data.nextPageToken,
          email: account.email,
        };
      })
    );

    const allEmails: any[] = [];
    const nextPageTokenMap: Record<string, string> = {};

    for (const result of accountResults) {
      if (result.status === "fulfilled") {
        allEmails.push(...result.value.emails);
        if (result.value.nextPageToken) {
          nextPageTokenMap[result.value.email] = result.value.nextPageToken;
        }
      }
    }

    // Sort: unread first, then by date descending
    allEmails.sort((a, b) => {
      if (a.isUnread && !b.isUnread) return -1;
      if (!a.isUnread && b.isUnread) return 1;
      const dA = new Date(a.date).getTime();
      const dB = new Date(b.date).getTime();
      return (isNaN(dB) ? 0 : dB) - (isNaN(dA) ? 0 : dA);
    });

    res.json({
      threads: allEmails,
      nextPageToken: Object.keys(nextPageTokenMap).length > 0 ? JSON.stringify(nextPageTokenMap) : undefined,
    });
  } catch (err: any) {
    const msg = err?.message || "";
    if (msg.includes("not connected") || msg.includes("Gmail not connected")) {
      res.status(400).json({ error: "Gmail not connected", notConnected: true });
      return;
    }
    req.log.error({ err }, "Error fetching priority inbox");
    res.status(500).json({ error: "Failed to fetch priority inbox" });
  }
});

// AI-powered priority analysis of inbox emails
router.get("/gmail/ai-priority", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const accounts = await getConnectedGmailAccounts(userId);
    if (accounts.length === 0) {
      res.json({ priority: [] });
      return;
    }

    // Fetch 20 recent threads from each account (max 2 accounts for speed)
    const allEmails: any[] = [];
    for (const account of accounts.slice(0, 2)) {
      try {
        const gmail = await getGmailClientForUser(userId, account.email);
        const listRes = await gmail.users.threads.list({
          userId: "me",
          labelIds: ["INBOX"],
          maxResults: 20,
        });
        const threads = listRes.data.threads || [];
        const emailResults = await Promise.allSettled(
          threads.slice(0, 20).map((t: any) => fetchThreadMeta(gmail, t.id!, account.email))
        );
        allEmails.push(
          ...emailResults
            .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value !== null)
            .map(r => r.value)
        );
      } catch { /* skip account on error */ }
    }

    if (allEmails.length === 0) {
      res.json({ priority: [] });
      return;
    }

    // Build AI prompt with email metadata
    const emailList = allEmails.slice(0, 25).map((e, i) =>
      `[${i}] From: ${e.fromName || e.fromEmail} <${e.fromEmail}> | Subject: ${e.subject || "(no subject)"} | ${e.isUnread ? "UNREAD" : "read"} | Date: ${e.date} | Preview: ${(e.snippet || "").slice(0, 200)}`
    ).join("\n");

    const prompt = `You are an expert email assistant. Analyze these inbox emails and identify the 3-5 most important ones that need attention.

Emails:
${emailList}

Selection criteria (in order of importance):
- Requires a decision or response from the user
- Time-sensitive or has a deadline
- From an important person (boss, client, key stakeholder)
- Contains a question, request, or action item
- SKIP: newsletters, marketing, automated notifications, receipts, unsubscribe emails

For each selected priority email, return:
{
  "priority": [
    {
      "index": <integer - the [index] from the list above>,
      "priorityScore": <integer 0-100, higher = more urgent>,
      "summary": "<one crisp sentence: what is needed and from whom>",
      "action": "<short contextual action label, 2-4 words, starts with a verb, specific to this email — e.g. 'Reply to Sarah', 'Approve budget', 'Schedule meeting', 'Review proposal', 'Confirm attendance', 'Send update', 'Follow up now'. For genuinely urgent emails prefix with 'Urgent: '. Max 22 chars.>"
    }
  ]
}

Return valid JSON only. If no emails genuinely need attention, return {"priority": []}.`;

    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://replyai.app",
        "X-Title": "ReplyAI",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 600,
        temperature: 0.2,
      }),
    });

    const aiData = await aiRes.json() as any;
    const content = aiData.choices?.[0]?.message?.content || "{}";

    let parsed: { priority?: Array<{ index: number; priorityScore: number; summary: string; action: string }> } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { priority: [] };
    }

    const priorityItems = (parsed.priority || [])
      .filter(p => typeof p.index === "number" && p.index >= 0 && p.index < allEmails.length)
      .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
      .slice(0, 5)
      .map(p => ({
        ...allEmails[p.index],
        priorityScore: p.priorityScore,
        summary: p.summary,
        suggestedAction: p.action,
      }));

    res.json({ priority: priorityItems });
  } catch (err: any) {
    req.log.error({ err }, "Error fetching AI priority inbox");
    res.json({ priority: [] }); // fail gracefully
  }
});

router.get("/gmail/status", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ connected: false }); return; }

    const status = await isGmailConnected(userId);
    if (!status.connected) { res.json({ connected: false }); return; }

    const account = getAccount(req);
    const gmail = await getGmailClientForUser(userId, account);
    const profile = await gmail.users.getProfile({ userId: "me" });
    res.json({
      connected: true,
      email: profile.data.emailAddress || status.email,
      lastSynced: new Date().toISOString(),
    });
  } catch {
    res.json({ connected: false });
  }
});

router.get("/gmail/inbox", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const account = getAccount(req);
    const gmail = await getGmailClientForUser(userId, account);
    const label = (req.query.label as string) || "INBOX";
    const maxResults = parseInt((req.query.maxResults as string) || "50");
    const pageToken = req.query.pageToken as string | undefined;
    const q = req.query.q as string | undefined;

    const listRes = await gmail.users.threads.list({
      userId: "me",
      labelIds: [label],
      maxResults,
      pageToken,
      q,
    });

    const threads = listRes.data.threads || [];

    const emailsPromises = threads.map(async (t) => {
      try {
        const thread = await gmail.users.threads.get({
          userId: "me",
          id: t.id!,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });
        const firstMsg = thread.data.messages?.[0];
        const lastMsg = thread.data.messages?.[thread.data.messages!.length - 1];
        if (!firstMsg || !lastMsg) return null;

        const headers = lastMsg.payload?.headers || [];
        const fromRaw = getHeader(headers, "From");
        const toRaw = getHeader(headers, "To");
        const { name: fromName, email: fromEmail } = parseEmailAddress(fromRaw);
        const subject = getHeader(firstMsg.payload?.headers || [], "Subject");
        const date = getHeader(headers, "Date");
        const isUnread = (lastMsg.labelIds || []).includes("UNREAD");
        const isStarred = (lastMsg.labelIds || []).includes("STARRED");

        return {
          id: lastMsg.id,
          threadId: t.id,
          from: fromRaw,
          fromName,
          fromEmail,
          to: toRaw,
          subject,
          snippet: thread.data.snippet || "",
          body: "",
          date,
          isUnread,
          isStarred,
          labelIds: lastMsg.labelIds || [],
        };
      } catch {
        return null;
      }
    });

    const emails = (await Promise.all(emailsPromises)).filter(Boolean);

    res.json({
      threads: emails,
      nextPageToken: listRes.data.nextPageToken,
      resultSizeEstimate: listRes.data.resultSizeEstimate,
    });
  } catch (err: any) {
    const msg = err?.message || "";
    if (msg.includes("not connected") || msg.includes("Gmail not connected")) {
      res.status(400).json({ error: "Gmail not connected", notConnected: true });
      return;
    }
    req.log.error({ err }, "Error fetching inbox");
    res.status(500).json({ error: "Failed to fetch inbox" });
  }
});

router.get("/gmail/threads/:threadId", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const account = getAccount(req);
    const gmail = await getGmailClientForUser(userId, account);
    const threadId = req.params.threadId;

    const thread = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });

    const messages = (thread.data.messages || []).map((msg) => {
      const headers = msg.payload?.headers || [];
      const fromRaw = getHeader(headers, "From");
      const { name: fromName, email: fromEmail } = parseEmailAddress(fromRaw);
      const subject = getHeader(headers, "Subject");
      const date = getHeader(headers, "Date");
      const { body, bodyType } = decodeBody(msg.payload);
      const isUnread = (msg.labelIds || []).includes("UNREAD");
      const attachments = extractAttachments(msg.payload);

      const listUnsubscribe = getHeader(headers, "List-Unsubscribe") ||
        getHeader(headers, "list-unsubscribe") || "";
      const unsubscribeLink = listUnsubscribe.match(/<(https?:[^>]+)>/)?.[1]
        || listUnsubscribe.match(/(https?:\S+)/)?.[1]
        || (listUnsubscribe.includes("mailto:") ? listUnsubscribe.match(/<?(mailto:[^>,\s]+)>?/)?.[1] || "" : "")
        || "";

      return {
        id: msg.id,
        threadId,
        from: fromRaw,
        fromName,
        fromEmail,
        to: getHeader(headers, "To"),
        subject,
        snippet: msg.snippet || "",
        body,
        bodyType,
        date,
        isUnread,
        labelIds: msg.labelIds || [],
        attachments,
        unsubscribeLink,
      };
    });

    const firstMsg = messages[0];
    const subject = firstMsg?.subject || "";
    const isUnread = messages.some((m) => m.isUnread);
    const unsubscribeLink = messages[0]?.unsubscribeLink || "";

    res.json({ id: threadId, subject, messages, snippet: thread.data.snippet, isUnread, unsubscribeLink });
  } catch (err) {
    req.log.error({ err }, "Error fetching thread");
    res.status(500).json({ error: "Failed to fetch thread" });
  }
});

router.get("/gmail/labels", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const account = getAccount(req);
    const gmail = await getGmailClientForUser(userId, account);
    const labelsRes = await gmail.users.labels.list({ userId: "me" });
    const labels = labelsRes.data.labels || [];

    res.json({ labels: labels.map((l) => ({ id: l.id, name: l.name, type: l.type, messagesUnread: 0 })) });
  } catch (err) {
    req.log.error({ err }, "Error fetching labels");
    res.status(500).json({ error: "Failed to fetch labels" });
  }
});

router.post("/gmail/threads/:threadId/modify", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const account = getAccount(req);
    const gmail = await getGmailClientForUser(userId, account);
    const { threadId } = req.params;
    const addLabelIds: string[] = Array.isArray(req.body?.addLabelIds) ? req.body.addLabelIds : [];
    const removeLabelIds: string[] = Array.isArray(req.body?.removeLabelIds) ? req.body.removeLabelIds : [];

    await gmail.users.threads.modify({
      userId: "me",
      id: threadId,
      requestBody: { addLabelIds, removeLabelIds },
    });

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error modifying thread");
    res.status(500).json({ error: "Failed to modify thread" });
  }
});

router.post("/gmail/compose", requireAuth, emailSendRateLimit, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const to = typeof req.body?.to === "string" ? req.body.to.trim() : "";
    const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
    const body = typeof req.body?.body === "string" ? req.body.body : "";
    const cc = typeof req.body?.cc === "string" ? req.body.cc.trim() : "";
    const bcc = typeof req.body?.bcc === "string" ? req.body.bcc.trim() : "";
    const threadId = typeof req.body?.threadId === "string" ? req.body.threadId : undefined;
    const account = getAccount(req);

    if (!to || !subject) {
      res.status(400).json({ error: "to and subject are required" });
      return;
    }

    const gmail = await getGmailClientForUser(userId, account);
    const profile = await gmail.users.getProfile({ userId: "me" });
    const fromEmail = account || profile.data.emailAddress || "";
    const sigData = await getAccountSignatureData(userId, fromEmail);

    const baseHeaders = [
      `From: ${fromEmail}`,
      `To: ${to}`,
      ...(cc ? [`Cc: ${cc}`] : []),
      ...(bcc ? [`Bcc: ${bcc}`] : []),
      `Subject: ${subject}`,
    ];

    let raw: string;
    if (sigData && (sigData.imageUrl || sigData.links?.length)) {
      const plainSig = buildPlainSignature(sigData);
      const plainBody = plainSig ? `${body}\n\n-- \n${plainSig}` : body;
      const htmlBody = `<div style="font-family:sans-serif;font-size:14px;white-space:pre-wrap;">${body.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}</div><br><hr style="border:none;border-top:1px solid #eee;margin:12px 0;">${buildHtmlSignature(sigData)}`;
      raw = Buffer.from(buildMultipartEmail(baseHeaders, plainBody, `<html><body>${htmlBody}</body></html>`)).toString("base64url");
    } else {
      const plainSig = sigData ? buildPlainSignature(sigData) : "";
      const fullBody = plainSig ? `${body}\n\n-- \n${plainSig}` : body;
      raw = Buffer.from([...baseHeaders, `Content-Type: text/plain; charset=utf-8`, "", fullBody].join("\r\n")).toString("base64url");
    }

    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, ...(threadId ? { threadId } : {}) },
    });

    res.json({ messageId: result.data.id, success: true });
  } catch (err) {
    req.log.error({ err }, "Error composing email");
    res.status(500).json({ error: "Failed to send email" });
  }
});

router.post("/gmail/send", requireAuth, emailSendRateLimit, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const account = (req.body?.account as string) || undefined;
    const body = SendReplyBody.parse(req.body);
    const gmail = await getGmailClientForUser(userId, account);

    const profile = await gmail.users.getProfile({ userId: "me" });
    const fromEmail = account || profile.data.emailAddress || "";
    const sigData = await getAccountSignatureData(userId, fromEmail);

    const replySubject = body.subject.startsWith("Re:") ? body.subject : `Re: ${body.subject}`;
    const baseHeaders = [
      `From: ${fromEmail}`,
      `To: ${body.to}`,
      `Subject: ${replySubject}`,
    ];
    if (body.inReplyTo) baseHeaders.push(`In-Reply-To: ${body.inReplyTo}`);
    if (body.references) baseHeaders.push(`References: ${body.references}`);

    let raw: string;
    if (sigData && (sigData.imageUrl || sigData.links?.length)) {
      const plainSig = buildPlainSignature(sigData);
      const plainBody = plainSig ? `${body.body}\n\n-- \n${plainSig}` : body.body;
      const htmlBody = `<div style="font-family:sans-serif;font-size:14px;white-space:pre-wrap;">${body.body.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}</div><br><hr style="border:none;border-top:1px solid #eee;margin:12px 0;">${buildHtmlSignature(sigData)}`;
      raw = Buffer.from(buildMultipartEmail(baseHeaders, plainBody, `<html><body>${htmlBody}</body></html>`)).toString("base64url");
    } else {
      const plainSig = sigData ? buildPlainSignature(sigData) : "";
      const fullBody = plainSig ? `${body.body}\n\n-- \n${plainSig}` : body.body;
      raw = Buffer.from([...baseHeaders, `Content-Type: text/plain; charset=utf-8`, "", fullBody].join("\r\n")).toString("base64url");
    }

    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId: body.threadId },
    });

    res.json({ messageId: result.data.id, success: true });
  } catch (err) {
    req.log.error({ err }, "Error sending reply");
    res.status(500).json({ error: "Failed to send reply" });
  }
});

router.get("/gmail/messages/:messageId/attachments/:attachmentId", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { messageId, attachmentId } = req.params;
    const filename = (req.query.filename as string) || "attachment";
    const mimeType = (req.query.mimeType as string) || "application/octet-stream";
    const account = getAccount(req);

    const gmail = await getGmailClientForUser(userId, account);
    const response = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });

    const data = response.data.data;
    if (!data) { res.status(404).json({ error: "Attachment not found" }); return; }

    const buffer = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    req.log.error({ err }, "Error downloading attachment");
    res.status(500).json({ error: "Failed to download attachment" });
  }
});

router.post("/gmail/threads/:threadId/snooze", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { threadId } = req.params;
    const snoozeUntilRaw = req.body?.snoozeUntil;
    const account = getAccount(req) ?? "";

    if (!snoozeUntilRaw) {
      res.status(400).json({ error: "snoozeUntil is required" });
      return;
    }

    const snoozeUntil = new Date(snoozeUntilRaw);
    if (isNaN(snoozeUntil.getTime())) {
      res.status(400).json({ error: "Invalid snoozeUntil date" });
      return;
    }

    await db.insert(emailSnoozesTable)
      .values({ userId, threadId, accountEmail: account, snoozeUntil })
      .onConflictDoUpdate({
        target: [emailSnoozesTable.userId, emailSnoozesTable.threadId, emailSnoozesTable.accountEmail],
        set: { snoozeUntil },
      });

    res.json({ success: true, snoozeUntil: snoozeUntil.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Error snoozing thread");
    res.status(500).json({ error: "Failed to snooze thread" });
  }
});

router.delete("/gmail/threads/:threadId/snooze", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { threadId } = req.params;
    const account = getAccount(req) ?? "";

    await db.delete(emailSnoozesTable).where(
      and(
        eq(emailSnoozesTable.userId, userId),
        eq(emailSnoozesTable.threadId, threadId),
        eq(emailSnoozesTable.accountEmail, account)
      )
    );

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error un-snoozing thread");
    res.status(500).json({ error: "Failed to un-snooze thread" });
  }
});

router.get("/gmail/snoozed", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const now = new Date();
    const snoozed = await db.select()
      .from(emailSnoozesTable)
      .where(and(eq(emailSnoozesTable.userId, userId), gt(emailSnoozesTable.snoozeUntil, now)));

    res.json({ snoozed: snoozed.map((s) => ({ threadId: s.threadId, snoozeUntil: s.snoozeUntil.toISOString(), accountEmail: s.accountEmail })) });
  } catch (err) {
    req.log.error({ err }, "Error fetching snoozed threads");
    res.status(500).json({ error: "Failed to fetch snoozed threads" });
  }
});

// ── Gmail Push: watch registration ────────────────────────────────────────────
router.post("/gmail/watch", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { watchUser } = await import("../lib/gmailWatcher");
    await watchUser(userId);
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error registering Gmail watch");
    res.status(500).json({ error: "Failed to register Gmail watch" });
  }
});

// ── Gmail Pub/Sub webhook (public — no auth, verified by token query param) ──
router.post("/gmail/webhook", async (req, res) => {
  try {
    const secret = process.env.PUBSUB_WEBHOOK_SECRET;
    if (secret && req.query.token !== secret) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const message = req.body?.message;
    if (!message?.data) {
      res.status(200).send("ok"); // Pub/Sub requires 200 to ack
      return;
    }

    const decoded = Buffer.from(message.data, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as { emailAddress?: string; historyId?: number };

    if (parsed.emailAddress && parsed.historyId) {
      const { handlePushNotification } = await import("../lib/gmailWatcher");
      // Don't await — respond immediately, process async
      handlePushNotification({ emailAddress: parsed.emailAddress, historyId: parsed.historyId })
        .catch((err: unknown) => req.log.error({ err: err instanceof Error ? err.message : "Unknown error" }, "[gmail-push] handlePushNotification error"));
    }

    res.status(200).send("ok");
  } catch (err) {
    req.log.error({ err }, "Error processing Gmail webhook");
    res.status(200).send("ok"); // Always 200 to avoid Pub/Sub retry storms
  }
});

export default router;
