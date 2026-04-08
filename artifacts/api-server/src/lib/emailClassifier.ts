import { db } from "@workspace/db";
import { userEmailCategoriesTable, DEFAULT_CATEGORIES } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { gmail_v1 } from "googleapis";
import { getGmailClientForUser } from "./gmailClient";

const LABEL_PREFIX = "ReplyAI";

type GmailClient = gmail_v1.Gmail;

// Cache Gmail label IDs keyed by "userId:accountEmail:labelName".
// Gmail label IDs are per-account, so account identity must be part of the key.
const labelIdCache = new Map<string, string>();

function labelCacheKey(userId: string, accountEmail: string, labelName: string): string {
  return `${userId}:${accountEmail}:${labelName}`;
}

export async function getOrCreateGmailLabel(
  gmail: GmailClient,
  userId: string,
  accountEmail: string,
  category: string
): Promise<string> {
  const labelName = `${LABEL_PREFIX}/${category}`;
  const key = labelCacheKey(userId, accountEmail, labelName);
  if (labelIdCache.has(key)) {
    return labelIdCache.get(key)!;
  }

  // Try to find an existing label with this name
  const listRes = await gmail.users.labels.list({ userId: "me" });
  const labels = listRes.data.labels ?? [];
  const existing = labels.find((l) => l.name === labelName);
  if (existing?.id) {
    labelIdCache.set(key, existing.id);
    return existing.id;
  }

  // Create the label
  const createRes = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });
  const newId = createRes.data.id;
  if (!newId) {
    throw new Error(`[classifier] Gmail did not return an ID when creating label "${labelName}"`);
  }
  labelIdCache.set(key, newId);
  return newId;
}

export function clearLabelCache(userId: string): void {
  for (const key of Array.from(labelIdCache.keys())) {
    if (key.startsWith(`${userId}:`)) {
      labelIdCache.delete(key);
    }
  }
}

/**
 * Resolve a label name like "ReplyAI/Work" to its Gmail label ID for a given account.
 * Returns null if the label doesn't exist (no emails classified into it yet).
 * Uses the same in-memory cache as getOrCreateGmailLabel, keyed per account.
 */
export async function resolveLabelNameToId(
  gmail: GmailClient,
  userId: string,
  accountEmail: string,
  labelName: string
): Promise<string | null> {
  const key = labelCacheKey(userId, accountEmail, labelName);
  if (labelIdCache.has(key)) {
    return labelIdCache.get(key)!;
  }
  const listRes = await gmail.users.labels.list({ userId: "me" });
  const labels = listRes.data.labels ?? [];
  const existing = labels.find((l) => l.name === labelName);
  if (existing?.id) {
    labelIdCache.set(key, existing.id);
    return existing.id;
  }
  return null;
}

export async function getEnabledCategories(userId: string): Promise<string[]> {
  // Fetch ALL rows for this user (not just enabled ones) so we can distinguish
  // "no rows exist yet" (first-time user → use defaults) from "rows exist but all disabled"
  const allRows = await db
    .select()
    .from(userEmailCategoriesTable)
    .where(eq(userEmailCategoriesTable.userId, userId));

  if (allRows.length === 0) {
    // First-time user: no preferences saved yet — use all defaults
    return [...DEFAULT_CATEGORIES];
  }

  // User has explicit preferences: return only enabled categories (may be empty)
  return allRows.filter((r) => r.enabled).map((r) => r.category);
}

export async function getAllCategoriesForUser(
  userId: string
): Promise<Array<{ category: string; enabled: boolean }>> {
  const rows = await db
    .select()
    .from(userEmailCategoriesTable)
    .where(eq(userEmailCategoriesTable.userId, userId));

  if (rows.length === 0) {
    return DEFAULT_CATEGORIES.map((c) => ({ category: c, enabled: true }));
  }

  const map = new Map(rows.map((r) => [r.category, r.enabled]));
  return DEFAULT_CATEGORIES.map((c) => ({ category: c, enabled: map.has(c) ? map.get(c)! : true }));
}

interface OpenRouterChoice {
  message?: { content?: string };
}
interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  error?: { message?: string };
}

export async function classifyEmail(
  subject: string,
  snippet: string,
  categories: string[]
): Promise<string> {
  const fallback = categories.includes("Other") ? "Other" : categories[0];
  const categoryList = categories.join(", ");
  const prompt = `Classify this email into exactly one of these categories: ${categoryList}.

Subject: ${subject || "(no subject)"}
Preview: ${(snippet || "").slice(0, 300)}

Rules:
- Return only the category name, nothing else.
- Pick the single best matching category.
- Use "Other" if nothing fits well.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://replyai.app",
      "X-Title": "ReplyAI",
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-001",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 20,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    console.warn(`[classifier] OpenRouter responded with HTTP ${res.status}; using fallback category "${fallback}"`);
    return fallback;
  }

  const data: OpenRouterResponse = await res.json();
  if (data.error?.message) {
    console.warn(`[classifier] OpenRouter error: ${data.error.message}; using fallback category "${fallback}"`);
    return fallback;
  }

  const raw = (data.choices?.[0]?.message?.content ?? "").trim();
  const matched = categories.find((c) => c.toLowerCase() === raw.toLowerCase());
  if (matched) return matched;

  // Fallback: use "Other" only if it's enabled, else first enabled category
  return fallback;
}

export async function classifyAndLabelMessage(
  userId: string,
  accountEmail: string | undefined,
  threadId: string,
  subject: string,
  snippet: string
): Promise<string | null> {
  const enabled = await getEnabledCategories(userId);
  if (enabled.length === 0) return null;

  const category = await classifyEmail(subject, snippet, enabled);

  const gmail = await getGmailClientForUser(userId, accountEmail);
  const normalizedAccount = accountEmail ?? "";
  const labelId = await getOrCreateGmailLabel(gmail, userId, normalizedAccount, category);

  // Remove any existing ReplyAI/* labels before applying the new one so a thread
  // can only belong to a single category at a time.
  let removeLabelIds: string[] = [];
  try {
    const threadData = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "minimal",
    });
    const existingLabelIds: string[] = threadData.data.messages?.[0]?.labelIds ?? [];
    const labelListRes = await gmail.users.labels.list({ userId: "me" });
    const allLabels = labelListRes.data.labels ?? [];
    const otherReplyAiIds = new Set(
      allLabels
        .filter((l) => l.name?.startsWith(`${LABEL_PREFIX}/`) && l.id !== labelId)
        .map((l) => l.id as string)
    );
    removeLabelIds = existingLabelIds.filter((id) => otherReplyAiIds.has(id));
  } catch (err) {
    console.warn(`[classifier] Could not fetch existing labels for thread ${threadId} (will skip removal):`, err);
  }

  await gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: {
      addLabelIds: [labelId],
      removeLabelIds,
    },
  });

  return category;
}
