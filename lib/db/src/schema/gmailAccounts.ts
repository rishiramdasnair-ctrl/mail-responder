import { pgTable, serial, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const gmailAccountsTable = pgTable("gmail_accounts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at"),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userEmailIdx: uniqueIndex("gmail_accounts_user_email_idx").on(table.userId, table.email),
}));

export type GmailAccount = typeof gmailAccountsTable.$inferSelect;
export type NewGmailAccount = typeof gmailAccountsTable.$inferInsert;
