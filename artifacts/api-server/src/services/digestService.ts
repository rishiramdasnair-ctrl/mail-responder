import { db } from "@workspace/db";
import { followUpRemindersTable } from "@workspace/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { labelCache } from "../lib/cache";
import {
  getGmailClientForUser,
  getCalendarClientForUser,
} from "../lib/gmailClient";
import { logger } from "../lib/logger";
import { CONSTANTS } from "../lib/constants";

interface DigestEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
}

interface DigestData {
  emails: DigestEmail[];
  calendarEvents: string[];
  followUps: string[];
  generatedAt: number;
}

export class DigestService {
  private static cacheKey(userId: string): string {
    return `digest:${userId}`;
  }

  async getCachedDigest(userId: string): Promise<DigestData | null> {
    const cached = await labelCache.get<DigestData>(
      DigestService.cacheKey(userId),
    );
    if (
      cached &&
      cached.generatedAt > Date.now() - CONSTANTS.DIGEST_CACHE_TTL
    ) {
      return cached;
    }
    return null;
  }

  async generateDigest(userId: string): Promise<DigestData> {
    const [emails, calendarEvents, followUps] = await Promise.all([
      this.fetchRecentEmails(userId),
      this.fetchUpcomingCalendarEvents(userId),
      this.fetchDueFollowUps(userId),
    ]);

    const digest: DigestData = {
      emails,
      calendarEvents,
      followUps,
      generatedAt: Date.now(),
    };

    await labelCache.set(DigestService.cacheKey(userId), digest, {
      ttlMs: CONSTANTS.DIGEST_CACHE_TTL,
    });

    return digest;
  }

  async invalidateDigest(userId: string): Promise<void> {
    await labelCache.delete(DigestService.cacheKey(userId));
  }

  private async fetchRecentEmails(userId: string): Promise<DigestEmail[]> {
    try {
      const gmail = await getGmailClientForUser(userId);
      const listRes = await gmail.users.messages.list({
        userId: "me",
        maxResults: 10,
        labelIds: ["INBOX"],
      });

      const messages = listRes.data.messages ?? [];
      if (messages.length === 0) return [];

      const fetched = await Promise.allSettled(
        messages.slice(0, 5).map(async (m) => {
          const msg = await gmail.users.messages.get({
            userId: "me",
            id: m.id!,
            format: "metadata",
            metadataHeaders: ["From", "Subject", "Date"],
          });
          const headers = msg.data.payload?.headers ?? [];
          const getHeader = (name: string) =>
            headers.find(
              (h: any) => h.name.toLowerCase() === name.toLowerCase(),
            )?.value ?? "";

          return {
            id: m.id!,
            threadId: msg.data.threadId ?? m.id!,
            subject: getHeader("subject"),
            from: getHeader("from"),
            snippet: msg.data.snippet ?? "",
            date: getHeader("date"),
          };
        }),
      );

      return fetched
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r as PromiseFulfilledResult<DigestEmail>).value);
    } catch (err) {
      logger.error({ err, userId }, "[digestService] failed to fetch emails");
      return [];
    }
  }

  private async fetchUpcomingCalendarEvents(userId: string): Promise<string[]> {
    try {
      const calendar = await getCalendarClientForUser(userId);
      const now = new Date();
      const end = new Date();
      end.setDate(end.getDate() + 7);

      const eventsRes = await calendar.events.list({
        calendarId: "primary",
        timeMin: now.toISOString(),
        timeMax: end.toISOString(),
        maxResults: 5,
        singleEvents: true,
        orderBy: "startTime",
      });

      return (eventsRes.data.items ?? []).map((e) => {
        const start = e.start?.dateTime ?? e.start?.date ?? "";
        const title = e.summary ?? "Busy";
        return `${start}: ${title}`;
      });
    } catch (err) {
      logger.error({ err, userId }, "[digestService] failed to fetch calendar");
      return [];
    }
  }

  private async fetchDueFollowUps(userId: string): Promise<string[]> {
    try {
      const now = new Date();
      const reminders = await db
        .select({
          subject: followUpRemindersTable.subject,
          dueAt: followUpRemindersTable.dueAt,
        })
        .from(followUpRemindersTable)
        .where(
          and(
            eq(followUpRemindersTable.userId, userId),
            eq(followUpRemindersTable.status, "pending"),
            lte(followUpRemindersTable.dueAt, now),
          ),
        )
        .limit(5);

      return reminders.map(
        (r) => `${r.subject ?? "Follow-up"} - Due: ${r.dueAt?.toISOString()}`,
      );
    } catch (err) {
      logger.error(
        { err, userId },
        "[digestService] failed to fetch follow-ups",
      );
      return [];
    }
  }
}

export const digestService = new DigestService();
