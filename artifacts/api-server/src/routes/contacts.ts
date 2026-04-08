import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getAuth } from "@clerk/express";
import { google } from "googleapis";
import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { getOAuth2ClientForUser } from "../lib/gmailClient";

const router = Router();

async function getContactsClient(userId: string) {
  const [connector] = await db
    .select({ id: connectorsTable.id })
    .from(connectorsTable)
    .where(and(
      eq(connectorsTable.userId, userId),
      eq(connectorsTable.connectorId, "google-contacts"),
      eq(connectorsTable.status, "connected"),
    ))
    .limit(1);
  if (!connector) return null;
  const oauth2Client = await getOAuth2ClientForUser(userId);
  return google.people({ version: "v1", auth: oauth2Client });
}

router.get("/contacts/lookup", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const email = req.query.email as string;
  if (!email) { res.status(400).json({ error: "email query parameter required" }); return; }

  const people = await getContactsClient(userId);
  if (!people) {
    res.json({ connected: false, contact: null });
    return;
  }

  try {
    const searchRes = await people.people.searchContacts({
      query: email,
      readMask: "names,emailAddresses,phoneNumbers,organizations,photos",
      pageSize: 5,
    });

    const results = searchRes.data.results || [];
    const match = results.find((r) => {
      const emails = r.person?.emailAddresses || [];
      return emails.some((e) => e.value?.toLowerCase() === email.toLowerCase());
    }) ?? results[0];

    if (!match?.person) {
      res.json({ connected: true, contact: null });
      return;
    }

    const person = match.person;
    const nameObj = person.names?.[0];
    const phoneObj = person.phoneNumbers?.[0];
    const orgObj = person.organizations?.[0];
    const photoObj = person.photos?.[0];

    res.json({
      connected: true,
      contact: {
        resourceName: person.resourceName,
        name: nameObj?.displayName ?? null,
        givenName: nameObj?.givenName ?? null,
        familyName: nameObj?.familyName ?? null,
        email,
        phone: phoneObj?.value ?? null,
        organization: orgObj?.name ?? null,
        jobTitle: orgObj?.title ?? null,
        photoUrl: photoObj?.url ?? null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Contacts lookup failed";
    req.log.error({ err: message }, "[contacts/lookup] error");
    res.status(500).json({ error: message });
  }
});

function extractPeopleResults(
  results: Array<{ person?: { names?: Array<{ displayName?: string | null }> | null; emailAddresses?: Array<{ value?: string | null }> | null; organizations?: Array<{ name?: string | null }> | null; photos?: Array<{ url?: string | null }> | null } | null }>,
): Array<{ name: string | null; email: string; organization: string | null; photoUrl: string | null }> {
  return results
    .flatMap((r) => {
      const person = r.person;
      if (!person) return [];
      const nameObj = person.names?.[0];
      const orgObj = person.organizations?.[0];
      const photoObj = person.photos?.[0];
      const name = nameObj?.displayName ?? null;
      const emails = person.emailAddresses || [];
      return emails.map((e) => ({
        name,
        email: e.value ?? "",
        organization: orgObj?.name ?? null,
        photoUrl: photoObj?.url ?? null,
      }));
    })
    .filter((r) => r.email);
}

// Parse email header like "John Smith <john@example.com>" or "john@example.com"
function parseEmailHeader(raw: string): { name: string | null; email: string } | null {
  if (!raw) return null;
  const match = raw.match(/^(.*?)\s*<([^>]+)>/);
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, "") || null;
    const email = match[2].trim().toLowerCase();
    if (!email.includes("@")) return null;
    return { name, email };
  }
  const plain = raw.trim().toLowerCase();
  if (plain.includes("@")) return { name: null, email: plain };
  return null;
}

async function searchGmailRecipients(
  userId: string,
  q: string,
): Promise<Array<{ name: string | null; email: string; organization: null; photoUrl: null }>> {
  try {
    const oauth2Client = await getOAuth2ClientForUser(userId);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Search sent + all mail for messages involving this query in headers
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: `to:${q} OR from:${q} OR ${q}`,
      maxResults: 20,
    });

    const messages = listRes.data.messages ?? [];
    if (messages.length === 0) return [];

    const headerFetches = messages.slice(0, 10).map((m) =>
      gmail.users.messages.get({
        userId: "me",
        id: m.id!,
        format: "metadata",
        metadataHeaders: ["To", "From", "Cc"],
      })
    );

    const fetched = await Promise.allSettled(headerFetches);
    const seen = new Set<string>();
    const results: Array<{ name: string | null; email: string; organization: null; photoUrl: null }> = [];
    const ql = q.toLowerCase();

    for (const r of fetched) {
      if (r.status !== "fulfilled") continue;
      const headers = r.value.data.payload?.headers ?? [];
      for (const h of headers) {
        const value = h.value ?? "";
        // Split comma-separated recipients
        const parts = value.split(",");
        for (const part of parts) {
          const parsed = parseEmailHeader(part);
          if (!parsed) continue;
          if (seen.has(parsed.email)) continue;
          if (!parsed.email.includes(ql) && !(parsed.name?.toLowerCase().includes(ql))) continue;
          seen.add(parsed.email);
          results.push({ ...parsed, organization: null, photoUrl: null });
        }
      }
    }

    return results.slice(0, 8);
  } catch {
    return [];
  }
}

router.get("/contacts/search", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const q = (req.query.q as string || "").trim();
  if (!q || q.length < 2) {
    res.json({ results: [] });
    return;
  }

  try {
    const oauth2Client = await getOAuth2ClientForUser(userId);
    const people = google.people({ version: "v1", auth: oauth2Client });

    const [savedRes, otherRes] = await Promise.allSettled([
      people.people.searchContacts({
        query: q,
        readMask: "names,emailAddresses,organizations,photos",
        pageSize: 8,
      }),
      people.otherContacts.search({
        query: q,
        readMask: "names,emailAddresses,photos",
        pageSize: 8,
      }),
    ]);

    const savedResults = savedRes.status === "fulfilled"
      ? extractPeopleResults(savedRes.value.data.results || [])
      : [];

    const otherResults = otherRes.status === "fulfilled"
      ? extractPeopleResults(
          (otherRes.value.data.otherContacts || []).map((p) => ({ person: p }))
        )
      : [];

    const seen = new Set<string>();
    const merged = [...savedResults, ...otherResults].filter((r) => {
      const key = r.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // If People API returned nothing, fall back to searching Gmail message headers
    const final = merged.length > 0 ? merged : await searchGmailRecipients(userId, q);

    res.json({ results: final.slice(0, 10) });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "";
    if (errMsg.includes("insufficient") || errMsg.includes("403") || errMsg.includes("scope")) {
      // People API failed — fall back to Gmail header search
      const fallback = await searchGmailRecipients(userId, q);
      res.json({ results: fallback });
      return;
    }
    req.log.error({ err: err instanceof Error ? err.message : "Unknown error" }, "[contacts/search] error");
    res.json({ results: [] });
  }
});

export default router;
