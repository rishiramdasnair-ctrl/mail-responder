import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getReqUserId } from "../lib/getReqAuth";
import { db } from "@workspace/db";
import { scheduledEmailsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

router.post("/gmail/schedule", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const {
      type = "compose",
      to, cc, bcc, subject, body,
      inReplyTo, references, threadId, accountEmail,
      scheduledAt,
    } = req.body as {
      type?: string;
      to: string;
      cc?: string;
      bcc?: string;
      subject: string;
      body: string;
      inReplyTo?: string;
      references?: string;
      threadId?: string;
      accountEmail?: string;
      scheduledAt: string;
    };

    if (!to || !subject || !body || !scheduledAt) {
      res.status(400).json({ error: "to, subject, body, and scheduledAt are required" });
      return;
    }

    const scheduled = new Date(scheduledAt);
    if (isNaN(scheduled.getTime()) || scheduled <= new Date()) {
      res.status(400).json({ error: "scheduledAt must be a future datetime" });
      return;
    }

    const [row] = await db.insert(scheduledEmailsTable).values({
      userId,
      type,
      to,
      cc: cc || null,
      bcc: bcc || null,
      subject,
      body,
      inReplyTo: inReplyTo || null,
      references: references || null,
      threadId: threadId || null,
      accountEmail: accountEmail || null,
      scheduledAt: scheduled,
      status: "pending",
    }).returning();

    res.json({ id: row.id, scheduledAt: row.scheduledAt, success: true });
  } catch (err) {
    req.log.error({ err }, "Error scheduling email");
    res.status(500).json({ error: "Failed to schedule email" });
  }
});

router.get("/gmail/scheduled", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const rows = await db.select().from(scheduledEmailsTable)
      .where(and(
        eq(scheduledEmailsTable.userId, userId),
        eq(scheduledEmailsTable.status, "pending"),
      ))
      .orderBy(desc(scheduledEmailsTable.scheduledAt));

    res.json({ scheduled: rows });
  } catch (err) {
    req.log.error({ err }, "Error fetching scheduled emails");
    res.status(500).json({ error: "Failed to fetch scheduled emails" });
  }
});

router.delete("/gmail/scheduled/:id", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const deleted = await db.update(scheduledEmailsTable)
      .set({ status: "cancelled" })
      .where(and(
        eq(scheduledEmailsTable.id, id),
        eq(scheduledEmailsTable.userId, userId),
        eq(scheduledEmailsTable.status, "pending"),
      ))
      .returning();

    if (!deleted.length) {
      res.status(404).json({ error: "Scheduled email not found or already sent" });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error cancelling scheduled email");
    res.status(500).json({ error: "Failed to cancel scheduled email" });
  }
});

export default router;
