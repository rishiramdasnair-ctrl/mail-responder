import { Router, Request } from "express";
import multer from "multer";
import { requireAuth } from "../lib/requireAuth";
import { getReqUserId } from "../lib/getReqAuth";
import { getOrCreateUser, getUserPlan, getRepliesLimit } from "../lib/getOrCreateUser";
import { GenerateRepliesBody } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { usersTable, replyHistoryTable, connectorsTable, contactProfilesTable } from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { openrouter as openai, FAST_MODEL } from "../lib/openrouter";
import rateLimit from "express-rate-limit";
import { getGmailClientForUser, getCalendarClientForUser, getHeader } from "../lib/gmailClient";
import { getTeamsToken, teamsGet } from "../lib/teamsClient";
import { decryptConnectorConfig } from "../lib/tokenCrypto";
import { getFathomToken } from "./fathom";
import { google } from "googleapis";
import { classifyEmailTone } from "../lib/emailClassifier";

const router = Router();

// In-memory digest cache — keyed by userId, expires after 15 minutes
const digestCache = new Map<string, { digest: string; expiresAt: number }>();

const aiRateLimit = rateLimit({
  windowMs: 60_000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getReqUserId(req) ?? "anon",
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => {
    res.status(429).json({
      error: "Too many requests. Please wait a moment before generating more replies.",
      code: "RATE_LIMITED",
    });
  },
});

