import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router = Router();

router.get("/connectors", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth.userId!;
    const rows = await db
      .select()
      .from(connectorsTable)
      .where(eq(connectorsTable.userId, userId));
    res.json({ connectors: rows });
  } catch (err) {
    console.error("[connectors] list error:", err);
    res.status(500).json({ error: "Failed to list connectors" });
  }
});

router.delete("/connectors/:id", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth.userId!;
    const { id } = req.params;

    await db
      .delete(connectorsTable)
      .where(
        and(
          eq(connectorsTable.userId, userId),
          eq(connectorsTable.id, id)
        )
      );

    res.json({ success: true });
  } catch (err) {
    console.error("[connectors] delete error:", err);
    res.status(500).json({ error: "Failed to remove connector" });
  }
});

export default router;
