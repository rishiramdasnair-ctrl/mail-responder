import { Router } from "express";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../lib/requireAuth";
import { getGmailClientForUser, getCalendarClientForUser, parseEmailAddress, getHeader, decodeBody } from "../lib/gmailClient";
import { openai } from "@workspace/integrations-openai-ai-server";
import { AgentRunBody as AgentRunBodySchema, AgentSendBody as AgentSendBodySchema } from "@workspace/api-zod";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionAssistantMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources";

const router = Router();

type AgentRunBody = {
  task: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
};

interface AgentStep {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  status: "success" | "error";
}

interface PendingEmail {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_emails",
      description: "Search Gmail for emails matching a query. Returns list of matching threads with subject, sender, date, and snippet.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Gmail search query (e.g. 'from:john@example.com', 'subject:invoice', 'United flight confirmation')" },
          maxResults: { type: "number", description: "Max number of results to return. Default 10." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_email",
      description: "Read the full content of an email thread by its thread ID.",
      parameters: {
        type: "object",
        properties: {
          threadId: { type: "string", description: "The Gmail thread ID to read" },
        },
        required: ["threadId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Compose and send an email. Always present the email content to the user for confirmation before calling this tool. Only call this when the user has already approved the content.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body content (plain text)" },
          threadId: { type: "string", description: "Optional: thread ID to reply within" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_calendar_events",
      description: "List upcoming Google Calendar events for the next N days.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Number of days to look ahead. Default 7." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Create a new event in Google Calendar.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          start: { type: "string", description: "Start time in ISO 8601 format (e.g. 2025-01-15T10:00:00)" },
          end: { type: "string", description: "End time in ISO 8601 format" },
          description: { type: "string", description: "Optional event description" },
          location: { type: "string", description: "Optional event location" },
          attendees: { type: "array", items: { type: "string" }, description: "Optional list of attendee email addresses" },
        },
        required: ["title", "start", "end"],
      },
    },
  },
];

async function executeSearchEmails(userId: string, args: { query: string; maxResults?: number }): Promise<string> {
  const gmail = await getGmailClientForUser(userId);
  const listRes = await gmail.users.threads.list({
    userId: "me",
    q: args.query,
    maxResults: Math.min(args.maxResults || 10, 20),
  });
  const threads = listRes.data.threads || [];
  if (!threads.length) return "No emails found matching that query.";

  const results = await Promise.all(threads.slice(0, 10).map(async (t) => {
    try {
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: t.id!,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });
      const lastMsg = thread.data.messages?.[thread.data.messages.length - 1];
      if (!lastMsg) return null;
      const headers = lastMsg.payload?.headers || [];
      const from = parseEmailAddress(getHeader(headers, "From")).email;
      const subject = getHeader(headers, "Subject");
      const date = getHeader(headers, "Date");
      const snippet = lastMsg.snippet?.slice(0, 120) || "";
      return `- Thread ID: ${t.id}\n  From: ${from}\n  Subject: ${subject}\n  Date: ${date}\n  Snippet: ${snippet}`;
    } catch {
      return null;
    }
  }));
  return results.filter(Boolean).join("\n\n") || "Could not fetch thread details.";
}

async function executeReadEmail(userId: string, args: { threadId: string }): Promise<string> {
  const gmail = await getGmailClientForUser(userId);
  const thread = await gmail.users.threads.get({
    userId: "me",
    id: args.threadId,
    format: "full",
  });
  const messages = thread.data.messages || [];
  if (!messages.length) return "No messages found in this thread.";

  const parts = messages.map((msg) => {
    const headers = msg.payload?.headers || [];
    const from = getHeader(headers, "From");
    const subject = getHeader(headers, "Subject");
    const date = getHeader(headers, "Date");
    const body = decodeBody(msg.payload).slice(0, 2000);
    return `From: ${from}\nSubject: ${subject}\nDate: ${date}\n\n${body}`;
  });
  return parts.join("\n\n---\n\n");
}

async function executeListCalendarEvents(userId: string, args: { days?: number }): Promise<string> {
  const calendar = await getCalendarClientForUser(userId);
  const now = new Date();
  const end = new Date(now.getTime() + (args.days || 7) * 24 * 60 * 60 * 1000);
  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 20,
  });
  const events = response.data.items || [];
  if (!events.length) return `No calendar events found in the next ${args.days || 7} days.`;
  return events.map((e) => {
    const start = e.start?.dateTime || e.start?.date || "unknown";
    const attendees = (e.attendees || []).map((a) => a.email).filter(Boolean).join(", ");
    return `- ${start}: ${e.summary || "(No title)"}${e.location ? ` @ ${e.location}` : ""}${attendees ? `\n  Attendees: ${attendees}` : ""}`;
  }).join("\n");
}

async function executeCreateCalendarEvent(userId: string, args: {
  title: string; start: string; end: string;
  description?: string; location?: string; attendees?: string[];
}): Promise<string> {
  const calendar = await getCalendarClientForUser(userId);
  const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const event = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: args.title,
      description: args.description,
      location: args.location,
      start: isDateOnly(args.start) ? { date: args.start } : { dateTime: args.start },
      end: isDateOnly(args.end) ? { date: args.end } : { dateTime: args.end },
      attendees: args.attendees?.map((email) => ({ email })),
    },
  });
  return `Event created: "${event.data.summary}" on ${event.data.start?.dateTime || event.data.start?.date}. Link: ${event.data.htmlLink}`;
}

