import { Router } from "express";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../lib/requireAuth";
import { getCalendarClientForUser } from "../lib/gmailClient";

const router = Router();

router.get("/calendar/events", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth.userId!;
    const calendar = await getCalendarClientForUser(userId);

    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: nextWeek.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 25,
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
    if (err.message?.includes("not connected") || err.message?.includes("Not connected")) {
      res.status(403).json({ error: "Google account not connected", code: "NOT_CONNECTED" });
      return;
    }
    if (err.code === 403 || err.status === 403) {
      res.status(403).json({ error: "Calendar access not granted. Please reconnect your Google account.", code: "PERMISSION_DENIED" });
      return;
    }
    req.log.error({ err }, "Error fetching calendar events");
    res.status(500).json({ error: "Failed to fetch calendar events" });
  }
});

router.post("/calendar/events", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth.userId!;
    const { title, start, end, description, attendees, location } = req.body;

    if (!title || !start || !end) {
      res.status(400).json({ error: "title, start, and end are required" });
      return;
    }

    const calendar = await getCalendarClientForUser(userId);

    const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: title,
        description: description || undefined,
        location: location || undefined,
        start: isDateOnly(start) ? { date: start } : { dateTime: start },
        end: isDateOnly(end) ? { date: end } : { dateTime: end },
        attendees: attendees?.map((email: string) => ({ email })),
      },
    });

    res.json({
      id: event.data.id,
      title: event.data.summary,
      start: event.data.start?.dateTime || event.data.start?.date,
      end: event.data.end?.dateTime || event.data.end?.date,
      htmlLink: event.data.htmlLink,
    });
  } catch (err: any) {
    if (err.message?.includes("not connected")) {
      res.status(403).json({ error: "Google account not connected", code: "NOT_CONNECTED" });
      return;
    }
    req.log.error({ err }, "Error creating calendar event");
    res.status(500).json({ error: "Failed to create calendar event" });
  }
});

export default router;
