import { db } from "@workspace/db";
import { scheduledEmailsTable } from "@workspace/db/schema";
import { eq, lte, and } from "drizzle-orm";
import { getGmailClientForUser } from "./gmailClient";
import { logger } from "./logger";

async function sendDueEmails() {
  const now = new Date();
  const due = await db.select().from(scheduledEmailsTable)
    .where(and(eq(scheduledEmailsTable.status, "pending"), lte(scheduledEmailsTable.scheduledAt, now)));

  for (const email of due) {
    try {
      const gmail = await getGmailClientForUser(email.userId, email.accountEmail ?? undefined);
      const profile = await gmail.users.getProfile({ userId: "me" });
      const fromEmail = email.accountEmail || profile.data.emailAddress || "";

      const lines: string[] = [
        `From: ${fromEmail}`,
        `To: ${email.to}`,
        ...(email.cc ? [`Cc: ${email.cc}`] : []),
        ...(email.bcc ? [`Bcc: ${email.bcc}`] : []),
        `Subject: ${email.type === "reply" && !email.subject.startsWith("Re:") ? `Re: ${email.subject}` : email.subject}`,
        `Content-Type: text/plain; charset=utf-8`,
      ];

      if (email.inReplyTo) lines.push(`In-Reply-To: ${email.inReplyTo}`);
      if (email.references) lines.push(`References: ${email.references}`);
      lines.push("", email.body);

      const raw = Buffer.from(lines.join("\r\n")).toString("base64url");
      await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw,
          ...(email.threadId ? { threadId: email.threadId } : {}),
        },
      });

      await db.update(scheduledEmailsTable)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(scheduledEmailsTable.id, email.id));

      logger.info({ emailId: email.id }, "[scheduler] Sent scheduled email");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error({ emailId: email.id, err: message }, "[scheduler] Failed to send scheduled email");
      await db.update(scheduledEmailsTable)
        .set({ status: "failed", errorMessage: message })
        .where(eq(scheduledEmailsTable.id, email.id));
    }
  }
}

export function startScheduledEmailSender() {
  const onError = (err: unknown) => {
    logger.error({ err: err instanceof Error ? err.message : "Unknown error" }, "[scheduler] Unhandled error in sendDueEmails");
  };
  sendDueEmails().catch(onError);
  const interval = setInterval(() => {
    sendDueEmails().catch(onError);
  }, 60_000);
  logger.info("[scheduler] Scheduled email sender started (interval: 60s)");
  return interval;
}
