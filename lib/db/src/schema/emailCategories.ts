import { pgTable, serial, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const DEFAULT_CATEGORIES = [
  "Work",
  "Finance",
  "Newsletters",
  "Personal",
  "Travel",
  "Promotions",
  "Updates",
  "Other",
] as const;

export type CategoryName = typeof DEFAULT_CATEGORIES[number];

export const userEmailCategoriesTable = pgTable("user_email_categories", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userCategoryIdx: uniqueIndex("user_email_categories_user_category_idx").on(table.userId, table.category),
}));

export type UserEmailCategory = typeof userEmailCategoriesTable.$inferSelect;
