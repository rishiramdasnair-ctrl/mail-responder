import { pgTable, text, integer, timestamp, real, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const contactProfilesTable = pgTable("contact_profiles", {
  userId: text("user_id").notNull().references(() => usersTable.id),
  senderEmail: text("sender_email").notNull(),
  emailCount: integer("email_count").notNull().default(0),
  avgResponseTimeHours: real("avg_response_time_hours"),
  inferredTone: text("inferred_tone"),
  firstSeenAt: timestamp("first_seen_at").defaultNow(),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.senderEmail] }),
}));

export type ContactProfile = typeof contactProfilesTable.$inferSelect;
