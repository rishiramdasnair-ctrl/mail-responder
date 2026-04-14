import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const connectorsTable = pgTable(
  "connectors",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    connectorId: text("connector_id").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("connected"),
    config: jsonb("config"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("connectors_user_connector_idx").on(table.userId, table.connectorId),
    index("connectors_user_idx").on(table.userId),
  ],
);

export type Connector = typeof connectorsTable.$inferSelect;
export type NewConnector = typeof connectorsTable.$inferInsert;
