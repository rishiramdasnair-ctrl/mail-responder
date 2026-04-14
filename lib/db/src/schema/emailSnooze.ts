import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const emailSnoozesTable = pgTable(
  "email_snoozes",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    accountEmail: text("account_email").notNull(),
    snoozeUntil: timestamp("snooze_until").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userThreadIdx: uniqueIndex("email_snoozes_user_thread_idx").on(
      table.userId,
      table.threadId,
      table.accountEmail,
    ),
    snoozeUntilIdx: index("email_snoozes_snooze_until_idx").on(
      table.snoozeUntil,
    ),
  }),
);

export type EmailSnooze = typeof emailSnoozesTable.$inferSelect;