router.post("/agent/run", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth.userId!;

    const parsed = AgentRunBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid request body" });
      return;
    }
    const { task, history: rawHistory = [] } = parsed.data;
    if (task.length > 2000) {
      res.status(400).json({ error: "task must be under 2000 characters" });
      return;
    }
    const history: AgentRunBody["history"] = rawHistory.slice(-20);

    const steps: AgentStep[] = [];
    let pendingEmail: PendingEmail | undefined;

    const systemPrompt = `You are ReplyAI Agent, an autonomous AI assistant with access to the user's Gmail and Google Calendar.

Your job is to complete tasks autonomously using the provided tools. Think step by step:
1. Use search_emails to find relevant emails before reading them
2. Use read_email to get full content when needed
3. SCHEDULING RULE (mandatory): Before suggesting any meeting times, proposing availability, or drafting any scheduling-related reply, you MUST first call list_calendar_events. Only suggest times that do NOT conflict with existing events. If you skip this step, your scheduling suggestions will be wrong.
4. For send_email: first draft the email content clearly, then call send_email — the user will confirm before it's sent
5. Use create_calendar_event only when explicitly asked to add something to the calendar

Be concise but informative. Explain what you found and what actions you took.`;

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.map((h): ChatCompletionMessageParam => ({ role: h.role, content: h.content })),
      { role: "user", content: task },
    ];

    const MAX_ITERATIONS = 8;
    let iteration = 0;
    let finalAnswer = "";

    while (iteration < MAX_ITERATIONS) {
      iteration++;
      const completion = await openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 2048,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
      });

      const choice = completion.choices[0];
      const message = choice.message;
      const assistantMsg: ChatCompletionAssistantMessageParam = {
        role: "assistant",
        content: message.content ?? null,
        ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
      };
      messages.push(assistantMsg);

      if (!message.tool_calls || message.tool_calls.length === 0) {
        finalAnswer = message.content || "";
        break;
      }

      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          args = {};
        }

        let toolOutput = "";
        let status: "success" | "error" = "success";

        try {
          if (toolName === "search_emails") {
            toolOutput = await executeSearchEmails(userId, args as { query: string; maxResults?: number });
          } else if (toolName === "read_email") {
            toolOutput = await executeReadEmail(userId, args as { threadId: string });
          } else if (toolName === "send_email") {
            const emailArgs = args as { to: string; subject: string; body: string; threadId?: string };
            pendingEmail = {
              to: emailArgs.to,
              subject: emailArgs.subject,
              body: emailArgs.body,
              threadId: emailArgs.threadId,
            };
            toolOutput = "Email queued for user confirmation. Present the email content to the user and ask them to confirm sending.";
          } else if (toolName === "list_calendar_events") {
            toolOutput = await executeListCalendarEvents(userId, args as { days?: number });
          } else if (toolName === "create_calendar_event") {
            toolOutput = await executeCreateCalendarEvent(userId, args as {
              title: string; start: string; end: string;
              description?: string; location?: string; attendees?: string[];
            });
          } else {
            toolOutput = `Unknown tool: ${toolName}`;
            status = "error";
          }
        } catch (toolErr: unknown) {
          const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
          toolOutput = `Error: ${errMsg}`;
          status = "error";
        }

        steps.push({ toolName, input: args, output: toolOutput, status });
        const toolMsg: ChatCompletionToolMessageParam = {
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolOutput,
        };
        messages.push(toolMsg);

        if (pendingEmail) break;
      }

      if (pendingEmail) {
        const lastMsg = messages[messages.length - 1];
        if (!("content" in lastMsg) || lastMsg.role !== "assistant") {
          const pendingCompletion = await openai.chat.completions.create({
            model: "gpt-5.2",
            max_completion_tokens: 512,
            messages,
          });
          finalAnswer = pendingCompletion.choices[0]?.message?.content || "I've drafted an email for you. Please review and confirm.";
        } else {
          finalAnswer = "I've drafted an email for you. Please review and confirm sending it.";
        }
        break;
      }
    }

    if (!finalAnswer) {
      finalAnswer = "I completed the task but couldn't generate a summary.";
    }

    res.json({
      answer: finalAnswer,
      steps,
      ...(pendingEmail ? { pendingEmail } : {}),
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err }, "Agent run error");
    if (errMsg.includes("not connected") || errMsg.includes("Not connected")) {
      res.status(403).json({ error: "Gmail not connected. Please connect your Google account in Settings.", code: "NOT_CONNECTED" });
      return;
    }
    res.status(500).json({ error: "Agent task failed. Please try again." });
  }
});

router.post("/agent/send", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth.userId!;
    const sendParsed = AgentSendBodySchema.safeParse(req.body);
    if (!sendParsed.success) {
      res.status(400).json({ error: sendParsed.error.errors[0]?.message ?? "Invalid request body" });
      return;
    }
    const { to, subject, body, threadId } = sendParsed.data;

    const gmail = await getGmailClientForUser(userId);
    const profile = await gmail.users.getProfile({ userId: "me" });
    const fromEmail = profile.data.emailAddress || "";

    const subjectLine = threadId && !subject.startsWith("Re:")
      ? `Re: ${subject}`
      : subject;

    const emailLines = [
      `From: ${fromEmail}`,
      `To: ${to}`,
      `Subject: ${subjectLine}`,
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
  } catch (err: unknown) {
    req.log.error({ err }, "Agent send error");
    res.status(500).json({ error: "Failed to send email" });
  }
});

export default router;
