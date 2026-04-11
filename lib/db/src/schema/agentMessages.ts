import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { agentConversations } from "./agentConversations";

export const agentMessages = pgTable("agent_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => agentConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  stepsData: text("steps_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AgentMessage = typeof agentMessages.$inferSelect;
