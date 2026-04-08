import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createOAuthState, verifyOAuthState } from "../lib/oauthState";
import { encryptConnectorConfig } from "../lib/tokenCrypto";

const router = Router();

const LINKEDIN_SCOPES = ["openid", "profile", "email"].join(" ");

function getLinkedInRedirectUri() {
  if (process.env.LINKEDIN_REDIRECT_URI) return process.env.LINKEDIN_REDIRECT_URI;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  return `https://${domain}/api/auth/linkedin/callback`;
}

router.get("/auth/linkedin/start", requireAuth, (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) {
    return res.redirect(`${frontendUrl}/connectors?error=linkedin_not_configured`);
  }

  const auth = getAuth(req);
  const userId = auth.userId!;

  let state: string;
  try {
    state = createOAuthState(userId);
  } catch {
    return res.redirect(`${frontendUrl}/connectors?error=linkedin_not_configured`);
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: getLinkedInRedirectUri(),
    scope: LINKEDIN_SCOPES,
    state,
  });

  res.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`);
});

router.get("/auth/linkedin/callback", async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const { code, state, error } = req.query;

  if (error) {
    req.log.warn({ oauthError: String(error) }, "[linkedin-callback] OAuth error");
    return res.redirect(`${frontendUrl}/connectors?error=linkedin_denied`);
  }

  if (!code || !state || typeof state !== "string") {
    return res.redirect(`${frontendUrl}/connectors?error=linkedin_missing_params`);
  }

  const stateResult = verifyOAuthState(state);
  if (!stateResult) {
    req.log.warn("[linkedin-callback] invalid or expired state");
    return res.redirect(`${frontendUrl}/connectors?error=linkedin_missing_params`);
  }
  const { userId } = stateResult;

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.redirect(`${frontendUrl}/connectors?error=linkedin_not_configured`);
  }

  try {
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getLinkedInRedirectUri(),
        code: code as string,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({})) as { error_description?: string };
      req.log.error({ status: tokenRes.status }, "[linkedin-callback] token exchange failed");
      return res.redirect(`${frontendUrl}/connectors?error=linkedin_token_failed`);
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
      refresh_token_expires_in?: number;
    };

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    let displayName = "LinkedIn";
    let connectedProfile: {
      sub?: string;
      name?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      email?: string;
    } = {};

    try {
      const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (profileRes.ok) {
        connectedProfile = await profileRes.json() as typeof connectedProfile;
        if (connectedProfile.name) displayName = connectedProfile.name;
      }
    } catch {
      // non-fatal
    }

    const existing = await db
      .select({ id: connectorsTable.id })
      .from(connectorsTable)
      .where(and(
        eq(connectorsTable.userId, userId),
        eq(connectorsTable.connectorId, "linkedin"),
      ))
      .limit(1);

    const config = encryptConnectorConfig({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: expiresAt.toISOString(),
      connectedUserName: connectedProfile.name ?? null,
      connectedUserEmail: connectedProfile.email ?? null,
      connectedUserPhoto: connectedProfile.picture ?? null,
      connectedUserSub: connectedProfile.sub ?? null,
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
        connectorId: "linkedin",
        displayName,
        status: "connected",
        config,
      });
    }

    res.redirect(`${frontendUrl}/connectors?linkedin_connected=true`);
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.message : "Unknown error" }, "[linkedin-callback] unexpected error");
    res.redirect(`${frontendUrl}/connectors?error=linkedin_callback_failed`);
  }
});

export default router;
