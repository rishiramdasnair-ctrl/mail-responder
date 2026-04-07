import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const emailSnoozesTable = pgTable("email_snoozes", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  threadId: text("thread_id").notNull(),
  accountEmail: text("account_email").notNull(),
  snoozeUntil: timestamp("snooze_until").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userThreadIdx: uniqueIndex("email_snoozes_user_thread_idx").on(table.userId, table.threadId, table.accountEmail),
}));

export type EmailSnooze = typeof emailSnoozesTable.$inferSelect;
