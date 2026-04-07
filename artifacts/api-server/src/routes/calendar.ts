import { Router } from "express";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../lib/requireAuth";
import { getCalendarClientForUser, getGmailClientForUser } from "../lib/gmailClient";
import { openrouter, FAST_MODEL } from "../lib/openrouter";

const router = Router();

router.get("/calendar/events", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth.userId!;
    const calendar = await getCalendarClientForUser(userId);

    const now = new Date();
    const defaultEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Allow callers to pass an explicit window (ISO strings or YYYY-MM-DD)
    const timeMin = req.query.start
      ? new Date(req.query.start as string).toISOString()
      : now.toISOString();
    const timeMax = req.query.end
      ? new Date(req.query.end as string).toISOString()
      : defaultEnd.toISOString();

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 500,
    });

    const events = (response.data.items || []).map((event) => ({
      id: event.id,
      title: event.summary || "(No title)",
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      isAllDay: !event.start?.dateTime,
      location: event.location || null,
      attendees: (event.attendees || []).map((a) => ({
        email: a.email || "",
        name: a.displayName || "",
        responseStatus: a.responseStatus || "needsAction",
      })),
      htmlLink: event.htmlLink || null,
      description: event.description || null,
    }));

    res.json({ events });
  } catch (err: any) {
    // Always log the full error so we can diagnose it
    const googleMsg = err?.response?.data?.error?.message || err?.response?.data?.error || err?.message || String(err);
    const googleStatus = err?.response?.status || err?.code || err?.status;
    req.log.error({ googleStatus, googleMsg, err }, "Calendar API error");

    if (err.message?.includes("not connected") || err.message?.includes("Not connected")) {
      res.status(403).json({ error: "Google account not connected", code: "NOT_CONNECTED" });
      return;
    }
    // Detect "API not enabled in GCP project" specifically
    const notEnabled = typeof googleMsg === "string" && (
      googleMsg.includes("has not been used") ||
      googleMsg.includes("is disabled") ||
      googleMsg.includes("Calendar API")
    );
    if (notEnabled) {
      res.status(403).json({ error: "Google Calendar API is not enabled in the Google Cloud project.", code: "API_NOT_ENABLED" });
      return;
    }
    if (googleStatus === 403 || googleStatus === "403") {
      res.status(403).json({ error: "Calendar access not granted. Please reconnect your Google account.", code: "PERMISSION_DENIED" });
      return;
    }
    res.status(500).json({ error: "Failed to fetch calendar events" });
  }
});

