import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const replyHistoryTable = pgTable("reply_history", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  threadId: text("thread_id").notNull(),
  subject: text("subject").notNull(),
  fromEmail: text("from_email"),
  tone: text("tone").notNull(),
  replySent: text("reply_sent").notNull(),
  reasoning: text("reasoning"),
  wasSent: boolean("was_sent").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertReplyHistorySchema = createInsertSchema(replyHistoryTable).omit({ id: true, createdAt: true });
export type InsertReplyHistory = z.infer<typeof insertReplyHistorySchema>;
export type ReplyHistory = typeof replyHistoryTable.$inferSelect;
