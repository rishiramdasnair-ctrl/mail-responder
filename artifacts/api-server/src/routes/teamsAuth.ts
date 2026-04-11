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

const TEAMS_SCOPES = [
  "OnlineMeetings.ReadWrite",
  "Chat.ReadWrite",
  "ChannelMessage.Send",
  "Team.ReadBasic.All",
  "Channel.ReadBasic.All",
  "User.Read",
  "offline_access",
].join(" ");

function getTeamsRedirectUri() {
  if (process.env.TEAMS_REDIRECT_URI) return process.env.TEAMS_REDIRECT_URI;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  return `https://${domain}/api/auth/teams/callback`;
}

function getTenantId() {
  return process.env.TEAMS_TENANT_ID || "common";
}

function buildTeamsAuthUrl(clientId: string, state: string): string {
  const tenantId = getTenantId();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: getTeamsRedirectUri(),
    scope: TEAMS_SCOPES,
    response_mode: "query",
    state,
  });
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
}

router.get("/auth/teams/mobile-url", requireAuth, (req, res) => {
  const clientId = process.env.TEAMS_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: "Teams not configured" });
    return;
  }

    const userId = getReqUserId(req)!;

  let state: string;
  try {
    state = createOAuthState(userId, false, "mobile");
  } catch {
    res.status(500).json({ error: "Teams not configured" });
    return;
  }

  res.json({ url: buildTeamsAuthUrl(clientId, state) });
});

router.get("/auth/teams/start", requireAuth, (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const clientId = process.env.TEAMS_CLIENT_ID;
  if (!clientId) {
    return res.redirect(`${frontendUrl}/connectors?error=teams_not_configured`);
  }

    const userId = getReqUserId(req)!;

  let state: string;
  try {
    state = createOAuthState(userId);
  } catch {
    return res.redirect(`${frontendUrl}/connectors?error=teams_not_configured`);
  }

  res.redirect(buildTeamsAuthUrl(clientId, state));
});

router.get("/auth/teams/callback", async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const { code, state, error } = req.query;

  if (error) {
    req.log.warn({ oauthError: String(error) }, "[teams-callback] OAuth error");
    return res.redirect(`${frontendUrl}/connectors?error=teams_denied`);
  }

  if (!code || !state || typeof state !== "string") {
    return res.redirect(`${frontendUrl}/connectors?error=teams_missing_params`);
  }

  const stateResult = verifyOAuthState(state);
  if (!stateResult) {
    req.log.warn("[teams-callback] invalid or expired state");
    return res.redirect(`${frontendUrl}/connectors?error=teams_missing_params`);
  }
  const { userId, platform } = stateResult;

  const clientId = process.env.TEAMS_CLIENT_ID;
  const clientSecret = process.env.TEAMS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    if (platform === "mobile") return res.redirect("replyai://oauth-error?reason=teams_not_configured");
    return res.redirect(`${frontendUrl}/connectors?error=teams_not_configured`);
  }

  try {
    const tenantId = getTenantId();
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        redirect_uri: getTeamsRedirectUri(),
        code: code as string,
        scope: TEAMS_SCOPES,
      }).toString(),
    });

    if (!tokenRes.ok) {
      req.log.error({ status: tokenRes.status }, "[teams-callback] token exchange failed");
      if (platform === "mobile") return res.redirect("replyai://oauth-error?reason=teams_token_failed");
      return res.redirect(`${frontendUrl}/connectors?error=teams_token_failed`);
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      token_type: string;
      expires_in?: number;
      scope?: string;
    };

    let displayName = "Microsoft Teams";
    let teamsEmail: string | null = null;
    let teamsUserId: string | null = null;
    try {
      const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json() as { displayName?: string; mail?: string; userPrincipalName?: string; id?: string };
        if (me.displayName) displayName = `Teams — ${me.displayName}`;
        teamsEmail = me.mail ?? me.userPrincipalName ?? null;
        teamsUserId = me.id ?? null;
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
        eq(connectorsTable.connectorId, "teams"),
      ))
      .limit(1);

    const config = encryptConnectorConfig({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt,
      teamsUserId,
      teamsEmail,
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
        connectorId: "teams",
        displayName,
        status: "connected",
        config,
      });
    }

    if (platform === "mobile") {
      return res.redirect("replyai://oauth-success?event=teams_connected");
    }
    res.redirect(`${frontendUrl}/connectors?teams_connected=true`);
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.message : "Unknown error" }, "[teams-callback] unexpected error");
    if (platform === "mobile") return res.redirect("replyai://oauth-error?reason=teams_callback_failed");
    res.redirect(`${frontendUrl}/connectors?error=teams_callback_failed`);
  }
});

export default router;
