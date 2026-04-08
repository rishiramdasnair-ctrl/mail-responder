import { db } from "@workspace/db";
import { gmailWatchesTable, expoPushTokensTable, usersTable } from "@workspace/db/schema";
import { eq, lt, and } from "drizzle-orm";
import { gmail_v1 } from "googleapis";
import { getGmailClientForUser } from "./gmailClient";
import { logger } from "./logger";
import { classifyAndLabelMessage } from "./emailClassifier";

const PUBSUB_TOPIC = process.env.GOOGLE_PUBSUB_TOPIC || "";

export async function watchUser(userId: string): Promise<void> {
  if (!PUBSUB_TOPIC) return;
  try {
    const gmail = await getGmailClientForUser(userId);
    const res = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: PUBSUB_TOPIC,
        labelIds: ["INBOX"],
      },
    });
    const expiration = Number(res.data.expiration) || 0;
    const historyId = res.data.historyId ? String(res.data.historyId) : null;
    await db.insert(gmailWatchesTable).values({
      userId,
      historyId,
      expiration,
      watchedAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: gmailWatchesTable.userId,
      set: { historyId, expiration, updatedAt: new Date() },
    });
    logger.info({ userId, expires: new Date(expiration).toISOString() }, "[watcher] Watching Gmail for user");
  } catch (err) {
    logger.error({ userId, err: err instanceof Error ? err.message : "Unknown error" }, "[watcher] Failed to watch Gmail for user");
  }
}

export async function handlePushNotification(data: {
  emailAddress: string;
  historyId: number;
}): Promise<void> {
  // Find user by google email
  const users = await db.select().from(usersTable)
    .where(eq(usersTable.googleEmail, data.emailAddress));

  for (const user of users) {
    try {
      const watch = await db.select().from(gmailWatchesTable)
        .where(eq(gmailWatchesTable.userId, user.id))
        .limit(1);

      const prevHistoryId = watch[0]?.historyId;

      // Update stored historyId
      await db.update(gmailWatchesTable)
        .set({ historyId: String(data.historyId), updatedAt: new Date() })
        .where(eq(gmailWatchesTable.userId, user.id));

      // Fetch new messages from history
      if (prevHistoryId) {
        const gmail = await getGmailClientForUser(user.id);
        const history = await gmail.users.history.list({
          userId: "me",
          startHistoryId: prevHistoryId,
          historyTypes: ["messageAdded"],
          labelId: "INBOX",
        });

        const added = history.data.history?.flatMap(h => h.messagesAdded || []) || [];
        const newCount = added.length;

        if (newCount > 0) {
          // Classify and label each new message BEFORE sending push notification.
          // Use data.emailAddress (the webhook event's account email) for correct
          // per-account Gmail label ID resolution.
          const classifyTasks = added
            .filter(item => item.message?.id && item.message?.threadId)
            .map(async (item) => {
              const msg = item.message!;
              try {
                const fullMsg = await gmail.users.messages.get({
                  userId: "me",
                  id: msg.id!,
                  format: "metadata",
                  metadataHeaders: ["Subject"],
                });
                const headers: gmail_v1.Schema$MessagePartHeader[] = fullMsg.data.payload?.headers ?? [];
                const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value ?? "";
                const snippet = fullMsg.data.snippet || "";
                await classifyAndLabelMessage(user.id, data.emailAddress, msg.threadId!, subject, snippet);
              } catch (err) {
                logger.error({ err: err instanceof Error ? err.message : "Unknown error" }, "[watcher] classify error");
              }
            });

          await Promise.allSettled(classifyTasks);

          // Labels are applied — now send push notification
          await sendExpoPushNotification(user.id, newCount);
        }
      }
    } catch (err) {
      logger.error({ userId: user.id, err: err instanceof Error ? err.message : "Unknown error" }, "[watcher] Error processing push for user");
    }
  }
}

async function sendExpoPushNotification(userId: string, newEmailCount: number): Promise<void> {
  const tokenRows = await db.select().from(expoPushTokensTable)
    .where(eq(expoPushTokensTable.userId, userId));

  if (!tokenRows.length) return;

  const messages = tokenRows.map(row => ({
    to: row.token,
    sound: "default" as const,
    title: "New email",
    body: newEmailCount === 1
      ? "You have 1 new email in your inbox"
      : `You have ${newEmailCount} new emails in your inbox`,
    data: { screen: "inbox" },
  }));

  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });
    logger.info({ userId, deviceCount: tokenRows.length }, "[watcher] Push notification sent");
  } catch (err) {
    logger.error({ userId, err: err instanceof Error ? err.message : "Unknown error" }, "[watcher] Failed to send push notification");
  }
}

async function renewExpiringWatches(): Promise<void> {
  if (!PUBSUB_TOPIC) return;
  const sixDaysMs = 6 * 24 * 60 * 60 * 1000;
  const renewBefore = Date.now() + sixDaysMs;

  const expiring = await db.select().from(gmailWatchesTable)
    .where(lt(gmailWatchesTable.expiration, renewBefore));

  for (const watch of expiring) {
    await watchUser(watch.userId);
  }
}

export function startGmailWatcher() {
  // Renew expiring watches every 12 hours
  const onError = (err: unknown) => {
    logger.error({ err: err instanceof Error ? err.message : "Unknown error" }, "[watcher] Unhandled error in renewExpiringWatches");
  };
  const interval = setInterval(() => {
    renewExpiringWatches().catch(onError);
  }, 12 * 60 * 60 * 1000);
  renewExpiringWatches().catch(onError);
  logger.info("[watcher] Gmail watch renewal started (interval: 12h)");
  return interval;
}
