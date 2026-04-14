import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/requireAuth";
import { getReqUserId } from "../lib/getReqAuth";
import { db } from "@workspace/db";
import { scheduledEmailsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { validateBody, validateParams } from "../lib/validation";

const router = Router();

const scheduleEmailSchema = z.object({
  type: z.enum(["compose", "reply"]).default("compose"),
  to: z.string().min(1, "Recipient is required"),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  inReplyTo: z.string().optional(),
  references: z.string().optional(),
  threadId: z.string().optional(),
  accountEmail: z.string().email().optional(),
  scheduledAt: z
    .string()
    .datetime({ message: "scheduledAt must be a valid ISO datetime" }),
});

const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, "id must be a number"),
});

router.post(
  "/gmail/schedule",
  requireAuth,
  validateBody(scheduleEmailSchema),
  async (req, res) => {
    try {
      const userId = getReqUserId(req);
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const {
        type,
        to,
        cc,
        bcc,
        subject,
        body,
        inReplyTo,
        references,
        threadId,
        accountEmail,
        scheduledAt,
      } = req.body;

      const scheduled = new Date(scheduledAt);
      if (scheduled <= new Date()) {
        res
          .status(400)
          .json({ error: "scheduledAt must be a future datetime" });
        return;
      }

      const [row] = await db
        .insert(scheduledEmailsTable)
        .values({
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
        })
        .returning();

      res.json({ id: row.id, scheduledAt: row.scheduledAt, success: true });
    } catch (err) {
      req.log.error({ err }, "Error scheduling email");
      res.status(500).json({ error: "Failed to schedule email" });
    }
  },
);

router.get("/gmail/scheduled", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const rows = await db
      .select()
      .from(scheduledEmailsTable)
      .where(
        and(
          eq(scheduledEmailsTable.userId, userId),
          eq(scheduledEmailsTable.status, "pending"),
        ),
      )
      .orderBy(desc(scheduledEmailsTable.scheduledAt));

    res.json({ scheduled: rows });
  } catch (err) {
    req.log.error({ err }, "Error fetching scheduled emails");
    res.status(500).json({ error: "Failed to fetch scheduled emails" });
  }
});

router.delete(
  "/gmail/scheduled/:id",
  requireAuth,
  validateParams(idParamSchema),
  async (req, res) => {
    try {
      const userId = getReqUserId(req);
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const id = parseInt(req.params.id, 10);

      const deleted = await db
        .update(scheduledEmailsTable)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(scheduledEmailsTable.id, id),
            eq(scheduledEmailsTable.userId, userId),
            eq(scheduledEmailsTable.status, "pending"),
          ),
        )
        .returning();

      if (!deleted.length) {
        res
          .status(404)
          .json({ error: "Scheduled email not found or already sent" });
        return;
      }

      res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, "Error cancelling scheduled email");
      res.status(500).json({ error: "Failed to cancel scheduled email" });
    }
  },
);

export default router;
