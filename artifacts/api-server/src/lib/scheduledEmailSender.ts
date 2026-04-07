import { db } from "@workspace/db";
import { scheduledEmailsTable } from "@workspace/db/schema";
import { eq, lte, and } from "drizzle-orm";
import { getGmailClientForUser } from "./gmailClient";

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

      console.log(`[scheduler] Sent scheduled email ${email.id} for user ${email.userId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] Failed to send email ${email.id}:`, message);
      await db.update(scheduledEmailsTable)
        .set({ status: "failed", errorMessage: message })
        .where(eq(scheduledEmailsTable.id, email.id));
    }
  }
}

export function startScheduledEmailSender() {
  // Run immediately on startup, then every 60 seconds
  sendDueEmails().catch(console.error);
  const interval = setInterval(() => {
    sendDueEmails().catch(console.error);
  }, 60_000);
  console.log("[scheduler] Scheduled email sender started (interval: 60s)");
  return interval;
}
