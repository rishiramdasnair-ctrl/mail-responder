import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const scheduledEmailsTable = pgTable(
  "scheduled_emails",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("compose"),
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
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("scheduled_emails_user_status_scheduled_idx").on(
      table.userId,
      table.status,
      table.scheduledAt,
    ),
    index("scheduled_emails_status_idx").on(table.status),
  ],
);
