import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const scheduledEmailsTable = pgTable("scheduled_emails", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("compose"), // "compose" | "reply"
  to: text("to").notNull(),
  cc: text("cc"),
  bcc: text("bcc"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  inReplyTo: text("in_reply_to"),
  references: text("references"),
  threadId: text("thread_id"),
  accountEmail: text("account_email"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "sent" | "failed" | "cancelled"
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
