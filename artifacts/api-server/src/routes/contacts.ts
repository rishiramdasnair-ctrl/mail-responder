import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getAuth } from "@clerk/express";
import { google } from "googleapis";
import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { getGmailClientForUser } from "../lib/gmailClient";

const router = Router();

router.get("/contacts/lookup", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const email = req.query.email as string;
  if (!email) { res.status(400).json({ error: "email query parameter required" }); return; }

  const [connector] = await db
    .select({ id: connectorsTable.id })
    .from(connectorsTable)
    .where(and(
      eq(connectorsTable.userId, userId),
      eq(connectorsTable.connectorId, "google-contacts"),
      eq(connectorsTable.status, "connected"),
    ))
    .limit(1);

  if (!connector) {
    res.json({ connected: false, contact: null });
    return;
  }

  try {
    const authClient = await getGmailClientForUser(userId);
    const people = google.people({ version: "v1", auth: authClient });

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
    console.error("[contacts/lookup] error:", err);
    res.status(500).json({ error: message });
  }
});

export default router;
