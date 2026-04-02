import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

const router = Router();

interface HubSpotConnectorConfig {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  portalId?: string | null;
}

async function refreshHubSpotToken(userId: string, config: HubSpotConnectorConfig): Promise<string | null> {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!clientId || !clientSecret || !config.refreshToken) return null;

  try {
    const res = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: config.refreshToken,
      }).toString(),
    });
    if (!res.ok) return null;

    const tokens = await res.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const newConfig: HubSpotConnectorConfig = {
      ...config,
      accessToken: tokens.access_token,
      expiresAt: newExpiresAt.toISOString(),
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    };

    await db.update(connectorsTable).set({
      config: newConfig,
      updatedAt: new Date(),
    }).where(and(
      eq(connectorsTable.userId, userId),
      eq(connectorsTable.connectorId, "hubspot"),
    ));

    return tokens.access_token;
  } catch {
    return null;
  }
}

async function getHubSpotToken(userId: string): Promise<{ token: string; portalId: string | null } | null> {
  const rows = await db
    .select({ id: connectorsTable.id, config: connectorsTable.config })
    .from(connectorsTable)
    .where(and(
      eq(connectorsTable.userId, userId),
      eq(connectorsTable.connectorId, "hubspot"),
      eq(connectorsTable.status, "connected"),
    ))
    .limit(1);

  if (!rows.length) return null;
  const config = rows[0].config as HubSpotConnectorConfig | null;
  if (!config?.accessToken) return null;

  const portalId = config.portalId ?? null;
  const expiresAt = config.expiresAt ? new Date(config.expiresAt) : null;

  if (!expiresAt || expiresAt > new Date()) {
    return { token: config.accessToken, portalId };
  }

  const refreshed = await refreshHubSpotToken(userId, config);
  return refreshed ? { token: refreshed, portalId } : null;
}

interface HubSpotApiDeal {
  id: string;
  properties: {
    dealname?: string | null;
    dealstage?: string | null;
    closedate?: string | null;
  };
}

interface HubSpotApiAssociationsResultV4 {
  toObjectId?: number | string;
  id?: number | string;
  associationTypes?: Array<{ typeId: number; label: string | null; category: string }>;
}

async function getFirstDealForContact(
  token: string,
  contactId: string,
): Promise<{ dealName: string | null; dealStage: string | null } | null> {
  try {
    const assocRes = await fetch(
      `https://api.hubapi.com/crm/v4/objects/contacts/${contactId}/associations/deals`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!assocRes.ok) return null;

    const assocData = await assocRes.json() as { results?: HubSpotApiAssociationsResultV4[] };
    const results = assocData.results ?? [];
    if (!results.length) return null;

    const firstResult = results[0];
    const firstDealId = firstResult.toObjectId ?? firstResult.id;
    if (!firstDealId) return null;

    const dealRes = await fetch(
      `https://api.hubapi.com/crm/v3/objects/deals/${String(firstDealId)}?properties=dealname,dealstage`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!dealRes.ok) return null;

    const deal = await dealRes.json() as HubSpotApiDeal;
    return {
      dealName: deal.properties.dealname ?? null,
      dealStage: deal.properties.dealstage ?? null,
    };
  } catch {
    return null;
  }
}

router.get("/hubspot/contact", requireAuth, async (req, res) => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const { email } = req.query;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email query parameter is required" });
  }

  const tokenInfo = await getHubSpotToken(userId);
  if (!tokenInfo) {
    return res.status(404).json({ connected: false, contact: null });
  }
  const { token, portalId } = tokenInfo;

  try {
    const searchRes = await fetch(
      "https://api.hubapi.com/crm/v3/objects/contacts/search",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filterGroups: [{
            filters: [{
              propertyName: "email",
              operator: "EQ",
              value: email,
            }],
          }],
          properties: ["email", "firstname", "lastname", "company", "jobtitle", "phone"],
          limit: 1,
        }),
      }
    );

    if (!searchRes.ok) {
      const err = await searchRes.json().catch(() => ({ message: "unknown" })) as { message?: string };
      console.error("[hubspot/contact] search failed:", err);
      return res.status(500).json({ error: "HubSpot search failed" });
    }

    const data = await searchRes.json() as {
      total: number;
      results: Array<{ id: string; properties: Record<string, string | null> }>;
    };

    if (data.total === 0 || !data.results.length) {
      return res.json({ connected: true, contact: null });
    }

    const c = data.results[0];
    const deal = await getFirstDealForContact(token, c.id);

    return res.json({
      connected: true,
      contact: {
        id: c.id,
        email: c.properties.email ?? null,
        name: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(" ") || null,
        company: c.properties.company ?? null,
        jobTitle: c.properties.jobtitle ?? null,
        phone: c.properties.phone ?? null,
        dealName: deal?.dealName ?? null,
        dealStage: deal?.dealStage ?? null,
        hubspotUrl: portalId
          ? `https://app.hubspot.com/contacts/${portalId}/contact/${c.id}`
          : null,
      },
    });
  } catch (err) {
    console.error("[hubspot/contact] error:", err);
    res.status(500).json({ error: "Failed to look up contact" });
  }
});

router.post("/hubspot/contact", requireAuth, async (req, res) => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const { email, firstName, lastName, company } = req.body as {
    email: string;
    firstName?: string;
    lastName?: string;
    company?: string;
  };

  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  const tokenInfo = await getHubSpotToken(userId);
  if (!tokenInfo) {
    return res.status(400).json({ error: "HubSpot not connected" });
  }

  try {
    const createRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenInfo.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          email,
          ...(firstName ? { firstname: firstName } : {}),
          ...(lastName ? { lastname: lastName } : {}),
          ...(company ? { company } : {}),
        },
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({ message: "unknown" })) as { message?: string };
      console.error("[hubspot/contact POST] failed:", err);
      return res.status(500).json({ error: "Failed to create contact" });
    }

    const created = await createRes.json();
    res.json({ success: true, contact: created });
  } catch (err) {
    console.error("[hubspot/contact POST] error:", err);
    res.status(500).json({ error: "Failed to create contact" });
  }
});

export default router;
