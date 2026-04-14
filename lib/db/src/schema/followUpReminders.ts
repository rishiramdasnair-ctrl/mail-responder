import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const followUpRemindersTable = pgTable(
  "follow_up_reminders",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    threadId: text("thread_id").notNull(),
    accountEmail: text("account_email").notNull(),
    subject: text("subject"),
    toEmail: text("to_email"),
    dueAt: timestamp("due_at").notNull(),
    status: text("status").notNull().default("pending"),
    snoozedUntil: timestamp("snoozed_until"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("follow_up_reminders_user_status_due_idx").on(
      table.userId,
      table.status,
      table.dueAt,
    ),
    index("follow_up_reminders_status_idx").on(table.status),
  ],
);

export type FollowUpReminder = typeof followUpRemindersTable.$inferSelect;
