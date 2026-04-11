import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getReqUserId } from "../lib/getReqAuth";
import { db } from "@workspace/db";
import {
  usersTable,
  gmailAccountsTable,
  connectorsTable,
  replyHistoryTable,
  userSettingsTable,
  emailSnoozesTable,
  scheduledEmailsTable,
  gmailWatchesTable,
  expoPushTokensTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";

const router = Router();

const deletionRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getReqUserId(req) ?? req.ip ?? "anon",
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many deletion attempts. Please wait and try again.", code: "RATE_LIMITED" });
  },
});

router.delete("/account", requireAuth, deletionRateLimit, async (req, res) => {
  const userId = getReqUserId(req)!;

  try {
    await db.transaction(async (tx) => {
      await tx.delete(expoPushTokensTable).where(eq(expoPushTokensTable.userId, userId));
      await tx.delete(gmailWatchesTable).where(eq(gmailWatchesTable.userId, userId));
      await tx.delete(scheduledEmailsTable).where(eq(scheduledEmailsTable.userId, userId));
      await tx.delete(emailSnoozesTable).where(eq(emailSnoozesTable.userId, userId));
      await tx.delete(replyHistoryTable).where(eq(replyHistoryTable.userId, userId));
      await tx.delete(connectorsTable).where(eq(connectorsTable.userId, userId));
      await tx.delete(gmailAccountsTable).where(eq(gmailAccountsTable.userId, userId));
      await tx.delete(userSettingsTable).where(eq(userSettingsTable.userId, userId));
      await tx.delete(usersTable).where(eq(usersTable.id, userId));
    });

    // Only attempt Clerk user deletion for Clerk-managed users (not Google OAuth users)
    if (!userId.startsWith("google_")) {
      try {
        const { createClerkClient } = await import("@clerk/backend");
        const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
        await clerk.users.deleteUser(userId);
      } catch {
        // Non-fatal: Clerk deletion failure doesn't block DB deletion
      }
    }

    res.json({ success: true, message: "Account and all associated data have been permanently deleted." });
  } catch (err) {
    req.log.error({ err }, "Error deleting account");
    res.status(500).json({ error: "Failed to delete account. Please try again or contact support." });
  }
});

export default router;
