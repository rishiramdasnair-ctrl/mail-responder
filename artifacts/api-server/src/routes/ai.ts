import { Router, Request } from "express";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../lib/requireAuth";
import { getOrCreateUser, getUserPlan, getRepliesLimit } from "../lib/getOrCreateUser";
import { GenerateRepliesBody } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { usersTable, replyHistoryTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
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

    const systemPrompt = `You are ReplyAI, an expert email assistant. Generate 3 distinct reply suggestions for the given email.
For each reply, provide:
1. A "pro" tone: Professional, formal, complete
2. A "casual" tone: Friendly, conversational, warm
3. A "fast" tone: Ultra-brief, 1-3 sentences max

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
      model: "gpt-5.2",
      max_completion_tokens: 2048,
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

    const { threadId, emailBody, emailFrom, emailSubject, customInstruction } = req.body as {
      threadId?: string;
      emailBody?: string;
      emailFrom?: string;
      emailSubject?: string;
      customInstruction?: string;
    };

    if (!emailBody && !customInstruction) {
      res.status(400).json({ error: "emailBody is required" });
      return;
    }

    const emailCtx = `Email from: ${emailFrom || "unknown"}
Subject: ${emailSubject || "(no subject)"}
Message:
${(emailBody || "").slice(0, 3000)}`;

    let systemPrompt: string;
    let userMessage: string;

    if (customInstruction) {
      systemPrompt = `You are ReplyAI, an expert email assistant. The user wants to take a specific action on an email. Generate a draft reply that follows their instruction exactly.

Respond ONLY with a valid JSON object in this exact format:
{
  "actions": [
    {
      "id": "1",
      "label": "<short action label, max 8 words>",
      "description": "<one sentence explaining what this will do>",
      "type": "reply",
      "draftContent": "<the full draft reply text, plain text, no markdown>"
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
      model: "gpt-4o-mini",
      max_completion_tokens: 2048,
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

    const actions = (parsed.actions || [])
      .filter((a: ProposedAction) => a.id && a.label && a.type && ACTION_TYPES.includes(a.type))
      .slice(0, 5);

    res.json({ actions, threadId });
  } catch (err) {
    req.log.error({ err }, "Error generating AI actions");
    res.status(500).json({ error: "Failed to generate actions" });
  }
});

export default router;
