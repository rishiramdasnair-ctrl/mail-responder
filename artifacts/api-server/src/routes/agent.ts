import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getReqUserId } from "../lib/getReqAuth";
import { getGmailClientForUser, getCalendarClientForUser, parseEmailAddress, getHeader, decodeBody } from "../lib/gmailClient";
import { createBrowserSession, getPageSnapshot, extractDdgResults } from "../lib/browserManager";
import { isUrlSafe, resolveAndCheckUrl } from "../lib/urlSafety";
import { openrouter as openai, AGENT_MODEL, FAST_MODEL } from "../lib/openrouter";
import { getTeamsToken, teamsGet, teamsPost } from "../lib/teamsClient";
import { AgentRunBody as AgentRunBodySchema, AgentSendBody as AgentSendBodySchema } from "@workspace/api-zod";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionAssistantMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources";
import { db } from "@workspace/db";
import { agentConversations, agentMessages } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";

const router = Router();

/** Escape a value for use inside a CSS attribute selector `[attr*="..."]`. */
function escapeCssAttrValue(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Escape a string so it can safely be passed to `new RegExp(...)`. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function validateBrowseUrl(rawUrl: string): Promise<{ ok: true; url: URL } | { ok: false; reason: string }> {
  const check = await resolveAndCheckUrl(rawUrl);
  if (!check.safe) {
    return { ok: false, reason: check.reason ?? "URL is not permitted." };
  }
  return { ok: true, url: new URL(rawUrl) };
}

type AgentRunBody = {
  task: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
};

interface AgentStep {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  status: "success" | "error";
  url?: string;
  screenshot?: string;
}

interface PendingEmail {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}

interface PendingCalendarEvent {
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
}

interface AgentJob {
  userId: string;
  status: "running" | "done" | "error";
  steps: AgentStep[];
  answer: string;
  pendingEmail?: PendingEmail;
  pendingCalendarEvent?: PendingCalendarEvent;
  sessionId?: string;
  browserSessionActive?: boolean;
  error?: string;
  createdAt: number;
}

const jobStore = new Map<string, AgentJob>();
setInterval(() => {
  const cutoff = Date.now() - 3_600_000;
  for (const [id, job] of jobStore.entries()) {
    if (job.createdAt < cutoff) jobStore.delete(id);
  }
}, 300_000);

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
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the web for a query and return top result URLs and titles. Use this when you need to find a website URL before browsing it.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query (e.g. 'United Airlines check in', 'Delta flight status')" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browse_url",
      description: "Navigate a browser to a URL and return a readable version of the page content including visible text and interactive elements (buttons, links, inputs). Opens a new browser session.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The full URL to navigate to (must start with http:// or https://)" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_page_state",
      description: "Get the current state of the browser page — the current URL and a snapshot of visible text and interactive elements. Use this after clicking or typing to confirm what happened.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "click_element",
      description: "Click an element on the current browser page by matching a human description to the element's text, label, or role.",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "Human description of the element to click (e.g. 'Check In button', 'Continue link', 'Submit form button')" },
        },
        required: ["description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "type_text",
      description: "Locate a form field on the current browser page by description and type text into it.",
      parameters: {
        type: "object",
        properties: {
          field_description: { type: "string", description: "Human description of the form field (e.g. 'Last name field', 'Confirmation number input', 'Email address')" },
          text: { type: "string", description: "The text to type into the field" },
        },
        required: ["field_description", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "drive_search",
      description: "Search the user's Google Drive for files by name.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term to find files by name" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "drive_list",
      description: "List the user's most recently modified Google Drive files.",
      parameters: {
        type: "object",
        properties: {
          pageSize: { type: "number", description: "Number of files to return (default 20, max 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "drive_read",
      description: "Read the content of a Google Drive file (works best for Google Docs, Sheets, Slides, and text files).",
      parameters: {
        type: "object",
        properties: {
          fileId: { type: "string", description: "The Google Drive file ID" },
        },
        required: ["fileId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "teams_list_chats",
      description: "List the user's recent Microsoft Teams chats and direct message conversations.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "teams_send_message",
      description: "Send a direct message in a Microsoft Teams chat. Always confirm the message content with the user before sending.",
      parameters: {
        type: "object",
        properties: {
          chatId: { type: "string", description: "The Teams chat ID to send the message to" },
          content: { type: "string", description: "The message content to send" },
        },
        required: ["chatId", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "teams_list_teams",
      description: "List the Microsoft Teams teams and groups the user belongs to.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "teams_list_channels",
      description: "List the channels in a specific Microsoft Teams team.",
      parameters: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "The Teams team ID" },
        },
        required: ["teamId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "teams_post_to_channel",
      description: "Post a message to a Microsoft Teams channel. Always confirm the message content with the user before posting.",
      parameters: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "The Teams team ID" },
          channelId: { type: "string", description: "The Teams channel ID" },
          content: { type: "string", description: "The message content to post" },
          subject: { type: "string", description: "Optional subject/headline for the channel post" },
        },
        required: ["teamId", "channelId", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "teams_reply_to_thread",
      description: "Reply to a specific message thread in a Microsoft Teams channel.",
      parameters: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "The Teams team ID" },
          channelId: { type: "string", description: "The Teams channel ID" },
          messageId: { type: "string", description: "The message ID to reply to" },
          content: { type: "string", description: "The reply content" },
        },
        required: ["teamId", "channelId", "messageId", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "teams_create_meeting",
      description: "Create a Microsoft Teams online meeting. Always confirm details with the user first.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Meeting subject/title" },
          startDateTime: { type: "string", description: "Start time in ISO 8601 format (e.g. 2025-01-15T10:00:00)" },
          endDateTime: { type: "string", description: "End time in ISO 8601 format" },
          attendees: {
            type: "array",
            items: { type: "object", properties: { email: { type: "string" }, displayName: { type: "string" } } },
            description: "Optional list of attendees",
          },
        },
        required: ["subject", "startDateTime", "endDateTime"],
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
    const body = decodeBody(msg.payload).body.slice(0, 2000);
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

function decodeDdgUrl(href: string): string {
  try {
    let fullHref = href;
    if (href.startsWith("//")) fullHref = `https:${href}`;
    const parsed = new URL(fullHref);
    const uddg = parsed.searchParams.get("uddg");
    if (uddg) {
      const decoded = decodeURIComponent(uddg);
      if (decoded.startsWith("http://") || decoded.startsWith("https://")) return decoded;
    }
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch {
    /* fall through */
  }
  return "";
}

async function executeSearchWeb(args: { query: string }): Promise<string> {
  const encodedQuery = encodeURIComponent(args.query);
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

  const session = await createBrowserSession();
  try {
    await session.page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    const rawResults = await extractDdgResults(session.page);

    const results = rawResults
      .map((r) => ({ title: r.title, url: decodeDdgUrl(r.href), snippet: r.snippet }))
      .filter((r) => r.url && isUrlSafe(r.url))
      .slice(0, 8);

    if (!results.length) return "No search results found.";
    return results.map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`).join("\n\n");
  } finally {
    await session.close();
  }
}

type PageSessions = Map<string, { page: import("playwright").Page; context: import("playwright").BrowserContext; close: () => Promise<void> }>;

const activeSessions: PageSessions = new Map();

async function getOrCreateSession(sessionId: string) {
  if (!activeSessions.has(sessionId)) {
    const session = await createBrowserSession();
    activeSessions.set(sessionId, session);
  }
  return activeSessions.get(sessionId)!;
}

function cleanupSession(sessionId: string) {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.close().catch(() => {});
    activeSessions.delete(sessionId);
  }
}

interface AgentCoreResult {
  answer: string;
  steps: AgentStep[];
  pendingEmail?: PendingEmail;
  pendingCalendarEvent?: PendingCalendarEvent;
  sessionId: string;
  browserWasUsed: boolean;
}

async function runAgentCore(
  userId: string,
  task: string,
  history: AgentRunBody["history"],
  incomingSessionId: string | undefined,
  onStep?: (step: AgentStep) => void,
  onToken?: (token: string) => void,
): Promise<AgentCoreResult> {
    const steps: AgentStep[] = [];
    let pendingEmail: PendingEmail | undefined;
    let pendingCalendarEvent: PendingCalendarEvent | undefined;
    const sessionId = incomingSessionId && activeSessions.has(incomingSessionId)
      ? incomingSessionId
      : `${userId}-${randomUUID()}`;
    let browserStepCount = 0;
    let browserWasUsed = false;
    const MAX_BROWSER_STEPS = 10;

    const systemPrompt = `You are ReplyAI — an AI secretary with access to the user's Gmail, Google Calendar, and a web browser. You help manage email, calendar scheduling, task tracking, and daily productivity workflows.

SECRETARY PRINCIPLES:
- Communicate like a helpful human assistant, not a developer tool. No technical jargon.
- Email drafts follow BLUF (Bottom Line Up Front): state the key ask in the first sentence, then add brief context. 5 sentences max unless a longer doc is clearly needed.
- When triaging emails, classify each as: REPLY-NOW (someone is blocked), REPLY-TODAY (needs reply today), DECISION (user must choose — summarize options, don't draft), FYI (archive-safe).
- For scheduling: always check calendar first. Offer 3 specific time slots with timezone. Default to 25 or 50 min meetings (not 30/60) to build in buffer.
- CALENDAR SAFETY: Never create or modify a calendar event without explicit user confirmation. Read calendar freely; write only after user says yes.

EMAIL & CALENDAR RULES:
1. Use search_emails to find relevant emails before reading them
2. Use read_email to get full content when needed
3. SCHEDULING RULE (mandatory): Before suggesting any meeting times or drafting any scheduling reply, you MUST call list_calendar_events first. Only suggest times that don't conflict.
4. For send_email: draft the content first, then call send_email — the user confirms before anything is sent
5. Use create_calendar_event only when explicitly asked and confirmed by the user

WEB BROWSING:
6. Use search_web to find URLs when you don't know them (e.g. airline check-in pages)
7. Use browse_url to navigate and read page content
8. Use get_page_state after each interaction to see the updated state
9. Use click_element and type_text to interact with forms
10. BROWSER LIMIT: Stop and report back after ${MAX_BROWSER_STEPS} browser interactions
11. For flight check-in: search_emails first for the booking reference, then search_web for the check-in page

Be concise but informative. Explain what you found and what actions you took, in plain language.`;

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.map((h): ChatCompletionMessageParam => ({ role: h.role, content: h.content })),
      { role: "user", content: task },
    ];

    const MAX_ITERATIONS = 15;
    let iteration = 0;
    let finalAnswer = "";

    try {
      while (iteration < MAX_ITERATIONS) {
        iteration++;

        let iterContent: string | null = null;
        let iterToolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> | undefined;

        if (onToken) {
          const streamComp = await openai.chat.completions.create({
            model: AGENT_MODEL,
            max_tokens: 2048,
            messages,
            tools: TOOLS,
            tool_choice: "auto",
            stream: true,
          });
          let streamedContent = "";
          const tcMap = new Map<number, { id: string; name: string; args: string }>();
          for await (const chunk of streamComp) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;
            if (delta.content) { streamedContent += delta.content; onToken(delta.content); }
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!tcMap.has(idx)) tcMap.set(idx, { id: "", name: "", args: "" });
                const acc = tcMap.get(idx)!;
                if (tc.id) acc.id = tc.id;
                if (tc.function?.name) acc.name += tc.function.name;
                if (tc.function?.arguments) acc.args += tc.function.arguments;
              }
            }
          }
          iterContent = streamedContent || null;
          if (tcMap.size > 0) {
            iterToolCalls = Array.from(tcMap.entries())
              .sort(([a], [b]) => a - b)
              .map(([, tc]) => ({ id: tc.id, type: "function" as const, function: { name: tc.name, arguments: tc.args } }));
          }
        } else {
          const completion = await openai.chat.completions.create({
            model: AGENT_MODEL,
            max_tokens: 1200,
            messages,
            tools: TOOLS,
            tool_choice: "auto",
          });
          const message = completion.choices[0].message;
          iterContent = message.content ?? null;
          if (message.tool_calls?.length) {
            iterToolCalls = message.tool_calls.map(tc => ({ id: tc.id, type: "function" as const, function: tc.function }));
          }
        }

        const assistantMsg: ChatCompletionAssistantMessageParam = {
          role: "assistant",
          content: iterContent,
          ...(iterToolCalls ? { tool_calls: iterToolCalls } : {}),
        };
        messages.push(assistantMsg);

        if (!iterToolCalls || iterToolCalls.length === 0) {
          finalAnswer = iterContent || "";
          break;
        }

        for (const toolCall of iterToolCalls) {
          const toolName = toolCall.function.name;
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(toolCall.function.arguments || "{}");
          } catch {
            args = {};
          }

          let toolOutput = "";
          let status: "success" | "error" = "success";
          let stepUrl: string | undefined;

          // search_web is a browser helper but doesn't count toward the interaction step limit
          const isBrowserTool = ["browse_url", "get_page_state", "click_element", "type_text"].includes(toolName);

          if (isBrowserTool && browserStepCount >= MAX_BROWSER_STEPS) {
            toolOutput = `Browser step limit (${MAX_BROWSER_STEPS}) reached. Stopping web browsing.`;
            status = "error";
          } else {
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
                const calArgs = args as { title: string; start: string; end: string; description?: string; location?: string; attendees?: string[] };
                pendingCalendarEvent = {
                  title: calArgs.title,
                  start: calArgs.start,
                  end: calArgs.end,
                  ...(calArgs.description ? { description: calArgs.description } : {}),
                  ...(calArgs.location ? { location: calArgs.location } : {}),
                  ...(calArgs.attendees?.length ? { attendees: calArgs.attendees } : {}),
                };
                toolOutput = "Calendar event queued for user confirmation. Present the event details to the user and ask them to confirm creating it.";
              } else if (toolName === "search_web") {
                toolOutput = await executeSearchWeb(args as { query: string });
              } else if (toolName === "browse_url") {
                browserStepCount++;
                const browseArgs = args as { url: string };
                const urlCheck = await validateBrowseUrl(browseArgs.url);
                if (!urlCheck.ok) {
                  toolOutput = `Cannot browse that URL: ${urlCheck.reason}`;
                  status = "error";
                } else {
                  stepUrl = browseArgs.url;
                  const session = await getOrCreateSession(sessionId);
                  await session.page.goto(urlCheck.url.href, { waitUntil: "domcontentloaded", timeout: 20000 });
                  const finalUrl = session.page.url();
                  if (!isUrlSafe(finalUrl)) {
                    await session.page.goto("about:blank").catch(() => {});
                    toolOutput = `Navigation was blocked: the page redirected to a disallowed address (${finalUrl}).`;
                    status = "error";
                  } else {
                    toolOutput = await getPageSnapshot(session.page);
                    stepUrl = finalUrl;
                  }
                }
              } else if (toolName === "get_page_state") {
                browserStepCount++;
                const session = activeSessions.get(sessionId);
                if (!session) {
                  toolOutput = "No active browser session. Use browse_url to open a page first.";
                  status = "error";
                } else {
                  toolOutput = await getPageSnapshot(session.page);
                  stepUrl = session.page.url();
                }
              } else if (toolName === "click_element") {
                browserStepCount++;
                const clickArgs = args as { description: string };
                const session = activeSessions.get(sessionId);
                if (!session) {
                  toolOutput = "No active browser session. Use browse_url first.";
                  status = "error";
                } else {
                  stepUrl = session.page.url();
                  const rawDesc = clickArgs.description;
                  if (!rawDesc || !rawDesc.trim()) {
                    toolOutput = "click_element requires a non-empty description.";
                    status = "error";
                  } else {
                    const ROLE_WORDS = /\b(button|link|the|a|an|click|on|press|tap|submit|form|element|item|option)\b/gi;
                    const normalizedDesc = rawDesc.replace(ROLE_WORDS, "").replace(/\s+/g, " ").trim() || rawDesc.trim();
                    const descRegex = new RegExp(normalizedDesc.split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".{0,20}"), "i");
                    let clicked = false;

                    const locators = [
                      session.page.getByRole("button", { name: new RegExp(escapeRegex(normalizedDesc), "i") }),
                      session.page.getByRole("link", { name: new RegExp(escapeRegex(normalizedDesc), "i") }),
                      session.page.getByRole("button", { name: descRegex }),
                      session.page.getByRole("link", { name: descRegex }),
                      session.page.getByText(new RegExp(escapeRegex(normalizedDesc), "i")),
                      session.page.getByText(descRegex),
                      session.page.locator(`[aria-label*="${escapeCssAttrValue(normalizedDesc)}" i]`),
                      session.page.locator(`[title*="${escapeCssAttrValue(normalizedDesc)}" i]`),
                      session.page.locator(`[value*="${escapeCssAttrValue(normalizedDesc)}" i]`),
                    ];

                    for (const locator of locators) {
                      try {
                        const count = await locator.count();
                        if (count > 0) {
                          await locator.first().click({ timeout: 5000 });
                          clicked = true;
                          break;
                        }
                      } catch {
                        continue;
                      }
                    }

                    if (clicked) {
                      await session.page.waitForLoadState("domcontentloaded").catch(() => {});
                      toolOutput = await getPageSnapshot(session.page);
                      stepUrl = session.page.url();
                    } else {
                      toolOutput = `Could not find element matching "${rawDesc}". Try get_page_state to see available elements.`;
                      status = "error";
                    }
                  }
                }
              } else if (toolName === "type_text") {
                browserStepCount++;
                const typeArgs = args as { field_description: string; text: string };
                const session = activeSessions.get(sessionId);
                if (!session) {
                  toolOutput = "No active browser session. Use browse_url first.";
                  status = "error";
                } else {
                  stepUrl = session.page.url();
                  const fieldDesc = typeArgs.field_description;
                  if (!fieldDesc || !fieldDesc.trim()) {
                    toolOutput = "type_text requires a non-empty field_description.";
                    status = "error";
                  } else {
                    const FIELD_ROLE_WORDS = /\b(field|input|box|form|entry|area|the|a|an|text|enter|type|fill)\b/gi;
                    const normalizedField = fieldDesc.replace(FIELD_ROLE_WORDS, "").replace(/\s+/g, " ").trim() || fieldDesc.trim();
                    const fieldKey = normalizedField.toLowerCase().replace(/\s+/g, "");
                    const fieldRegex = new RegExp(normalizedField.split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".{0,15}"), "i");
                    let typed = false;

                    const fieldLocators = [
                      session.page.getByLabel(new RegExp(escapeRegex(normalizedField), "i")),
                      session.page.getByLabel(fieldRegex),
                      session.page.getByPlaceholder(new RegExp(escapeRegex(normalizedField), "i")),
                      session.page.getByPlaceholder(fieldRegex),
                      session.page.locator(`input[name*="${escapeCssAttrValue(fieldKey)}"]`),
                      session.page.locator(`input[id*="${escapeCssAttrValue(fieldKey)}"]`),
                      session.page.locator(`input[aria-label*="${escapeCssAttrValue(normalizedField)}" i]`),
                      session.page.locator(`textarea[name*="${escapeCssAttrValue(fieldKey)}"]`),
                      session.page.locator(`textarea[aria-label*="${escapeCssAttrValue(normalizedField)}" i]`),
                    ];

                    for (const locator of fieldLocators) {
                      try {
                        const count = await locator.count();
                        if (count > 0) {
                          await locator.first().clear();
                          await locator.first().fill(typeArgs.text);
                          typed = true;
                          break;
                        }
                      } catch {
                        continue;
                      }
                    }

                    if (typed) {
                      toolOutput = `Typed "${typeArgs.text}" into field "${fieldDesc}". Use get_page_state to see current form state.`;
                    } else {
                      toolOutput = `Could not find form field matching "${fieldDesc}". Try get_page_state to see available input fields.`;
                      status = "error";
                    }
                  }
                }
              } else if (toolName === "drive_search") {
                const a = args as { query: string };
                const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
                const r = await fetch(`https://${domain}/api/drive/search?q=${encodeURIComponent(a.query)}`, {
                  headers: { Cookie: req.headers.cookie ?? "", Authorization: req.headers.authorization ?? "" },
                });
                if (!r.ok) {
                  toolOutput = "Google Drive search failed. Make sure Google is connected.";
                } else {
                  const data = await r.json() as { files?: Array<{ id: string; name: string; mimeType: string; modifiedTime: string; webViewLink: string }> };
                  const files = data.files ?? [];
                  toolOutput = files.length
                    ? files.map(f => `ID: ${f.id} | Name: ${f.name} | Type: ${f.mimeType} | Modified: ${f.modifiedTime} | URL: ${f.webViewLink}`).join("\n")
                    : "No files found matching that query.";
                }
              } else if (toolName === "drive_list") {
                const a = args as { pageSize?: number };
                const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
                const r = await fetch(`https://${domain}/api/drive/list?pageSize=${a.pageSize ?? 20}`, {
                  headers: { Cookie: req.headers.cookie ?? "", Authorization: req.headers.authorization ?? "" },
                });
                if (!r.ok) {
                  toolOutput = "Could not list Drive files. Make sure Google is connected.";
                } else {
                  const data = await r.json() as { files?: Array<{ id: string; name: string; mimeType: string; modifiedTime: string; webViewLink: string }> };
                  const files = data.files ?? [];
                  toolOutput = files.length
                    ? files.map(f => `ID: ${f.id} | Name: ${f.name} | Type: ${f.mimeType} | Modified: ${f.modifiedTime} | URL: ${f.webViewLink}`).join("\n")
                    : "No files found.";
                }
              } else if (toolName === "drive_read") {
                const a = args as { fileId: string };
                const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
                const r = await fetch(`https://${domain}/api/drive/file/${encodeURIComponent(a.fileId)}`, {
                  headers: { Cookie: req.headers.cookie ?? "", Authorization: req.headers.authorization ?? "" },
                });
                if (!r.ok) {
                  toolOutput = "Could not read that Drive file.";
                } else {
                  const data = await r.json() as { file?: { name: string; mimeType: string; modifiedTime: string; webViewLink: string }; text?: string | null };
                  const f = data.file;
                  toolOutput = f ? `File: ${f.name}\nType: ${f.mimeType}\nModified: ${f.modifiedTime}\nURL: ${f.webViewLink}\n${data.text ? `\nContent:\n${data.text}` : "(binary file — content not readable as text)"}` : "File not found.";
                }
              } else if (toolName === "teams_list_chats") {
                const token = await getTeamsToken(userId);
                if (!token) {
                  toolOutput = "Microsoft Teams is not connected. Ask the user to connect Teams in Settings → Connectors.";
                } else {
                  const data = await teamsGet<{ value: Array<{ id: string; chatType: string; topic?: string; members?: Array<{ displayName?: string }> }> }>(token, "/me/chats?$expand=members&$top=30");
                  const chats = (data.value || []).map(c => {
                    const members = (c.members || []).map(m => m.displayName).filter(Boolean).join(", ");
                    return `ID: ${c.id} | Type: ${c.chatType}${c.topic ? ` | Topic: ${c.topic}` : ""}${members ? ` | With: ${members}` : ""}`;
                  });
                  toolOutput = chats.length ? chats.join("\n") : "No chats found.";
                }
              } else if (toolName === "teams_send_message") {
                const token = await getTeamsToken(userId);
                if (!token) {
                  toolOutput = "Microsoft Teams is not connected. Ask the user to connect Teams in Settings → Connectors.";
                } else {
                  const a = args as { chatId: string; content: string };
                  await teamsPost(token, `/me/chats/${a.chatId}/messages`, { body: { contentType: "text", content: a.content } });
                  toolOutput = `Message sent successfully to chat ${a.chatId}.`;
                }
              } else if (toolName === "teams_list_teams") {
                const token = await getTeamsToken(userId);
                if (!token) {
                  toolOutput = "Microsoft Teams is not connected. Ask the user to connect Teams in Settings → Connectors.";
                } else {
                  const data = await teamsGet<{ value: Array<{ id: string; displayName: string; description?: string }> }>(token, "/me/joinedTeams?$select=id,displayName,description");
                  const teams = (data.value || []).map(t => `ID: ${t.id} | Name: ${t.displayName}${t.description ? ` | ${t.description}` : ""}`);
                  toolOutput = teams.length ? teams.join("\n") : "No teams found.";
                }
              } else if (toolName === "teams_list_channels") {
                const token = await getTeamsToken(userId);
                if (!token) {
                  toolOutput = "Microsoft Teams is not connected. Ask the user to connect Teams in Settings → Connectors.";
                } else {
                  const a = args as { teamId: string };
                  const data = await teamsGet<{ value: Array<{ id: string; displayName: string; description?: string }> }>(token, `/teams/${a.teamId}/channels?$select=id,displayName,description`);
                  const channels = (data.value || []).map(c => `ID: ${c.id} | Name: ${c.displayName}${c.description ? ` | ${c.description}` : ""}`);
                  toolOutput = channels.length ? channels.join("\n") : "No channels found.";
                }
              } else if (toolName === "teams_post_to_channel") {
                const token = await getTeamsToken(userId);
                if (!token) {
                  toolOutput = "Microsoft Teams is not connected. Ask the user to connect Teams in Settings → Connectors.";
                } else {
                  const a = args as { teamId: string; channelId: string; content: string; subject?: string };
                  const body: Record<string, unknown> = { body: { contentType: "text", content: a.content } };
                  if (a.subject) body.subject = a.subject;
                  await teamsPost(token, `/teams/${a.teamId}/channels/${a.channelId}/messages`, body);
                  toolOutput = `Posted successfully to channel ${a.channelId}.`;
                }
              } else if (toolName === "teams_reply_to_thread") {
                const token = await getTeamsToken(userId);
                if (!token) {
                  toolOutput = "Microsoft Teams is not connected. Ask the user to connect Teams in Settings → Connectors.";
                } else {
                  const a = args as { teamId: string; channelId: string; messageId: string; content: string };
                  await teamsPost(token, `/teams/${a.teamId}/channels/${a.channelId}/messages/${a.messageId}/replies`, { body: { contentType: "text", content: a.content } });
                  toolOutput = `Reply sent successfully.`;
                }
              } else if (toolName === "teams_create_meeting") {
                const token = await getTeamsToken(userId);
                if (!token) {
                  toolOutput = "Microsoft Teams is not connected. Ask the user to connect Teams in Settings → Connectors.";
                } else {
                  const a = args as { subject: string; startDateTime: string; endDateTime: string; attendees?: Array<{ email: string; displayName?: string }> };
                  const meeting = await teamsPost<{ joinWebUrl?: string; subject?: string; id?: string }>(token, "/me/onlineMeetings", { subject: a.subject, startDateTime: a.startDateTime, endDateTime: a.endDateTime });
                  toolOutput = `Teams meeting created: "${meeting.subject || a.subject}". Join URL: ${meeting.joinWebUrl || "unavailable"}`;
                }
              } else {
                toolOutput = `Unknown tool: ${toolName}`;
                status = "error";
              }
            } catch (toolErr: unknown) {
              const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
              toolOutput = `Error: ${errMsg}`;
              status = "error";
            }
          }

          let stepScreenshot: string | undefined;
          if (isBrowserTool && status !== "error") {
            browserWasUsed = true;
            const liveSession = activeSessions.get(sessionId);
            if (liveSession) {
              try {
                const buf = await liveSession.page.screenshot({ type: "jpeg", quality: 55, fullPage: false });
                stepScreenshot = buf.toString("base64");
              } catch { /* ignore screenshot errors */ }
            }
          }
          const step: AgentStep = { toolName, input: args, output: toolOutput, status, ...(stepUrl ? { url: stepUrl } : {}), ...(stepScreenshot ? { screenshot: stepScreenshot } : {}) };
          steps.push(step);
          onStep?.(step);
          const toolMsg: ChatCompletionToolMessageParam = {
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolOutput,
          };
          messages.push(toolMsg);

          if (pendingEmail || pendingCalendarEvent) break;
        }

        if (pendingEmail) {
          const lastMsg = messages[messages.length - 1];
          if (!("content" in lastMsg) || lastMsg.role !== "assistant") {
            if (onToken) {
              const pendingStream = await openai.chat.completions.create({
                model: AGENT_MODEL,
                max_tokens: 512,
                messages,
                stream: true,
              });
              for await (const chunk of pendingStream) {
                const delta = chunk.choices[0]?.delta?.content || "";
                if (delta) { finalAnswer += delta; onToken(delta); }
              }
              if (!finalAnswer) { finalAnswer = "I've drafted an email for you. Please review and confirm."; onToken(finalAnswer); }
            } else {
              const pendingCompletion = await openai.chat.completions.create({
                model: AGENT_MODEL,
                max_tokens: 512,
                messages,
              });
              finalAnswer = pendingCompletion.choices[0]?.message?.content || "I've drafted an email for you. Please review and confirm.";
            }
          } else {
            finalAnswer = "I've drafted an email for you. Please review and confirm sending it.";
            if (onToken) onToken(finalAnswer);
          }
          break;
        }

        if (pendingCalendarEvent) {
          finalAnswer = `I've prepared the calendar event details. Please review and confirm creating it.`;
          if (onToken) onToken(finalAnswer);
          break;
        }
      }
    } finally {
      if (!browserWasUsed) {
        cleanupSession(sessionId);
      }
    }

    if (!finalAnswer) {
      finalAnswer = "I completed the task but couldn't generate a summary.";
      if (onToken) onToken(finalAnswer);
    }

    return {
      answer: finalAnswer,
      steps,
      pendingEmail,
      pendingCalendarEvent,
      sessionId,
      browserWasUsed,
    };
}