router.post("/ai/generate", requireAuth, aiRateLimit, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const user = await getOrCreateUser(userId);
    const plan = getUserPlan(user);

    if (plan === "expired") {
      res.status(429).json({ error: "Trial expired. Please subscribe to continue.", code: "TRIAL_EXPIRED" });
      return;
    }

    const repliesLimit = getRepliesLimit(user);
    if (user.repliesUsed >= repliesLimit) {
      res.status(429).json({ error: "Reply limit reached. Please upgrade your plan.", code: "LIMIT_REACHED" });
      return;
    }

    const calendarContext = req.body?.calendarContext as string | undefined;
    const body = GenerateRepliesBody.parse(req.body);

    const calendarSection = calendarContext
      ? `\n\nCalendar context (next 7 days):\n${calendarContext}\n\nUse the calendar above to:\n- Suggest specific available times when scheduling is requested (times NOT listed as busy)\n- Avoid proposing times that conflict with existing events\n- Acknowledge busy days when relevant`
      : "";

    // Fetch recent sent emails for reply memory / style matching
    const recentReplies = await db
      .select({ replySent: replyHistoryTable.replySent, tone: replyHistoryTable.tone })
      .from(replyHistoryTable)
      .where(and(eq(replyHistoryTable.userId, userId), eq(replyHistoryTable.wasSent, true)))
      .orderBy(desc(replyHistoryTable.createdAt))
      .limit(5);

    const styleSection = recentReplies.length > 0
      ? `\n\nUser writing style examples (recent sent emails — mirror vocabulary, length, and sign-off patterns):\n${recentReplies.map((r, i) => `[Example ${i + 1}]: ${r.replySent.slice(0, 300)}`).join("\n\n")}\n\nApply the user's observed style subtly in the "casual" and "fast" suggestions.`
      : "";

    const systemPrompt = `You are ReplyAI, an expert AI secretary and email assistant. Generate 3 distinct reply suggestions for the given email.

Tone guidelines:
1. "pro" — Use the BLUF (Bottom Line Up Front) military writing standard. Open with the key ask or decision in the very first sentence. Follow with brief bullet context if needed. 5 sentences max. No filler, no preamble.
2. "casual" — Friendly and conversational. Natural, warm, like writing to a colleague you know well.
3. "fast" — Ultra-brief. 1-2 sentences only. The fastest possible response that's still complete and clear.

For each suggestion, also provide a 1-line "reasoning" explaining why this reply works.${calendarSection}${styleSection}

Respond ONLY with a valid JSON object in this exact format:
{
  "suggestions": [
    { "tone": "pro", "content": "...", "reasoning": "..." },
    { "tone": "casual", "content": "...", "reasoning": "..." },
    { "tone": "fast", "content": "...", "reasoning": "..." }
  ]
}`;

    const userMessage = `Email from: ${body.emailFrom}
Subject: ${body.emailSubject}
Message:
${(body.emailBody || "").slice(0, 1500)}`;

    const completion = await openai.chat.completions.create({
      model: FAST_MODEL,
      max_tokens: 900,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    const content = completion.choices[0]?.message?.content || "{}";
    let parsed: { suggestions: Array<{ tone: string; content: string; reasoning: string }> };
    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { suggestions: [] };
    }

    await db.update(usersTable)
      .set({ repliesUsed: user.repliesUsed + 1, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    const lastMsg = parsed.suggestions?.[0];
    if (lastMsg) {
      await db.insert(replyHistoryTable).values({
        userId,
        threadId: body.threadId,
        subject: body.emailSubject || "(no subject)",
        fromEmail: body.emailFrom || null,
        tone: "pro",
        replySent: lastMsg.content,
        createdAt: new Date(),
      }).onConflictDoNothing();
    }

    const repliesRemaining = repliesLimit - (user.repliesUsed + 1);

    res.json({
      suggestions: parsed.suggestions || [],
      threadId: body.threadId,
      repliesRemaining: Math.max(0, repliesRemaining),
    });
  } catch (err) {
    req.log.error({ err }, "Error generating replies");
    res.status(500).json({ error: "Failed to generate replies" });
  }
});

const ACTION_TYPES = ["reply", "forward", "calendar", "archive"] as const;

interface ProposedAction {
  id: string;
  label: string;
  description: string;
  type: (typeof ACTION_TYPES)[number];
  draftContent?: string;
}

router.post("/ai/actions", requireAuth, aiRateLimit, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const user = await getOrCreateUser(userId);
    const plan = getUserPlan(user);

    if (plan === "expired") {
      res.status(429).json({ error: "Trial expired. Please subscribe to continue.", code: "TRIAL_EXPIRED" });
      return;
    }

    const { threadId, emailBody, emailFrom, emailSubject, accountEmail: reqAccountEmail, customInstruction } = req.body as {
      threadId?: string;
      emailBody?: string;
      emailFrom?: string;
      emailSubject?: string;
      accountEmail?: string;
      customInstruction?: string;
    };

    const accountLine = reqAccountEmail ? `\nYour email account: ${reqAccountEmail}` : "";
    const bodySection = emailBody
      ? `Message:\n${emailBody.slice(0, 3000)}`
      : "(No message body available — analyze based on subject and sender)";
    const emailCtx = `Email from: ${emailFrom || "unknown"}
Subject: ${emailSubject || "(no subject)"}${accountLine}
${bodySection}`;

    let systemPrompt: string;
    let userMessage: string;

    if (customInstruction) {
      systemPrompt = `You are ReplyAI, an expert email assistant. The user wants to take a specific action on an email. Generate the most appropriate action based on their instruction.

Action types:
- "reply": Send a reply (provide draftContent with the full draft text, plain text)
- "forward": Forward to someone (provide draftContent with the message body)
- "calendar": Create a calendar event (provide draftContent as JSON: {"title":"...","start":"ISO8601","end":"ISO8601","description":"...","attendees":["email"]})
- "archive": Archive this thread (no draftContent)

Choose the most appropriate type based on the user's instruction. If the instruction implies forwarding, use "forward". If it implies scheduling, use "calendar". If it implies archiving, use "archive". Otherwise, use "reply".

Respond ONLY with a valid JSON object in this exact format:
{
  "actions": [
    {
      "id": "1",
      "label": "<short action label, max 8 words>",
      "description": "<one sentence explaining what this will do>",
      "type": "reply|forward|calendar|archive",
      "draftContent": "<string or omit for archive>"
    }
  ]
}`;
      userMessage = `${emailCtx}

User instruction: ${customInstruction}`;
    } else {
      systemPrompt = `You are ReplyAI, an expert email assistant. Analyze this email and propose 3–5 smart actions the user could take. Each action must be concrete and specific to the email content.

Action types:
- "reply": Send a reply (provide draftContent with the full draft text)
- "forward": Forward to someone relevant (provide draftContent with the forwarding message)
- "calendar": Create a calendar event (provide draftContent as JSON: {"title":"...","start":"ISO8601","end":"ISO8601","description":"...","attendees":["email"]})
- "archive": Archive this thread (no draftContent needed)

Rules:
- Actions must be specific to this email (e.g., "Reply confirming Tuesday 2pm", not "Send a reply")
- draftContent for reply/forward must be natural, complete, professional plain text — no markdown
- draftContent for calendar must be valid JSON with title/start/end at minimum
- 3 actions minimum, 5 maximum
- Vary the types where it makes sense

Respond ONLY with a valid JSON object in this exact format:
{
  "actions": [
    {
      "id": "1",
      "label": "<short label max 8 words>",
      "description": "<one sentence>",
      "type": "reply|forward|calendar|archive",
      "draftContent": "<string or omit for archive>"
    }
  ]
}`;
      userMessage = emailCtx;
    }

    const completion = await openai.chat.completions.create({
      model: FAST_MODEL,
      max_tokens: 1000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    const content = completion.choices[0]?.message?.content || "{}";
    let parsed: { actions: ProposedAction[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { actions: [] };
    }

    let actions = (parsed.actions || [])
      .filter((a: ProposedAction) => a.id && a.label && a.type && ACTION_TYPES.includes(a.type))
      .slice(0, 5);

    if (!customInstruction && actions.length < 3) {
      const fallbackReply: ProposedAction = {
        id: "fallback-reply",
        label: "Write a reply",
        description: "Compose a thoughtful reply to this email",
        type: "reply",
        draftContent: "",
      };
      const fallbackArchive: ProposedAction = {
        id: "fallback-archive",
        label: "Archive this thread",
        description: "Remove this thread from your inbox",
        type: "archive",
      };
      if (!actions.some((a) => a.type === "reply")) actions.push(fallbackReply);
      if (!actions.some((a) => a.type === "archive")) actions.push(fallbackArchive);
    }

    res.json({ actions, threadId });
  } catch (err) {
    req.log.error({ err }, "Error generating AI actions");
    res.status(500).json({ error: "Failed to generate actions" });
  }
});

router.post("/ai/thread-summary", requireAuth, aiRateLimit, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const user = await getOrCreateUser(userId);
    const plan = getUserPlan(user);

    if (plan === "expired") {
      res.status(429).json({ error: "Trial expired. Please subscribe to continue.", code: "TRIAL_EXPIRED" });
      return;
    }

    const messages: Array<{ fromName: string; date: string; body: string }> = req.body?.messages || [];
    const subject: string = req.body?.subject || "";

    if (!messages.length) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    const truncated = messages.slice(-8).map((m) => {
      const body = (m.body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 600);
      return `[${m.fromName || "Unknown"} on ${m.date || ""}]: ${body}`;
    }).join("\n\n");

    const completion = await openai.chat.completions.create({
      model: FAST_MODEL,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: `You are ReplyAI, an AI secretary. Analyze this email thread and respond with valid JSON only.

Output format:
{
  "triage": "REPLY-NOW" | "REPLY-TODAY" | "DECISION" | "FYI",
  "summary": "2-3 bullet points as a single string using • character. Focus on decisions, action items, and outcomes. Max 60 words."
}

Triage definitions:
- REPLY-NOW: someone is blocked waiting for you, time-sensitive (< 4h)
- REPLY-TODAY: needs a reply today but not urgent
- DECISION: you need to make a choice — don't draft a reply, summarize the options
- FYI: informational, no reply needed — safe to archive`,
        },
        { role: "user", content: `Subject: ${subject}\n\n${truncated}` },
      ],
    });

    let result: { triage?: string; summary?: string };
    try {
      const raw = completion.choices[0]?.message?.content?.trim() || "{}";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      result = { summary: completion.choices[0]?.message?.content?.trim() || "" };
    }

    res.json({ summary: result.summary || "", triage: result.triage || null });
  } catch (err) {
    req.log.error({ err }, "Error generating thread summary");
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

router.post("/ai/digest", requireAuth, aiRateLimit, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const user = await getOrCreateUser(userId);
    const plan = getUserPlan(user);

    if (plan === "expired") {
      res.status(429).json({ error: "Trial expired. Please subscribe to continue.", code: "TRIAL_EXPIRED" });
      return;
    }

    // Serve cached digest if still fresh (15 min)
    const cached = digestCache.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
      res.json({ digest: cached.digest, cached: true });
      return;
    }

    const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const sections: string[] = [];

    // --- Gmail unread ---
    try {
      const gmail = await getGmailClientForUser(userId);
      const listRes = await gmail.users.threads.list({ userId: "me", q: "is:unread", maxResults: 10 });
      const threads = listRes.data.threads || [];
      if (threads.length) {
        const items = await Promise.all(threads.slice(0, 10).map(async (t) => {
          try {
            const thread = await gmail.users.threads.get({ userId: "me", id: t.id!, format: "metadata", metadataHeaders: ["From", "Subject"] });
            const msg = thread.data.messages?.[thread.data.messages.length - 1];
            const headers = msg?.payload?.headers || [];
            const from = getHeader(headers, "From").split("<")[0].trim().replace(/"/g, "") || "Unknown";
            const subject = getHeader(headers, "Subject") || "(no subject)";
            return `• ${from} — ${subject}`;
          } catch { return null; }
        }));
        const valid = items.filter(Boolean);
        if (valid.length) sections.push(`EMAIL (${valid.length} unread)\n${valid.join("\n")}`);
      } else {
        sections.push("EMAIL\nInbox is clear.");
      }
    } catch { /* Gmail not connected */ }

    // --- Google Calendar upcoming events + Fathom pre-meeting briefs ---
    try {
      const calendar = await getCalendarClientForUser(userId);
      const gcal = google.calendar({ version: "v3", auth: calendar });
      const now = new Date();
      const end = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      const eventsRes = await gcal.events.list({
        calendarId: "primary",
        timeMin: now.toISOString(),
        timeMax: end.toISOString(),
        maxResults: 8,
        singleEvents: true,
        orderBy: "startTime",
      });
      const events = eventsRes.data.items || [];

      // Try to enrich with Fathom past meeting summaries
      const fathomToken = await getFathomToken(userId).catch(() => null);
      const fathomCache = new Map<string, string>(); // email key → summary

      if (fathomToken && events.length) {
        try {
          // Collect all attendee emails across upcoming events (excluding self / google calendar service accounts)
          const allAttendeeEmails = new Set<string>();
          for (const e of events) {
            for (const att of e.attendees || []) {
              if (att.email && !att.self && !att.email.endsWith("@group.calendar.google.com")) {
                allAttendeeEmails.add(att.email.toLowerCase());
              }
            }
          }

          if (allAttendeeEmails.size > 0) {
            // Fetch last 50 Fathom meetings and match by attendee email
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const fathomData = await fetch(
              `https://api.fathom.ai/external/v1/meetings?limit=50&created_after=${thirtyDaysAgo}`,
              { headers: { Authorization: `Bearer ${fathomToken}`, Accept: "application/json" } }
            );
            if (fathomData.ok) {
              const fm = await fathomData.json() as { items?: Array<{
                title?: string;
                scheduled_start_time?: string;
                calendar_invitees?: Array<{ email?: string; name?: string }>;
                default_summary?: { content?: string } | null;
                recordings?: Array<{ id: string }>;
              }> };

              for (const meeting of fm.items || []) {
                const inviteeEmails = (meeting.calendar_invitees || [])
                  .map(i => (i.email || "").toLowerCase())
                  .filter(Boolean);
                const overlap = inviteeEmails.filter(e => allAttendeeEmails.has(e));
                if (overlap.length > 0 && meeting.default_summary?.content) {
                  const key = overlap[0];
                  if (!fathomCache.has(key)) {
                    const summarySnippet = meeting.default_summary.content.slice(0, 300).replace(/\n+/g, " ");
                    fathomCache.set(key, `Last meeting (${meeting.title || "Untitled"}): ${summarySnippet}`);
                  }
                }
              }
            }
          }
        } catch { /* Fathom enrichment non-fatal */ }
      }

      if (events.length) {
        const items = events.map((e) => {
          const start = e.start?.dateTime
            ? new Date(e.start.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
            : "All day";
          const attendeeEmails = (e.attendees || [])
            .filter(a => !a.self && !a.email?.endsWith("@group.calendar.google.com"))
            .map(a => (a.email || "").toLowerCase());
          const fathomContext = attendeeEmails.map(em => fathomCache.get(em)).find(Boolean);
          const base = `• ${start} — ${e.summary || "Untitled event"}${e.attendees?.length ? ` (${e.attendees.length} attendees)` : ""}`;
          return fathomContext ? `${base}\n  [Fathom] ${fathomContext}` : base;
        });
        sections.push(`CALENDAR (next 48h)\n${items.join("\n")}`);
      } else {
        sections.push("CALENDAR\nNo upcoming events in the next 48 hours.");
      }
    } catch { /* Calendar not connected */ }

    // --- Slack unread ---
    try {
      const slackRows = await db.select({ config: connectorsTable.config })
        .from(connectorsTable)
        .where(and(eq(connectorsTable.userId, userId), eq(connectorsTable.connectorId, "slack"), eq(connectorsTable.status, "connected")))
        .limit(1);

      if (slackRows.length) {
        const slackToken = (decryptConnectorConfig(slackRows[0].config as Record<string, unknown>) as { accessToken?: string }).accessToken;
        if (slackToken) {
          const chRes = await fetch("https://slack.com/api/conversations.list?types=public_channel,private_channel,im&limit=20&exclude_archived=true", {
            headers: { Authorization: `Bearer ${slackToken}` },
          });
          const chData = await chRes.json() as { ok: boolean; channels?: Array<{ id: string; name?: string; is_im?: boolean; unread_count?: number }> };
          const unreadChannels = (chData.channels || []).filter(c => (c.unread_count ?? 0) > 0).slice(0, 6);
          if (unreadChannels.length) {
            const msgItems = await Promise.all(unreadChannels.map(async (ch) => {
              try {
                const histRes = await fetch(`https://slack.com/api/conversations.history?channel=${ch.id}&limit=1`, {
                  headers: { Authorization: `Bearer ${slackToken}` },
                });
                const hist = await histRes.json() as { messages?: Array<{ text?: string }> };
                const preview = hist.messages?.[0]?.text?.slice(0, 80).replace(/\n/g, " ") || "";
                const name = ch.is_im ? "DM" : `#${ch.name}`;
                return `• ${name}: ${preview}`;
              } catch { return null; }
            }));
            const valid = msgItems.filter(Boolean);
            if (valid.length) sections.push(`SLACK (${unreadChannels.length} channels with unread)\n${valid.join("\n")}`);
          } else {
            sections.push("SLACK\nNo unread messages.");
          }
        }
      }
    } catch { /* Slack not connected */ }

    // --- Teams recent chats ---
    try {
      const teamsToken = await getTeamsToken(userId);
      if (teamsToken) {
        const chatsData = await teamsGet<{ value: Array<{ id: string; chatType: string; topic?: string; lastMessagePreview?: { body?: { content?: string }; from?: { user?: { displayName?: string } } } }> }>(
          teamsToken, "/me/chats?$expand=lastMessagePreview&$top=10"
        );
        const chats = (chatsData.value || []).filter(c => c.lastMessagePreview?.body?.content).slice(0, 5);
        if (chats.length) {
          const items = chats.map(c => {
            const from = c.lastMessagePreview?.from?.user?.displayName || "Someone";
            const preview = (c.lastMessagePreview?.body?.content || "").replace(/<[^>]*>/g, "").slice(0, 80);
            const name = c.topic || (c.chatType === "oneOnOne" ? `Chat with ${from}` : "Group chat");
            return `• ${name}: ${preview}`;
          });
          sections.push(`TEAMS\n${items.join("\n")}`);
        } else {
          sections.push("TEAMS\nNo recent messages.");
        }
      }
    } catch { /* Teams not connected */ }

    if (!sections.length) {
      res.json({ digest: "No connected accounts yet. Connect Gmail, Calendar, Slack, or Teams in Settings to get your daily briefing." });
      return;
    }

    const systemsSnapshot = sections.join("\n\n");

    const completion = await openai.chat.completions.create({
      model: FAST_MODEL,
      max_tokens: 550,
      messages: [
        {
          role: "system",
          content: `You are ReplyAI, an AI chief of staff. Generate a cross-system briefing from the data below.

Use this exact format (plain text only — no asterisks, no pound signs, no markdown):

Daily Brief — ${today}

EMAIL
One or two sentences on inbox state and the most urgent email.

CALENDAR
For each upcoming meeting that has a [Fathom] context attached, write one sentence summarizing what was discussed last time and what to be ready for. For meetings without Fathom context, just note the time and attendee count.

COMMS
One or two sentences covering Slack/Teams highlights if any.

ACTION ITEMS
• [Most critical thing to do]
• [Second priority]
• [Third priority if needed]
(Max 3 bullets. Omit section if nothing urgent.)

Rules:
- Be concise and direct — max 220 words total
- Only reference actual data from the snapshot
- Omit any section header if that system is not in the snapshot
- When [Fathom] context is present for a meeting, lead with the most relevant prep point from that summary
- Plain text only — no asterisks, no pound signs, no markdown
- Sound like a smart, calm chief of staff giving a morning briefing`,
        },
        { role: "user", content: `Notifications snapshot:\n\n${systemsSnapshot}` },
      ],
    });

    const digest = completion.choices[0]?.message?.content?.trim() || "";

    // Cache for 15 minutes
    digestCache.set(userId, { digest, expiresAt: Date.now() + 15 * 60 * 1000 });

    res.json({ digest });
  } catch (err) {
    req.log.error({ err }, "Error generating digest");
    res.status(500).json({ error: "Failed to generate digest" });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const transcribeRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getReqUserId(req) ?? "anon",
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many transcription requests. Please wait a moment.", code: "RATE_LIMITED" });
  },
});