router.post("/calendar/events", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth.userId!;
    const { title, start, end, description, attendees, location, conferenceType, conferenceUrl } = req.body as {
      title: string; start: string; end: string; description?: string;
      attendees?: string[]; location?: string;
      conferenceType?: "meet" | "zoom" | "teams" | null;
      conferenceUrl?: string;
    };

    if (!title || !start || !end) {
      res.status(400).json({ error: "title, start, and end are required" });
      return;
    }

    const calendar = await getCalendarClientForUser(userId);

    const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

    // Build description with external conference URL if provided
    let finalDescription = description || undefined;
    if (conferenceType === "zoom" && conferenceUrl) {
      finalDescription = [finalDescription, `Zoom Meeting: ${conferenceUrl}`].filter(Boolean).join("\n\n");
    } else if (conferenceType === "teams" && conferenceUrl) {
      finalDescription = [finalDescription, `Teams Meeting: ${conferenceUrl}`].filter(Boolean).join("\n\n");
    }

    const isMeet = conferenceType === "meet";
    const requestId = `replyai-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const event = await calendar.events.insert({
      calendarId: "primary",
      ...(isMeet ? { conferenceDataVersion: 1 } : {}),
      requestBody: {
        summary: title,
        description: finalDescription,
        location: location || undefined,
        start: isDateOnly(start) ? { date: start } : { dateTime: start },
        end: isDateOnly(end) ? { date: end } : { dateTime: end },
        attendees: attendees?.map((email: string) => ({ email })),
        ...(isMeet ? {
          conferenceData: {
            createRequest: {
              requestId,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        } : {}),
      },
    });

    const meetLink = event.data.conferenceData?.entryPoints?.find(
      (ep: any) => ep.entryPointType === "video"
    )?.uri ?? null;

    res.json({
      id: event.data.id,
      title: event.data.summary,
      start: event.data.start?.dateTime || event.data.start?.date,
      end: event.data.end?.dateTime || event.data.end?.date,
      htmlLink: event.data.htmlLink,
      ...(meetLink ? { meetLink } : {}),
      ...(conferenceType === "zoom" && conferenceUrl ? { conferenceUrl } : {}),
      ...(conferenceType === "teams" && conferenceUrl ? { conferenceUrl } : {}),
    });
  } catch (err: any) {
    if (err.message?.includes("not connected") || err.message?.includes("Not connected")) {
      res.status(403).json({ error: "Google account not connected", code: "NOT_CONNECTED" });
      return;
    }
    if (err.code === 403 || err.status === 403) {
      res.status(403).json({ error: "Calendar access not granted. Please reconnect your Google account.", code: "PERMISSION_DENIED" });
      return;
    }
    req.log.error({ err }, "Error creating calendar event");
    res.status(500).json({ error: "Failed to create calendar event" });
  }
});

router.get("/calendar/events/:eventId", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth.userId!;
    const eventId = String(req.params.eventId);
    const calendar = await getCalendarClientForUser(userId);
    const eventResp = await (calendar.events.get as any)({ calendarId: "primary", eventId });
    const e = eventResp.data as any;
    res.json({
      id: e.id,
      title: e.summary || "(No title)",
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      isAllDay: !e.start?.dateTime,
      location: e.location || null,
      attendees: (e.attendees || []).map((a: any) => ({
        email: a.email || "",
        name: a.displayName || "",
        responseStatus: a.responseStatus || "needsAction",
      })),
      htmlLink: e.htmlLink || null,
      description: e.description || null,
      organizer: e.organizer ? { email: e.organizer.email || "", name: e.organizer.displayName || "" } : null,
      conferenceData: e.conferenceData ? {
        entryPoints: (e.conferenceData.entryPoints || []).map((ep: any) => ({
          entryPointType: ep.entryPointType,
          uri: ep.uri,
          label: ep.label,
        })),
      } : null,
    });
  } catch (err: any) {
    if (err.message?.includes("not connected") || err.message?.includes("Not connected")) {
      res.status(403).json({ error: "Google account not connected", code: "NOT_CONNECTED" });
      return;
    }
    if (err.code === 404 || err.status === 404) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    req.log.error({ err }, "Error fetching calendar event");
    res.status(500).json({ error: "Failed to fetch event" });
  }
});

router.post("/calendar/events/:eventId/brief", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth.userId!;
    const eventId = String(req.params.eventId);

    const calendar = await getCalendarClientForUser(userId);
    const eventResp = await (calendar.events.get as any)({ calendarId: "primary", eventId });
    const e = eventResp.data as any;

    const title = e.summary || "(No title)";
    const startRaw = e.start?.dateTime || e.start?.date || "";
    const endRaw = e.end?.dateTime || e.end?.date || "";
    const location = e.location || null;
    const description = e.description || null;
    const attendees = (e.attendees || []).map((a: any) => ({
      email: a.email || "",
      name: a.displayName || a.email || "",
      responseStatus: a.responseStatus || "needsAction",
    }));
    const organizer = e.organizer ? (e.organizer.displayName || e.organizer.email || "") : "";

    const formatDate = (iso: string) => {
      try { return new Date(iso).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }); }
      catch { return iso; }
    };

    let emailContext = "";
    try {
      const gmail = await getGmailClientForUser(userId);
      const attendeeEmails = attendees.map((a: any) => a.email).filter(Boolean);
      if (attendeeEmails.length > 0) {
        const query = attendeeEmails.map((em: any) => `from:${em} OR to:${em}`).join(" OR ");
        const threads = await gmail.users.threads.list({
          userId: "me",
          q: `(${query}) newer_than:14d`,
          maxResults: 8,
        });
        const threadItems = threads.data.threads || [];
        const snippets: string[] = [];
        for (const t of threadItems.slice(0, 6)) {
          if (!t.id) continue;
          const full = await gmail.users.threads.get({ userId: "me", id: t.id, format: "metadata", metadataHeaders: ["Subject", "From", "Date"] });
          const msgs = full.data.messages || [];
          const lastMsg = msgs[msgs.length - 1];
          const headers = lastMsg?.payload?.headers || [];
          const subject = headers.find((h) => h.name === "Subject")?.value || "(no subject)";
          const from = headers.find((h) => h.name === "From")?.value || "";
          const date = headers.find((h) => h.name === "Date")?.value || "";
          snippets.push(`- "${subject}" from ${from} (${date}) — ${msgs.length} message(s)`);
        }
        if (snippets.length > 0) {
          emailContext = `\n\nRecent email threads with attendees (last 14 days):\n${snippets.join("\n")}`;
        }
      }
    } catch (_) {}

    const attendeeList = attendees.length > 0
      ? attendees.map((a: any) => `${a.name || a.email} <${a.email}> (${a.responseStatus})`).join(", ")
      : "No attendees listed";

    const prompt = `You are a professional executive assistant. Generate a concise pre-meeting brief for the following meeting.

Meeting: ${title}
When: ${formatDate(startRaw)} – ${formatDate(endRaw)}${location ? `\nLocation: ${location}` : ""}${organizer ? `\nOrganizer: ${organizer}` : ""}
Attendees: ${attendeeList}${description ? `\nMeeting description: ${description}` : ""}${emailContext}

Write a pre-meeting brief with these sections:
## Meeting Overview
A 2-3 sentence summary of what this meeting is likely about and its purpose.

## Attendees
For each attendee, a brief one-line context (role if inferable, relationship context from emails).

## Key Topics to Cover
3-5 bullet points of likely agenda items or important topics to address.

## Talking Points & Questions
3-5 specific talking points or questions to raise in this meeting.

## Preparation Checklist
2-4 concrete things to prepare before the meeting (documents to review, data to pull, etc.).

Be concise, actionable, and professional. Use the email context to make the brief more specific.`;

    const response = await openrouter.chat.completions.create({
      model: FAST_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1200,
    });

    const brief = response.choices[0]?.message?.content?.trim() || "";
    res.json({ brief });
  } catch (err: any) {
    if (err.message?.includes("not connected") || err.message?.includes("Not connected")) {
      res.status(403).json({ error: "Google account not connected", code: "NOT_CONNECTED" });
      return;
    }
    req.log.error({ err }, "Error generating meeting brief");
    res.status(500).json({ error: "Failed to generate brief" });
  }
});

export default router;
