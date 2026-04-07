import { Router, Request } from "express";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../lib/requireAuth";
import { getOrCreateUser, getUserPlan, getRepliesLimit } from "../lib/getOrCreateUser";
import { GenerateRepliesBody } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { usersTable, replyHistoryTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { openrouter as openai, FAST_MODEL, AGENT_MODEL } from "../lib/openrouter";
import rateLimit from "express-rate-limit";

const router = Router();

const aiRateLimit = rateLimit({
  windowMs: 60_000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getAuth(req).userId ?? "anon",
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
    const auth = getAuth(req);
    const userId = auth.userId!;
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

    const systemPrompt = `You are ReplyAI, an expert AI secretary and email assistant. Generate 3 distinct reply suggestions for the given email.

Tone guidelines:
1. "pro" — Use the BLUF (Bottom Line Up Front) military writing standard. Open with the key ask or decision in the very first sentence. Follow with brief bullet context if needed. 5 sentences max. No filler, no preamble.
2. "casual" — Friendly and conversational. Natural, warm, like writing to a colleague you know well.
3. "fast" — Ultra-brief. 1-2 sentences only. The fastest possible response that's still complete and clear.

For each suggestion, also provide a 1-line "reasoning" explaining why this reply works.${calendarSection}

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
${body.emailBody}`;

    const completion = await openai.chat.completions.create({
      model: FAST_MODEL,
      max_tokens: 2048,
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
    const auth = getAuth(req);
    const userId = auth.userId!;
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
      max_tokens: 2048,
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
    const auth = getAuth(req);
    const userId = auth.userId!;
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
    const auth = getAuth(req);
    const userId = auth.userId!;
    const user = await getOrCreateUser(userId);
    const plan = getUserPlan(user);

    if (plan === "expired") {
      res.status(429).json({ error: "Trial expired. Please subscribe to continue.", code: "TRIAL_EXPIRED" });
      return;
    }

    const threads: Array<{ subject: string; fromName: string; snippet: string; isUnread: boolean }> = req.body?.threads || [];

    if (!threads.length) {
      res.json({ digest: "Your inbox is empty — enjoy the silence! 🌿" });
      return;
    }

    const unread = threads.filter((t) => t.isUnread).slice(0, 20);
    const allItems = (unread.length ? unread : threads.slice(0, 20)).map((t) =>
      `• "${t.subject}" from ${t.fromName}: ${t.snippet?.slice(0, 120) || ""}`
    ).join("\n");

    const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    const completion = await openai.chat.completions.create({
      model: AGENT_MODEL,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: `You are ReplyAI, an AI secretary. Generate a structured Daily Briefing from the inbox snapshot below.

Use this exact format (plain text, no markdown syntax like ** or ##):

Daily Briefing — ${today}

INBOX STATUS
One calm, direct sentence on the overall inbox state.

REPLY NOW  (blocking someone or time-sensitive)
• [Sender] — [Subject]: one-line action needed
(Omit this section if none)

REPLY TODAY
• [Sender] — [Subject]: one-line action needed
(List 2-4 items max)

FYI / ARCHIVE
• [Sender] — [Subject]: why it can wait
(List 1-3 items max)

HEADS UP
One sentence flagging any deadlines, travel, or prep needed based on the emails.

Rules:
- BLUF: bottom line up front in every bullet
- Each bullet must be specific to an actual email, not generic
- Max 180 words total
- Plain text only — no asterisks, no pound signs, no markdown`,
        },
        { role: "user", content: `Inbox snapshot (${threads.length} threads, ${unread.length} unread):\n${allItems}` },
      ],
    });

    const digest = completion.choices[0]?.message?.content?.trim() || "";
    res.json({ digest });
  } catch (err) {
    req.log.error({ err }, "Error generating digest");
    res.status(500).json({ error: "Failed to generate digest" });
  }
});

export default router;
