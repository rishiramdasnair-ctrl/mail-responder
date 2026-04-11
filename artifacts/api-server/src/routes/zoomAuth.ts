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

function getZoomRedirectUri() {
  if (process.env.ZOOM_REDIRECT_URI) return process.env.ZOOM_REDIRECT_URI;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  return `https://${domain}/api/auth/zoom/callback`;
}

function buildZoomAuthUrl(clientId: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: getZoomRedirectUri(),
    state,
  });
  return `https://zoom.us/oauth/authorize?${params.toString()}`;
}

router.get("/auth/zoom/mobile-url", requireAuth, (req, res) => {
  const clientId = process.env.ZOOM_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: "Zoom not configured" });
    return;
  }

    const userId = getReqUserId(req)!;

  let state: string;
  try {
    state = createOAuthState(userId, false, "mobile");
  } catch {
    res.status(500).json({ error: "Zoom not configured" });
    return;
  }

  res.json({ url: buildZoomAuthUrl(clientId, state) });
});

router.get("/auth/zoom/start", requireAuth, (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const clientId = process.env.ZOOM_CLIENT_ID;
  if (!clientId) {
    return res.redirect(`${frontendUrl}/connectors?error=zoom_not_configured`);
  }

    const userId = getReqUserId(req)!;

  let state: string;
  try {
    state = createOAuthState(userId);
  } catch {
    return res.redirect(`${frontendUrl}/connectors?error=zoom_not_configured`);
  }

  res.redirect(buildZoomAuthUrl(clientId, state));
});

router.get("/auth/zoom/callback", async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const { code, state, error } = req.query;

  if (error) {
    req.log.warn({ oauthError: String(error) }, "[zoom-callback] OAuth error");
    return res.redirect(`${frontendUrl}/connectors?error=zoom_denied`);
  }

  if (!code || !state || typeof state !== "string") {
    return res.redirect(`${frontendUrl}/connectors?error=zoom_missing_params`);
  }

  const stateResult = verifyOAuthState(state);
  if (!stateResult) {
    req.log.warn("[zoom-callback] invalid or expired state");
    return res.redirect(`${frontendUrl}/connectors?error=zoom_missing_params`);
  }
  const { userId, platform } = stateResult;

  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    if (platform === "mobile") return res.redirect("replyai://oauth-error?reason=zoom_not_configured");
    return res.redirect(`${frontendUrl}/connectors?error=zoom_not_configured`);
  }

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://zoom.us/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code as string,
        redirect_uri: getZoomRedirectUri(),
      }).toString(),
    });

    if (!tokenRes.ok) {
      req.log.error({ status: tokenRes.status }, "[zoom-callback] token exchange failed");
      if (platform === "mobile") return res.redirect("replyai://oauth-error?reason=zoom_token_failed");
      return res.redirect(`${frontendUrl}/connectors?error=zoom_token_failed`);
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      token_type: string;
      expires_in?: number;
      scope?: string;
    };

    let displayName = "Zoom";
    let zoomUserId: string | null = null;
    let zoomEmail: string | null = null;
    try {
      const meRes = await fetch("https://api.zoom.us/v2/users/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json() as { display_name?: string; email?: string; id?: string };
        if (me.display_name) displayName = `Zoom — ${me.display_name}`;
        else if (me.email) displayName = `Zoom — ${me.email}`;
        if (me.id) zoomUserId = me.id;
        if (me.email) zoomEmail = me.email;
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
        eq(connectorsTable.connectorId, "zoom"),
      ))
      .limit(1);

    const config = encryptConnectorConfig({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt,
      zoomUserId,
      zoomEmail,
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
        connectorId: "zoom",
        displayName,
        status: "connected",
        config,
      });
    }

    if (platform === "mobile") {
      return res.redirect("replyai://oauth-success?event=zoom_connected");
    }
    res.redirect(`${frontendUrl}/connectors?zoom_connected=true`);
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.message : "Unknown error" }, "[zoom-callback] unexpected error");
    if (platform === "mobile") return res.redirect("replyai://oauth-error?reason=zoom_callback_failed");
    res.redirect(`${frontendUrl}/connectors?error=zoom_callback_failed`);
  }
});

export default router;