function wrapAgentError(err: unknown): { status: number; body: Record<string, string> } {
  const errMsg = err instanceof Error ? err.message : "Unknown error";
  if (errMsg.includes("not connected") || errMsg.includes("Not connected")) {
    return { status: 403, body: { error: "Gmail not connected. Please connect your Google account in Settings.", code: "NOT_CONNECTED" } };
  }
  return { status: 500, body: { error: "Agent task failed. Please try again." } };
}

async function saveAgentConversation(
  userId: string,
  task: string,
  answer: string,
  steps: AgentStep[],
  existingConversationId?: number,
): Promise<number> {
  const newMessages = [
    { role: "user" as const, content: task },
    {
      role: "assistant" as const,
      content: answer,
      stepsData: steps.length ? JSON.stringify(steps) : null,
    },
  ];

  if (existingConversationId) {
    await db.insert(agentMessages).values(
      newMessages.map((m) => ({ ...m, conversationId: existingConversationId }))
    );
    await db.update(agentConversations)
      .set({ updatedAt: new Date() })
      .where(eq(agentConversations.id, existingConversationId));
    return existingConversationId;
  }

  const title = task.slice(0, 80);
  const [conv] = await db
    .insert(agentConversations)
    .values({ userId, title, createdAt: new Date(), updatedAt: new Date() })
    .returning();
  await db.insert(agentMessages).values(
    newMessages.map((m) => ({ ...m, conversationId: conv.id }))
  );
  return conv.id;
}

