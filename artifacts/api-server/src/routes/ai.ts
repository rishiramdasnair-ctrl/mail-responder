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
        id: crypto.randomUUID(),
        userId,
        threadId: body.threadId,
        emailSubject: body.emailSubject,
        emailFrom: body.emailFrom,
        tone: "pro",
        content: lastMsg.content,
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

export default router;
