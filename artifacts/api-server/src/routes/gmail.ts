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
} from "../lib/gmailClient";
import { SendReplyBody } from "@workspace/api-zod";

const router = Router();

function getAccount(req: any): string | undefined {
  return (req.query.account as string) || (req.body?.account as string) || undefined;
}

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
      const body = decodeBody(msg.payload);
      const isUnread = (msg.labelIds || []).includes("UNREAD");
      const attachments = extractAttachments(msg.payload);

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
        date,
        isUnread,
        labelIds: msg.labelIds || [],
        attachments,
      };
    });

    const firstMsg = messages[0];
    const subject = firstMsg?.subject || "";
    const isUnread = messages.some((m) => m.isUnread);

    res.json({ id: threadId, subject, messages, snippet: thread.data.snippet, isUnread });
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

router.post("/gmail/compose", requireAuth, async (req, res) => {
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

    const emailLines = [
      `From: ${fromEmail}`,
      `To: ${to}`,
      ...(cc ? [`Cc: ${cc}`] : []),
      ...(bcc ? [`Bcc: ${bcc}`] : []),
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      "",
      body,
    ];

    const raw = Buffer.from(emailLines.join("\r\n")).toString("base64url");
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

router.post("/gmail/send", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const account = (req.body?.account as string) || undefined;
    const body = SendReplyBody.parse(req.body);
    const gmail = await getGmailClientForUser(userId, account);

    const profile = await gmail.users.getProfile({ userId: "me" });
    const fromEmail = account || profile.data.emailAddress || "";

    const emailLines = [
      `From: ${fromEmail}`,
      `To: ${body.to}`,
      `Subject: ${body.subject.startsWith("Re:") ? body.subject : `Re: ${body.subject}`}`,
      `Content-Type: text/plain; charset=utf-8`,
    ];

    if (body.inReplyTo) emailLines.push(`In-Reply-To: ${body.inReplyTo}`);
    if (body.references) emailLines.push(`References: ${body.references}`);

    emailLines.push("", body.body);

    const raw = Buffer.from(emailLines.join("\r\n")).toString("base64url");

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

export default router;
