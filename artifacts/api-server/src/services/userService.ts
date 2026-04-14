import { db } from "@workspace/db";
import { usersTable, userSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const TRIAL_DAYS = 14;
const TRIAL_REPLIES = 50;

export interface UserWithPlan {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  plan: string;
  trialEndsAt: Date | null;
  repliesUsed: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  repliesResetAt: Date | null;
}

export async function getOrCreateUser(
  userId: string,
  email?: string,
): Promise<UserWithPlan> {
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0] as UserWithPlan;
  }

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

  const inserted = await db
    .insert(usersTable)
    .values({
      id: userId,
      email: email || "",
      plan: "trial",
      trialEndsAt,
      repliesUsed: 0,
    })
    .onConflictDoNothing()
    .returning();

  await db
    .insert(userSettingsTable)
    .values({
      userId,
      defaultTone: "pro",
      darkMode: false,
      notifications: true,
    })
    .onConflictDoNothing();

  if (inserted.length > 0) return inserted[0] as UserWithPlan;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user as UserWithPlan;
}

export function getUserPlan(user: UserWithPlan): "trial" | "pro" | "expired" {
  if (user.plan === "pro") return "pro";
  if (
    user.plan === "trial" &&
    user.trialEndsAt &&
    new Date(user.trialEndsAt) > new Date()
  ) {
    return "trial";
  }
  if (user.plan === "trial") return "expired";
  return "expired";
}

export function getRepliesLimit(user: UserWithPlan): number {
  const plan = getUserPlan(user);
  if (plan === "trial") return TRIAL_REPLIES;
  if (plan === "pro") return 999999;
  return 0;
}

export function checkUserLimits(user: UserWithPlan): {
  allowed: boolean;
  error?: string;
  code?: string;
} {
  const plan = getUserPlan(user);
  if (plan === "expired") {
    return {
      allowed: false,
      error: "Trial expired. Please subscribe to continue.",
      code: "TRIAL_EXPIRED",
    };
  }
  const repliesLimit = getRepliesLimit(user);
  if (user.repliesUsed >= repliesLimit) {
    return {
      allowed: false,
      error: "Reply limit reached. Please upgrade your plan.",
      code: "LIMIT_REACHED",
    };
  }
  return { allowed: true };
}

export async function incrementRepliesUsed(userId: string): Promise<void> {
  try {
    await db
      .update(usersTable)
      .set({ repliesUsed: usersTable.repliesUsed })
      .where(eq(usersTable.id, userId));
  } catch (err) {
    logger.error(
      { err, userId },
      "[userService] failed to increment replies used",
    );
  }
}