router.post("/agent/stream", requireAuth, async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: object) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const userId = getReqUserId(req)!;
    const parsed = AgentRunBodySchema.safeParse(req.body);
    if (!parsed.success) {
      send({ type: "error", message: parsed.error.errors[0]?.message ?? "Invalid request body" });
      res.end();
      return;
    }
    const { task, history: rawHistory = [], sessionId: incomingSessionId, conversationId: reqConversationId } = parsed.data;
    if (task.length > 2000) {
      send({ type: "error", message: "task must be under 2000 characters" });
      res.end();
      return;
    }

    let effectiveHistory = rawHistory.slice(-20);
    let existingConversationId: number | undefined;

    if (reqConversationId) {
      const [conv] = await db.select().from(agentConversations)
        .where(and(eq(agentConversations.id, reqConversationId), eq(agentConversations.userId, userId)));
      if (conv) {
        existingConversationId = conv.id;
        const existingMsgs = await db.select().from(agentMessages)
          .where(eq(agentMessages.conversationId, conv.id))
          .orderBy(agentMessages.createdAt);
        effectiveHistory = existingMsgs
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
          .slice(-20);
      }
    }

    const result = await runAgentCore(
      userId,
      task,
      effectiveHistory,
      incomingSessionId,
      (step) => send({ type: "step", step }),
      (token) => send({ type: "token", content: token }),
    );

    if (result.pendingEmail) send({ type: "pending_email", data: result.pendingEmail });
    if (result.pendingCalendarEvent) send({ type: "pending_event", data: result.pendingCalendarEvent });

    const savedConversationId = await saveAgentConversation(userId, task, result.answer, result.steps, existingConversationId);

    send({
      type: "done",
      answer: result.answer,
      conversationId: savedConversationId,
      ...(result.browserWasUsed ? { sessionId: result.sessionId } : {}),
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Agent stream error");
    const { body } = wrapAgentError(err);
    send({ type: "error", message: body.error });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

router.get("/agent/conversations", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const convs = await db
      .select()
      .from(agentConversations)
      .where(eq(agentConversations.userId, userId))
      .orderBy(desc(agentConversations.updatedAt))
      .limit(50);
    res.json({ conversations: convs });
  } catch (err) {
    req.log.error({ err }, "List conversations error");
    res.status(500).json({ error: "Failed to load conversations" });
  }
});

