import * as zod from "zod";

export const AgentRunBody = zod.object({
  task: zod.string().max(2000),
  history: zod
    .array(
      zod.object({
        role: zod.enum(["user", "assistant"]),
        content: zod.string(),
      }),
    )
    .optional()
    .default([]),
  sessionId: zod.string().optional(),
  conversationId: zod.number().int().positive().optional(),
});

export const AgentSendBody = zod.object({
  to: zod.string().email(),
  subject: zod.string(),
  body: zod.string(),
  threadId: zod.string().optional(),
});
