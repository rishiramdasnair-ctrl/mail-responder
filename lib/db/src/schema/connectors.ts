import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const connectorsTable = pgTable("connectors", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  connectorId: text("connector_id").notNull(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("connected"),
  config: jsonb("config"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Connector = typeof connectorsTable.$inferSelect;
export type NewConnector = typeof connectorsTable.$inferInsert;