router.get("/agent/conversations/:id", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const convId = parseInt(req.params.id, 10);
    if (isNaN(convId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [conv] = await db
      .select()
      .from(agentConversations)
      .where(and(eq(agentConversations.id, convId), eq(agentConversations.userId, userId)));
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }
    const msgs = await db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.conversationId, convId))
      .orderBy(agentMessages.createdAt);
    res.json({ conversation: conv, messages: msgs });
  } catch (err) {
    req.log.error({ err }, "Get conversation error");
    res.status(500).json({ error: "Failed to load conversation" });
  }
});

router.delete("/agent/conversations/:id", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const convId = parseInt(req.params.id, 10);
    if (isNaN(convId)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(agentConversations).where(and(eq(agentConversations.id, convId), eq(agentConversations.userId, userId)));
    res.json({ deleted: true });
  } catch (err) {
    req.log.error({ err }, "Delete conversation error");
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

router.post("/agent/run", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const parsed = AgentRunBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid request body" });
      return;
    }
    const { task, history: rawHistory = [], sessionId: incomingSessionId } = parsed.data;
    if (task.length > 2000) {
      res.status(400).json({ error: "task must be under 2000 characters" });
      return;
    }
    const result = await runAgentCore(userId, task, rawHistory.slice(-20), incomingSessionId);
    res.json({
      answer: result.answer,
      steps: result.steps,
      ...(result.pendingEmail ? { pendingEmail: result.pendingEmail } : {}),
      ...(result.pendingCalendarEvent ? { pendingCalendarEvent: result.pendingCalendarEvent } : {}),
      ...(result.browserWasUsed ? { sessionId: result.sessionId, browserSessionActive: true } : {}),
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Agent run error");
    const { status, body } = wrapAgentError(err);
    res.status(status).json(body);
  }
});

router.post("/agent/start", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const parsed = AgentRunBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid request body" });
      return;
    }
    const { task, history: rawHistory = [], sessionId: incomingSessionId } = parsed.data;
    if (task.length > 2000) {
      res.status(400).json({ error: "task must be under 2000 characters" });
      return;
    }
    const jobId = randomUUID();
    const job: AgentJob = { userId, status: "running", steps: [], answer: "", createdAt: Date.now() };
    jobStore.set(jobId, job);
    runAgentCore(userId, task, rawHistory.slice(-20), incomingSessionId, (step) => {
      job.steps.push(step);
    }).then((result) => {
      job.status = "done";
      job.answer = result.answer;
      if (result.pendingEmail) job.pendingEmail = result.pendingEmail;
      if (result.pendingCalendarEvent) job.pendingCalendarEvent = result.pendingCalendarEvent;
      if (result.browserWasUsed) {
        job.sessionId = result.sessionId;
        job.browserSessionActive = true;
      }
    }).catch((err) => {
      job.status = "error";
      job.error = wrapAgentError(err).body.error;
    });
    res.json({ jobId });
  } catch (err) {
    req.log.error({ err }, "Agent start error");
    res.status(500).json({ error: "Failed to start agent task." });
  }
});

