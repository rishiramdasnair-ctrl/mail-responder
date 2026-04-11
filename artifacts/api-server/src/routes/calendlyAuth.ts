import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getReqUserId } from "../lib/getReqAuth";
import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createOAuthState, verifyOAuthState } from "../lib/oauthState";
import { encryptConnectorConfig } from "../lib/tokenCrypto";

const router = Router();

function getCalendlyRedirectUri() {
  if (process.env.CALENDLY_REDIRECT_URI) return process.env.CALENDLY_REDIRECT_URI;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  return `https://${domain}/api/auth/calendly/callback`;
}

router.get("/auth/calendly/start", requireAuth, (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const clientId = process.env.CALENDLY_CLIENT_ID;
  if (!clientId) {
    return res.redirect(`${frontendUrl}/connectors?error=calendly_not_configured`);
  }

  const userId = getReqUserId(req)!;

  let state: string;
  try {
    state = createOAuthState(userId);
  } catch {
    return res.redirect(`${frontendUrl}/connectors?error=calendly_not_configured`);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: getCalendlyRedirectUri(),
    state,
  });

  res.redirect(`https://auth.calendly.com/oauth/authorize?${params.toString()}`);
});

router.get("/auth/calendly/callback", async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const { code, state, error } = req.query;

  if (error) {
    req.log.warn({ oauthError: String(error) }, "[calendly-callback] OAuth error");
    return res.redirect(`${frontendUrl}/connectors?error=calendly_denied`);
  }

  if (!code || !state || typeof state !== "string") {
    return res.redirect(`${frontendUrl}/connectors?error=calendly_missing_params`);
  }

  const stateResult = verifyOAuthState(state);
  if (!stateResult) {
    req.log.warn("[calendly-callback] invalid or expired state");
    return res.redirect(`${frontendUrl}/connectors?error=calendly_missing_params`);
  }
  const { userId } = stateResult;

  const clientId = process.env.CALENDLY_CLIENT_ID;
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.redirect(`${frontendUrl}/connectors?error=calendly_not_configured`);
  }

  try {
    const tokenRes = await fetch("https://auth.calendly.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        redirect_uri: getCalendlyRedirectUri(),
        code: code as string,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({})) as { error_description?: string };
      req.log.error({ status: tokenRes.status }, "[calendly-callback] token exchange failed");
      return res.redirect(`${frontendUrl}/connectors?error=calendly_token_failed`);
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      token_type: string;
      expires_in?: number;
      created_at?: number;
    };

    let displayName = "Calendly";
    let ownerUri: string | null = null;
    try {
      const meRes = await fetch("https://api.calendly.com/users/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json() as { resource?: { name?: string; uri?: string } };
        if (me.resource?.name) displayName = me.resource.name;
        if (me.resource?.uri) ownerUri = me.resource.uri;
      }
    } catch {
      // non-fatal
    }

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const existing = await db
      .select({ id: connectorsTable.id })
      .from(connectorsTable)
      .where(and(
        eq(connectorsTable.userId, userId),
        eq(connectorsTable.connectorId, "calendly"),
      ))
      .limit(1);

    const config = encryptConnectorConfig({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt,
      ownerUri,
    });

    if (existing.length > 0) {
      await db.update(connectorsTable).set({
        config,
        displayName,
        status: "connected",
        updatedAt: new Date(),
      }).where(eq(connectorsTable.id, existing[0].id));
    } else {
      await db.insert(connectorsTable).values({
        id: randomUUID(),
        userId,
        connectorId: "calendly",
        displayName,
        status: "connected",
        config,
      });
    }

    res.redirect(`${frontendUrl}/connectors?calendly_connected=true`);
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.message : "Unknown error" }, "[calendly-callback] unexpected error");
    res.redirect(`${frontendUrl}/connectors?error=calendly_callback_failed`);
  }
});

export default router;
