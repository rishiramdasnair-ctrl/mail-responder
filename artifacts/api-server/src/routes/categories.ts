import { Router } from "express";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { userEmailCategoriesTable, DEFAULT_CATEGORIES } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getAllCategoriesForUser,
  classifyAndLabelMessage,
  clearLabelCache,
} from "../lib/emailClassifier";
import { getGmailClientForUser } from "../lib/gmailClient";
import { getConnectedGmailAccounts } from "../lib/gmailClient";
import { getHeader } from "../lib/gmailClient";

const router = Router();

router.get("/gmail/categories", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const categories = await getAllCategoriesForUser(userId);
    res.json({ categories });
  } catch (err) {
    req.log.error({ err }, "Error fetching categories");
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.put("/gmail/categories", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const updates: Array<{ category: string; enabled: boolean }> = req.body?.categories || [];
    if (!Array.isArray(updates)) {
      res.status(400).json({ error: "categories must be an array" });
      return;
    }

    for (const u of updates) {
      if (typeof u.category !== "string" || typeof u.enabled !== "boolean") continue;
      // Only allow known default categories to prevent garbage rows
      if (!DEFAULT_CATEGORIES.includes(u.category)) continue;
      await db.insert(userEmailCategoriesTable)
        .values({
          userId,
          category: u.category,
          enabled: u.enabled,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [userEmailCategoriesTable.userId, userEmailCategoriesTable.category],
          set: { enabled: u.enabled, updatedAt: new Date() },
        });
    }

    clearLabelCache(userId);
    const categories = await getAllCategoriesForUser(userId);
    res.json({ categories });
  } catch (err) {
    req.log.error({ err }, "Error updating categories");
    res.status(500).json({ error: "Failed to update categories" });
  }
});

const CLASSIFY_INBOX_LIMIT = 100;

router.post("/gmail/categories/classify-inbox", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const accounts = await getConnectedGmailAccounts(userId);
    if (accounts.length === 0) {
      res.status(400).json({ error: "Gmail not connected" });
      return;
    }

    res.json({ started: true, message: "Classification started in background" });

    (async () => {
      let classified = 0;
      for (const account of accounts) {
        try {
          const gmail = await getGmailClientForUser(userId, account.email);
          const listRes = await gmail.users.threads.list({
            userId: "me",
            labelIds: ["INBOX"],
            maxResults: CLASSIFY_INBOX_LIMIT,
          });
          const threads = listRes.data.threads || [];

          for (const t of threads) {
            if (!t.id) continue;
            try {
              const thread = await gmail.users.threads.get({
                userId: "me",
                id: t.id,
                format: "metadata",
                metadataHeaders: ["Subject"],
              });
              const firstMsg = thread.data.messages?.[0];
              if (!firstMsg) continue;
              const headers = firstMsg.payload?.headers || [];
              const subject = getHeader(headers, "Subject");
              const snippet = thread.data.snippet || "";
              await classifyAndLabelMessage(userId, account.email, t.id, subject, snippet);
              classified++;
            } catch {
              // Skip thread on error
            }
          }
        } catch {
          // Skip account on error
        }
      }
      console.log(`[categories] Bulk classify complete: ${classified} threads classified for user ${userId}`);
    })().catch(console.error);
  } catch (err) {
    req.log.error({ err }, "Error starting bulk classify");
    res.status(500).json({ error: "Failed to start bulk classification" });
  }
});

export default router;
