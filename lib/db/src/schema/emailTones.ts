import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const emailTonesTable = pgTable("email_tones", {
  userId: text("user_id").notNull().references(() => usersTable.id),
  threadId: text("thread_id").notNull(),
  tone: text("tone").notNull(),
  classifiedAt: timestamp("classified_at").defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.threadId] }),
}));

export type EmailToneRow = typeof emailTonesTable.$inferSelect;
