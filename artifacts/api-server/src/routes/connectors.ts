import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router = Router();

router.get("/connectors", requireAuth, async (req, res) => {
  const auth = getAuth(req);
  const userId = auth.userId!;
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
    console.error("[connectors] list error:", err);
    res.status(500).json({ error: "Failed to list connectors" });
  }
});

router.delete("/connectors/:connectorId", requireAuth, async (req, res) => {
  const auth = getAuth(req);
  const userId = auth.userId!;

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
    console.error("[connectors] delete error:", err);
    res.status(500).json({ error: "Failed to remove connector" });
  }
});

export default router;
