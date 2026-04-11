import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getReqUserId } from "../lib/getReqAuth";
import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/connectors", requireAuth, async (req, res) => {
  const userId = getReqUserId(req)!;
  try {
    const rows = await db
      .select({
        id: connectorsTable.id,
        connectorId: connectorsTable.connectorId,
        displayName: connectorsTable.displayName,
        status: connectorsTable.status,
        createdAt: connectorsTable.createdAt,
        updatedAt: connectorsTable.updatedAt,
      })
      .from(connectorsTable)
      .where(eq(connectorsTable.userId, userId));
    res.json({ connectors: rows });
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.message : "Unknown error" }, "[connectors] list error");
    res.status(500).json({ error: "Failed to list connectors" });
  }
});

router.delete("/connectors/:connectorId", requireAuth, async (req, res) => {
  const userId = getReqUserId(req)!;

  const rawParam = req.params.connectorId;
  const connectorId = Array.isArray(rawParam) ? rawParam[0] : rawParam;
  if (typeof connectorId !== "string" || !connectorId) {
    res.status(400).json({ error: "connectorId is required" });
    return;
  }

  try {
    await db
      .delete(connectorsTable)
      .where(
        and(
          eq(connectorsTable.userId, userId),
          eq(connectorsTable.connectorId, connectorId),
        ),
      );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.message : "Unknown error" }, "[connectors] delete error");
    res.status(500).json({ error: "Failed to remove connector" });
  }
});

export default router;
