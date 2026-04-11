import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getReqUserId } from "../lib/getReqAuth";
import { db } from "@workspace/db";
import { replyHistoryTable } from "@workspace/db/schema";
import { eq, desc, count, like, and, sql } from "drizzle-orm";

const router = Router();

router.get("/history", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const limit = parseInt((req.query.limit as string) || "50");
    const offset = parseInt((req.query.offset as string) || "0");
    const q = req.query.q as string | undefined;

    let query = db
      .select()
      .from(replyHistoryTable)
      .where(
        q
          ? and(eq(replyHistoryTable.userId, userId), like(replyHistoryTable.subject, `%${q}%`))
          : eq(replyHistoryTable.userId, userId)
      )
      .orderBy(desc(replyHistoryTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [items, totalResult] = await Promise.all([
      query,
      db
        .select({ count: count() })
        .from(replyHistoryTable)
        .where(eq(replyHistoryTable.userId, userId)),
    ]);

    res.json({
      items: items.map((i) => ({
        id: i.id,
        threadId: i.threadId,
        subject: i.subject,
        fromEmail: i.fromEmail,
        tone: i.tone,
        replySent: i.replySent,
        reasoning: i.reasoning,
        sentAt: i.createdAt.toISOString(),
        wasSent: i.wasSent,
      })),
      total: totalResult[0]?.count || 0,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching history");
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

router.get("/history/stats", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;

    const [totalGenerated, totalSent, thisMonth] = await Promise.all([
      db.select({ count: count() }).from(replyHistoryTable).where(eq(replyHistoryTable.userId, userId)),
      db
        .select({ count: count() })
        .from(replyHistoryTable)
        .where(and(eq(replyHistoryTable.userId, userId), eq(replyHistoryTable.wasSent, true))),
      db
        .select({ count: count() })
        .from(replyHistoryTable)
        .where(
          and(
            eq(replyHistoryTable.userId, userId),
            sql`${replyHistoryTable.createdAt} >= date_trunc('month', now())`
          )
        ),
    ]);

    const toneCounts = await db
      .select({ tone: replyHistoryTable.tone, count: count() })
      .from(replyHistoryTable)
      .where(and(eq(replyHistoryTable.userId, userId), eq(replyHistoryTable.wasSent, true)))
      .groupBy(replyHistoryTable.tone)
      .orderBy(desc(count()));

    const favoriteTone = toneCounts[0]?.tone || "pro";
    const total = totalGenerated[0]?.count || 0;

    res.json({
      totalRepliesGenerated: total,
      totalRepliesSent: totalSent[0]?.count || 0,
      repliesThisMonth: thisMonth[0]?.count || 0,
      favoriteTone,
      avgRepliesPerDay: 0,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