router.post("/ai/transcribe", requireAuth, transcribeRateLimit, upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No audio file provided" });
      return;
    }

    const { buffer, mimetype, originalname } = req.file;
    const filename = originalname || `audio.${mimetype.split("/")[1] || "m4a"}`;

    const { File } = await import("node:buffer");
    const slicedBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    const audioFile = new File([slicedBuffer], filename, { type: mimetype || "audio/m4a" });

    const transcription = await openai.audio.transcriptions.create({
      model: "openai/whisper-large-v3",
      file: audioFile as unknown as Parameters<typeof openai.audio.transcriptions.create>[0]["file"],
    });

    res.json({ text: transcription.text });
  } catch (err) {
    req.log.error({ err }, "Error transcribing audio");
    res.status(500).json({ error: "Failed to transcribe audio" });
  }
});

// Tone classification endpoint for inbox emails
router.post("/ai/classify-tone", requireAuth, async (req, res) => {
  try {
    const { subject, snippet } = req.body as { subject?: string; snippet?: string };
    if (!subject && !snippet) {
      res.status(400).json({ error: "subject or snippet required" });
      return;
    }
    const tone = await classifyEmailTone(subject || "", snippet || "");
    res.json({ tone });
  } catch (err) {
    req.log.error({ err }, "Error classifying tone");
    res.status(500).json({ error: "Failed to classify tone" });
  }
});

