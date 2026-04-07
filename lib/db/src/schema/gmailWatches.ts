import { pgTable, text, timestamp, bigint } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const gmailWatchesTable = pgTable("gmail_watches", {
  userId: text("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  historyId: text("history_id"),
  expiration: bigint("expiration", { mode: "number" }),
  watchedAt: timestamp("watched_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
