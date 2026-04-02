import { db } from "@workspace/db";
import { usersTable, userSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const TRIAL_DAYS = 14;
const TRIAL_REPLIES = 50;

export async function getOrCreateUser(userId: string, email?: string): Promise<typeof usersTable.$inferSelect> {
  const existing = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

  const [user] = await db
    .insert(usersTable)
    .values({
      id: userId,
      email: email || "",
      plan: "trial",
      trialEndsAt,
      repliesUsed: 0,
    })
    .returning();

  await db.insert(userSettingsTable).values({
    userId,
    defaultTone: "pro",
    darkMode: false,
    notifications: true,
  }).onConflictDoNothing();

  return user;
}

export function getUserPlan(user: typeof usersTable.$inferSelect): "trial" | "pro" | "expired" {
  if (user.plan === "pro") return "pro";
  if (user.plan === "trial" && user.trialEndsAt && new Date(user.trialEndsAt) > new Date()) {
    return "trial";
  }
  if (user.plan === "trial") return "expired";
  return "expired";
}

export function getRepliesLimit(user: typeof usersTable.$inferSelect): number {
  const plan = getUserPlan(user);
  if (plan === "trial") return TRIAL_REPLIES;
  if (plan === "pro") return 999999;
  return 0;
}