// Batch tone classification for a list of emails
router.post("/ai/classify-tones", requireAuth, async (req, res) => {
  try {
    const emails = req.body?.emails as Array<{ id: string; subject?: string; snippet?: string }>;
    if (!Array.isArray(emails) || emails.length === 0) {
      res.status(400).json({ error: "emails array required" });
      return;
    }
    const results = await Promise.all(
      emails.slice(0, 50).map(async (e) => ({
        id: e.id,
        tone: await classifyEmailTone(e.subject || "", e.snippet || ""),
      }))
    );
    res.json({ tones: results });
  } catch (err) {
    req.log.error({ err }, "Error classifying tones");
    res.status(500).json({ error: "Failed to classify tones" });
  }
});

// Contact profile endpoint — builds profile from reply history and updates contact_profiles table
router.get("/ai/contact-profile", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const senderEmail = req.query.email as string;
    if (!senderEmail) {
      res.status(400).json({ error: "email query param required" });
      return;
    }

    // Fetch all reply history for this sender
    const replies = await db
      .select()
      .from(replyHistoryTable)
      .where(and(eq(replyHistoryTable.userId, userId), eq(replyHistoryTable.fromEmail, senderEmail)))
      .orderBy(desc(replyHistoryTable.createdAt));

    const emailCount = replies.length;
    const firstSeenAt = replies.length > 0 ? replies[replies.length - 1].createdAt : null;
    const lastSeenAt = replies.length > 0 ? replies[0].createdAt : null;

    // Compute average response time (time between email receipt and reply creation)
    // We approximate using createdAt timestamps of consecutive replies
    let avgResponseTimeHours: number | null = null;
    if (replies.length >= 2) {
      const diffs: number[] = [];
      for (let i = 0; i < replies.length - 1; i++) {
        const diff = replies[i].createdAt.getTime() - replies[i + 1].createdAt.getTime();
        if (diff > 0) diffs.push(diff / (1000 * 60 * 60));
      }
      if (diffs.length > 0) {
        avgResponseTimeHours = Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10) / 10;
      }
    }

    // Compute inferred tone from tone distribution in replies
    const toneCounts: Record<string, number> = {};
    for (const r of replies) {
      if (r.tone) toneCounts[r.tone] = (toneCounts[r.tone] ?? 0) + 1;
    }
    const inferredTone = Object.keys(toneCounts).length > 0
      ? Object.entries(toneCounts).sort((a, b) => b[1] - a[1])[0][0]
      : null;

    // Upsert contact profile
    if (emailCount > 0) {
      await db
        .insert(contactProfilesTable)
        .values({
          userId,
          senderEmail,
          emailCount,
          avgResponseTimeHours,
          inferredTone,
          firstSeenAt: firstSeenAt ?? new Date(),
          lastSeenAt: lastSeenAt ?? new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [contactProfilesTable.userId, contactProfilesTable.senderEmail],
          set: {
            emailCount,
            avgResponseTimeHours,
            inferredTone,
            lastSeenAt: lastSeenAt ?? new Date(),
            updatedAt: new Date(),
          },
        });
    }

    // Compute emails-per-week frequency over the observed window
    let emailsPerWeek: number | null = null;
    if (firstSeenAt && lastSeenAt && emailCount >= 2) {
      const windowMs = lastSeenAt.getTime() - firstSeenAt.getTime();
      const windowWeeks = windowMs / (1000 * 60 * 60 * 24 * 7);
      if (windowWeeks >= 0.1) {
        emailsPerWeek = Math.round((emailCount / windowWeeks) * 10) / 10;
      }
    }

    res.json({
      senderEmail,
      emailCount,
      avgResponseTimeHours,
      emailsPerWeek,
      inferredTone,
      firstSeenAt,
      lastSeenAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching contact profile");
    res.status(500).json({ error: "Failed to fetch contact profile" });
  }
});

export default router;
