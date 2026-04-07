import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { openrouter as openai, FAST_MODEL } from "../lib/openrouter";

const router = Router();

interface SlackConnectorConfig {
  accessToken: string;
  teamId?: string | null;
  teamName?: string;
}

async function getSlackToken(userId: string): Promise<string | null> {
  const rows = await db
    .select({ config: connectorsTable.config })
    .from(connectorsTable)
    .where(and(
      eq(connectorsTable.userId, userId),
      eq(connectorsTable.connectorId, "slack"),
      eq(connectorsTable.status, "connected"),
    ))
    .limit(1);

  if (!rows.length) return null;
  const config = rows[0].config as SlackConnectorConfig | null;
  return config?.accessToken ?? null;
}

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  num_members?: number;
}

router.get("/slack/channels", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const token = await getSlackToken(userId);
  if (!token) {
    res.status(404).json({ connected: false, channels: [] });
    return;
  }

  try {
    const chanRes = await fetch(
      "https://slack.com/api/conversations.list?exclude_archived=true&types=public_channel&limit=200",
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const data = await chanRes.json() as {
      ok: boolean;
      error?: string;
      channels?: SlackChannel[];
    };

    if (!data.ok) {
      console.error("[slack/channels] API error:", data.error);
      res.status(500).json({ error: "Failed to list channels" });
      return;
    }

    const channels = (data.channels ?? []).map(c => ({
      id: c.id,
      name: c.name,
      isPrivate: c.is_private,
      memberCount: c.num_members ?? 0,
    }));

    res.json({ connected: true, channels });
  } catch (err) {
    console.error("[slack/channels] error:", err);
    res.status(500).json({ error: "Failed to list channels" });
  }
});

router.post("/slack/summarize", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const token = await getSlackToken(userId);
  if (!token) {
    res.status(400).json({ error: "Slack not connected" });
    return;
  }

  const { subject, messages } = req.body as {
    subject?: string;
    messages?: Array<{ from: string; date: string; body: string }>;
  };

  if (!messages || messages.length === 0) {
    res.status(400).json({ error: "messages are required" });
    return;
  }

  try {
    const threadContent = messages
      .map(m => `From: ${m.from}\nDate: ${m.date}\n\n${m.body}`)
      .join("\n\n---\n\n");

    const systemPrompt = `You are a helpful assistant that creates concise Slack-ready summaries of email threads. 
Write a clear, professional summary (3-5 sentences) that captures:
- The main topic and purpose of the thread
- Key decisions or action items mentioned
- Who the key participants are
- Current status or next steps if apparent
Format it for Slack with clean, readable text (no markdown except for *bold* emphasis on key points).`;

    const userPrompt = `Summarize this email thread for sharing in Slack.

Subject: ${subject ?? "(No subject)"}

Thread:
${threadContent}`;

    const completion = await openai.chat.completions.create({
      model: FAST_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 300,
      temperature: 0.4,
    });

    const summary = completion.choices[0]?.message?.content?.trim() ?? "";

    res.json({ summary });
  } catch (err) {
    console.error("[slack/summarize] error:", err);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

router.post("/slack/send", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const { channelId, channelName, summary, threadSubject } = req.body as {
    channelId: string;
    channelName?: string;
    summary: string;
    threadSubject?: string;
  };

  if (!channelId || !summary) {
    res.status(400).json({ error: "channelId and summary are required" });
    return;
  }

  const token = await getSlackToken(userId);
  if (!token) {
    res.status(400).json({ error: "Slack not connected" });
    return;
  }

  try {
    const text = threadSubject
      ? `*Email Thread: ${threadSubject}*\n\n${summary}`
      : summary;

    const sendRes = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: channelId,
        text,
        unfurl_links: false,
        unfurl_media: false,
      }),
    });

    const data = await sendRes.json() as { ok: boolean; error?: string; ts?: string };

    if (!data.ok) {
      console.error("[slack/send] API error:", data.error);
      res.status(500).json({ error: `Failed to send to Slack: ${data.error ?? "unknown error"}` });
      return;
    }

    res.json({ success: true, ts: data.ts, channel: channelName ?? channelId });
  } catch (err) {
    console.error("[slack/send] error:", err);
    res.status(500).json({ error: "Failed to send to Slack" });
  }
});

export default router;
