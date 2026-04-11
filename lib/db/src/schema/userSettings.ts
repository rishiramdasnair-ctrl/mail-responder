import { pgTable, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const userSettingsTable = pgTable("user_settings", {
  userId: text("user_id").primaryKey().references(() => usersTable.id),
  defaultTone: text("default_tone").notNull().default("pro"),
  customInstructions: text("custom_instructions"),
  emailSignature: text("email_signature"),
  darkMode: boolean("dark_mode").notNull().default(false),
  notifications: boolean("notifications").notNull().default(true),
  followUpWindowDays: integer("follow_up_window_days"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSettingsSchema = createInsertSchema(userSettingsTable).omit({ updatedAt: true });
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettingsTable.$inferSelect;