router.get("/agent/jobs/:jobId", requireAuth, (req, res) => {
  const userId = getReqUserId(req);
  const job = jobStore.get(req.params.jobId);
  if (!job || job.userId !== userId) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

router.delete("/agent/session/:sessionId", requireAuth, (req, res) => {
  const userId = getReqUserId(req)!;
  const { sessionId } = req.params;
  if (sessionId.startsWith(userId + "-")) {
    cleanupSession(sessionId);
    res.json({ closed: true });
  } else {
    res.status(403).json({ error: "Forbidden" });
  }
});

router.post("/agent/send", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
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

router.post("/agent/create-event", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const { title, start, end, description, location, attendees } = req.body as PendingCalendarEvent;
    if (!title || !start || !end) {
      res.status(400).json({ error: "title, start, and end are required" });
      return;
    }
    const message = await executeCreateCalendarEvent(userId, { title, start, end, description, location, attendees });
    res.json({ success: true, message });
  } catch (err: unknown) {
    req.log.error({ err }, "Agent create-event error");
    res.status(500).json({ error: "Failed to create calendar event" });
  }
});

router.get("/agent/suggestions", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;

    const gmail = await getGmailClientForUser(userId);
    const listRes = await gmail.users.threads.list({
      userId: "me",
      q: "in:inbox",
      maxResults: 15,
    });
    const threads = listRes.data.threads || [];
    if (!threads.length) {
      res.json({ suggestions: [] });
      return;
    }

    const emailSummaries = await Promise.all(
      threads.slice(0, 12).map(async (t) => {
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
          const from = parseEmailAddress(getHeader(headers, "From")).name || parseEmailAddress(getHeader(headers, "From")).email;
          const subject = getHeader(headers, "Subject");
          const date = getHeader(headers, "Date");
          const snippet = lastMsg.snippet?.slice(0, 100) || "";
          return `- From: ${from} | Subject: ${subject} | Date: ${date} | Snippet: ${snippet}`;
        } catch {
          return null;
        }
      })
    );

    const validSummaries = emailSummaries.filter(Boolean).join("\n");

    const completion = await openai.chat.completions.create({
      model: FAST_MODEL,
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content: `You are an AI secretary. Given a list of recent inbox emails, generate 4 specific, actionable suggestions the user can take — acting like a sharp, proactive assistant who spots what needs attention.

Each suggestion should:
- Be grounded in an actual email where possible (e.g. "Reply to Sarah's meeting request", "Triage my inbox", "Plan my week", "Draft a follow-up to [person]")
- Mix secretary-style tasks: replies, scheduling, triage, follow-ups, calendar review, meeting prep
- Have a short label (4-7 words max) and a full prompt the agent can act on
- Avoid generic fillers — every suggestion should feel useful right now

Good suggestion types: draft a BLUF reply, triage inbox and tag REPLY-NOW items, check calendar before scheduling, prep a meeting agenda, draft a follow-up, summarize a thread, find open slots for a meeting.

Return ONLY valid JSON in this exact format, no other text:
{"suggestions":[{"label":"Short action label","prompt":"Full task description for the AI agent to execute","icon":"mail|calendar|globe|search"}]}`
        },
        {
          role: "user",
          content: `Recent inbox emails:\n${validSummaries}\n\nGenerate 4 smart action suggestions based on these emails.`
        }
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";

    const SuggestionSchema = z.object({
      suggestions: z.array(
        z.object({
          label: z.string(),
          prompt: z.string(),
          icon: z.enum(["mail", "calendar", "globe", "search"]),
        })
      ),
    });

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(raw);
    } catch {
      res.json({ suggestions: [] });
      return;
    }

    const validated = SuggestionSchema.safeParse(rawJson);
    if (!validated.success) {
      res.json({ suggestions: [] });
      return;
    }

    res.json({ suggestions: validated.data.suggestions });
  } catch (err: unknown) {
    req.log.error({ err }, "Agent suggestions error");
    res.json({ suggestions: [] });
  }
});

export default router;
