import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

const HUBSPOT_SCOPES = [
  "contacts",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.deals.read",
].join(" ");

function getHubSpotRedirectUri() {
  if (process.env.HUBSPOT_REDIRECT_URI) return process.env.HUBSPOT_REDIRECT_URI;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  return `https://${domain}/api/auth/hubspot/callback`;
}

router.get("/auth/hubspot/start", requireAuth, (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const clientId = process.env.HUBSPOT_CLIENT_ID;
  if (!clientId) {
    return res.redirect(`${frontendUrl}/connectors?error=hubspot_not_configured`);
  }

  const auth = getAuth(req);
  const userId = auth.userId!;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getHubSpotRedirectUri(),
    scope: HUBSPOT_SCOPES,
    state: userId,
  });

  res.redirect(`https://app.hubspot.com/oauth/authorize?${params.toString()}`);
});

router.get("/auth/hubspot/callback", async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const { code, state: userId, error } = req.query;

  if (error) {
    console.error("[hubspot-callback] OAuth error:", error);
    return res.redirect(`${frontendUrl}/connectors?error=hubspot_denied`);
  }

  if (!code || !userId) {
    return res.redirect(`${frontendUrl}/connectors?error=hubspot_missing_params`);
  }

  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.redirect(`${frontendUrl}/connectors?error=hubspot_not_configured`);
  }

  try {
    const tokenRes = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getHubSpotRedirectUri(),
        code: code as string,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      console.error("[hubspot-callback] token exchange failed:", err);
      return res.redirect(`${frontendUrl}/connectors?error=hubspot_token_failed`);
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      hub_id?: number;
    };

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Get portal info
    let portalId: string | null = null;
    try {
      const infoRes = await fetch("https://api.hubapi.com/oauth/v1/access-tokens/" + tokens.access_token);
      if (infoRes.ok) {
        const info = await infoRes.json() as { hub_id?: number };
        portalId = info.hub_id ? String(info.hub_id) : null;
      }
    } catch {
      // non-fatal
    }

    const existing = await db
      .select({ id: connectorsTable.id })
      .from(connectorsTable)
      .where(and(
        eq(connectorsTable.userId, userId as string),
        eq(connectorsTable.connectorId, "hubspot"),
      ))
      .limit(1);

    const config = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: expiresAt.toISOString(),
      portalId,
    };

    if (existing.length > 0) {
      await db.update(connectorsTable).set({
        config,
        status: "connected",
        updatedAt: new Date(),
      }).where(eq(connectorsTable.id, existing[0].id));
    } else {
      await db.insert(connectorsTable).values({
        id: randomUUID(),
        userId: userId as string,
        connectorId: "hubspot",
        displayName: "HubSpot",
        status: "connected",
        config,
      });
    }

    res.redirect(`${frontendUrl}/connectors?hubspot_connected=true`);
  } catch (err) {
    console.error("[hubspot-callback] unexpected error:", err);
    res.redirect(`${frontendUrl}/connectors?error=hubspot_callback_failed`);
  }
});

router.post("/auth/hubspot/disconnect", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth.userId!;

    await db
      .delete(connectorsTable)
      .where(and(
        eq(connectorsTable.userId, userId),
        eq(connectorsTable.connectorId, "hubspot"),
      ));

    res.json({ success: true });
  } catch (err) {
    console.error("[hubspot-disconnect] error:", err);
    res.status(500).json({ error: "Failed to disconnect HubSpot" });
  }
});

export default router;
