import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getReqUserId } from "../lib/getReqAuth";
import { db } from "@workspace/db";
import { userSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router = Router();

router.get("/settings", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;

    const settings = await db
      .select()
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);

    if (settings.length === 0) {
      await db.insert(userSettingsTable).values({
        userId,
        defaultTone: "pro",
        darkMode: false,
        notifications: true,
      });
      res.json({ defaultTone: "pro", darkMode: false, notifications: true });
      return;
    }

    const s = settings[0];
    res.json({
      defaultTone: s.defaultTone,
      customInstructions: s.customInstructions,
      emailSignature: s.emailSignature,
      darkMode: s.darkMode,
      notifications: s.notifications,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching settings");
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.put("/settings", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const body = UpdateSettingsBody.parse(req.body);

    const [updated] = await db
      .insert(userSettingsTable)
      .values({ userId, ...body })
      .onConflictDoUpdate({
        target: userSettingsTable.userId,
        set: { ...body, updatedAt: new Date() },
      })
      .returning();

    res.json({
      defaultTone: updated.defaultTone,
      customInstructions: updated.customInstructions,
      emailSignature: updated.emailSignature,
      darkMode: updated.darkMode,
      notifications: updated.notifications,
    });
  } catch (err) {
    req.log.error({ err }, "Error updating settings");
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
