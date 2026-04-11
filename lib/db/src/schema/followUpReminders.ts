import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const followUpRemindersTable = pgTable("follow_up_reminders", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
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
});

export type FollowUpReminder = typeof followUpRemindersTable.$inferSelect;
