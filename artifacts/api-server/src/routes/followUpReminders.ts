import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getReqUserId } from "../lib/getReqAuth";
import { db } from "@workspace/db";
import { followUpRemindersTable } from "@workspace/db/schema";
import { eq, and, lte, or, isNull } from "drizzle-orm";

const router = Router();

router.post("/follow-up-reminders", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const { messageId, threadId, accountEmail, subject, toEmail, days } = req.body as {
      messageId?: string;
      threadId?: string;
      accountEmail?: string;
      subject?: string;
      toEmail?: string;
      days?: number;
    };

    if (!messageId || !threadId || !accountEmail || !days || days < 1 || days > 30) {
      res.status(400).json({ error: "messageId, threadId, accountEmail, and days (1-30) are required" });
      return;
    }

    const dueAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const [reminder] = await db.insert(followUpRemindersTable).values({
      userId,
      messageId,
      threadId,
      accountEmail,
      subject: subject ?? null,
      toEmail: toEmail ?? null,
      dueAt,
      status: "pending",
    }).returning();

    res.json({ reminder });
  } catch (err) {
    req.log.error({ err }, "Error creating follow-up reminder");
    res.status(500).json({ error: "Failed to create follow-up reminder" });
  }
});

router.get("/follow-up-reminders", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;

    const now = new Date();

    const reminders = await db.select()
      .from(followUpRemindersTable)
      .where(
        and(
          eq(followUpRemindersTable.userId, userId),
          eq(followUpRemindersTable.status, "pending"),
          lte(followUpRemindersTable.dueAt, now),
          or(
            isNull(followUpRemindersTable.snoozedUntil),
            lte(followUpRemindersTable.snoozedUntil, now),
          ),
        )
      );

    res.json({ reminders });
  } catch (err) {
    req.log.error({ err }, "Error fetching follow-up reminders");
    res.status(500).json({ error: "Failed to fetch follow-up reminders" });
  }
});

router.get("/follow-up-reminders/all", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;

    const reminders = await db.select()
      .from(followUpRemindersTable)
      .where(
        and(
          eq(followUpRemindersTable.userId, userId),
          eq(followUpRemindersTable.status, "pending"),
        )
      );

    res.json({ reminders });
  } catch (err) {
    req.log.error({ err }, "Error fetching all follow-up reminders");
    res.status(500).json({ error: "Failed to fetch follow-up reminders" });
  }
});

router.post("/follow-up-reminders/:id/dismiss", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid reminder id" });
      return;
    }

    await db.update(followUpRemindersTable)
      .set({ status: "dismissed", updatedAt: new Date() })
      .where(and(eq(followUpRemindersTable.id, id), eq(followUpRemindersTable.userId, userId)));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error dismissing follow-up reminder");
    res.status(500).json({ error: "Failed to dismiss reminder" });
  }
});

router.post("/follow-up-reminders/:id/snooze", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid reminder id" });
      return;
    }

    const { days } = req.body as { days?: number };
    if (!days || days < 1) {
      res.status(400).json({ error: "days is required (minimum 1)" });
      return;
    }

    const snoozedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await db.update(followUpRemindersTable)
      .set({ snoozedUntil, updatedAt: new Date() })
      .where(and(eq(followUpRemindersTable.id, id), eq(followUpRemindersTable.userId, userId)));

    res.json({ success: true, snoozedUntil: snoozedUntil.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Error snoozing follow-up reminder");
    res.status(500).json({ error: "Failed to snooze reminder" });
  }
});

export default router;
