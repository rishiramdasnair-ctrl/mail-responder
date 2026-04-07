import { Router } from "express";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { expoPushTokensTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

router.post("/push-token", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { token } = req.body as { token?: string };
    if (!token || !token.startsWith("ExponentPushToken[")) {
      res.status(400).json({ error: "Invalid Expo push token" });
      return;
    }

    await db.insert(expoPushTokensTable).values({
      userId,
      token,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: expoPushTokensTable.token,
      set: { userId, updatedAt: new Date() },
    });

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error registering push token");
    res.status(500).json({ error: "Failed to register push token" });
  }
});

router.delete("/push-token", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { token } = req.body as { token?: string };
    if (token) {
      await db.delete(expoPushTokensTable)
        .where(and(eq(expoPushTokensTable.userId, userId), eq(expoPushTokensTable.token, token)));
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error removing push token");
    res.status(500).json({ error: "Failed to remove push token" });
  }
});

export default router;
