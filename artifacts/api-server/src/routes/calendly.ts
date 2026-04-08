import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { decryptConnectorConfig, encryptConnectorConfig } from "../lib/tokenCrypto";

const router = Router();

interface CalendlyConnectorConfig {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  ownerUri?: string | null;
}

async function refreshCalendlyToken(userId: string, config: CalendlyConnectorConfig): Promise<string | null> {
  const clientId = process.env.CALENDLY_CLIENT_ID;
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET;
  if (!clientId || !clientSecret || !config.refreshToken) return null;

  try {
    const res = await fetch("https://auth.calendly.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: config.refreshToken,
      }).toString(),
    });
    if (!res.ok) return null;

    const tokens = await res.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const newExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const newConfig = encryptConnectorConfig({
      ...config,
      accessToken: tokens.access_token,
      expiresAt: newExpiresAt,
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    });

    await db.update(connectorsTable).set({
      config: newConfig,
      updatedAt: new Date(),
    }).where(and(
      eq(connectorsTable.userId, userId),
      eq(connectorsTable.connectorId, "calendly"),
    ));

    return tokens.access_token;
  } catch {
    return null;
  }
}

async function getCalendlyToken(userId: string): Promise<{ token: string; ownerUri: string | null } | null> {
  const rows = await db
    .select({ config: connectorsTable.config })
    .from(connectorsTable)
    .where(and(
      eq(connectorsTable.userId, userId),
      eq(connectorsTable.connectorId, "calendly"),
      eq(connectorsTable.status, "connected"),
    ))
    .limit(1);

  if (!rows.length) return null;
  const config = rows[0].config ? decryptConnectorConfig(rows[0].config as Record<string, unknown>) as unknown as CalendlyConnectorConfig : null;
  if (!config?.accessToken) return null;

  const ownerUri = config.ownerUri ?? null;
  const expiresAt = config.expiresAt ? new Date(config.expiresAt) : null;

  if (!expiresAt || expiresAt > new Date()) {
    return { token: config.accessToken, ownerUri };
  }

  const refreshed = await refreshCalendlyToken(userId, config);
  return refreshed ? { token: refreshed, ownerUri } : null;
}

router.get("/calendly/event-types", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const tokenInfo = await getCalendlyToken(userId);
  if (!tokenInfo) {
    res.status(404).json({ connected: false, eventTypes: [] });
    return;
  }

  const { token, ownerUri } = tokenInfo;

  try {
    const params = new URLSearchParams({ active: "true", count: "100" });
    if (ownerUri) params.set("user", ownerUri);

    const evtRes = await fetch(`https://api.calendly.com/event_types?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!evtRes.ok) {
      const errData = await evtRes.json().catch(() => ({})) as { message?: string };
      req.log.error({ status: evtRes.status, calendlyMessage: errData.message }, "[calendly/event-types] API error");
      res.status(500).json({ error: "Failed to fetch event types" });
      return;
    }

    const data = await evtRes.json() as {
      collection?: Array<{
        uri: string;
        name: string;
        duration: number;
        scheduling_url: string;
        slug: string;
        active: boolean;
        description_plain?: string | null;
      }>;
    };

    const eventTypes = (data.collection ?? [])
      .filter(et => et.active)
      .map(et => ({
        uri: et.uri,
        name: et.name,
        duration: et.duration,
        schedulingUrl: et.scheduling_url,
        slug: et.slug,
        description: et.description_plain ?? null,
      }));

    res.json({ connected: true, eventTypes });
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.message : "Unknown error" }, "[calendly/event-types] error");
    res.status(500).json({ error: "Failed to fetch event types" });
  }
});

export default router;
