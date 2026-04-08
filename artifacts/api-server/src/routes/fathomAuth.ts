import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createOAuthState, verifyOAuthState } from "../lib/oauthState";

const router = Router();

const FATHOM_SCOPES = "public_api";
const FATHOM_AUTH_URL = "https://fathom.video/external/v1/oauth2/authorize";
const FATHOM_TOKEN_URL = "https://fathom.video/external/v1/oauth2/token";

function getFathomRedirectUri() {
  if (process.env.FATHOM_REDIRECT_URI) return process.env.FATHOM_REDIRECT_URI;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  return `https://${domain}/api/auth/fathom/callback`;
}

function buildFathomAuthUrl(clientId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: getFathomRedirectUri(),
    scope: FATHOM_SCOPES,
    state,
  });
  return `${FATHOM_AUTH_URL}?${params.toString()}`;
}

router.get("/auth/fathom/mobile-url", requireAuth, (req, res) => {
  const clientId = process.env.FATHOM_CLIENT_ID;
  if (!clientId) { res.status(500).json({ error: "Fathom not configured" }); return; }
  const { userId } = getAuth(req);
  let state: string;
  try { state = createOAuthState(userId!, false, "mobile"); }
  catch { res.status(500).json({ error: "Fathom not configured" }); return; }
  res.json({ url: buildFathomAuthUrl(clientId, state) });
});

router.get("/auth/fathom/start", requireAuth, (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;
  const clientId = process.env.FATHOM_CLIENT_ID;
  if (!clientId) return res.redirect(`${frontendUrl}/connectors?error=fathom_not_configured`);
  const { userId } = getAuth(req);
  let state: string;
  try { state = createOAuthState(userId!); }
  catch { return res.redirect(`${frontendUrl}/connectors?error=fathom_not_configured`); }
  res.redirect(buildFathomAuthUrl(clientId, state));
});

router.get("/auth/fathom/callback", async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;
  const { code, state, error } = req.query;

  if (error) return res.redirect(`${frontendUrl}/connectors?error=fathom_denied`);
  if (!code || !state || typeof state !== "string") return res.redirect(`${frontendUrl}/connectors?error=fathom_missing_params`);

  const stateResult = verifyOAuthState(state);
  if (!stateResult) return res.redirect(`${frontendUrl}/connectors?error=fathom_missing_params`);
  const { userId, platform } = stateResult;

  const clientId = process.env.FATHOM_CLIENT_ID;
  const clientSecret = process.env.FATHOM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    if (platform === "mobile") return res.redirect("replyai://oauth-error?reason=fathom_not_configured");
    return res.redirect(`${frontendUrl}/connectors?error=fathom_not_configured`);
  }

  try {
    const tokenRes = await fetch(FATHOM_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        redirect_uri: getFathomRedirectUri(),
        code: code as string,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      console.error("[fathom-callback] token exchange failed:", err);
      if (platform === "mobile") return res.redirect("replyai://oauth-error?reason=fathom_token_failed");
      return res.redirect(`${frontendUrl}/connectors?error=fathom_token_failed`);
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      token_type: string;
      expires_in?: number;
    };

    let displayName = "Fathom";
    try {
      const meRes = await fetch("https://fathom.video/external/v1/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json() as { name?: string; email?: string };
        if (me.name || me.email) displayName = `Fathom — ${me.name || me.email}`;
      }
    } catch { /* non-fatal */ }

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const existing = await db.select({ id: connectorsTable.id })
      .from(connectorsTable)
      .where(and(eq(connectorsTable.userId, userId), eq(connectorsTable.connectorId, "fathom")))
      .limit(1);

    const config = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? null, expiresAt };

    if (existing.length > 0) {
      await db.update(connectorsTable).set({ config, displayName, status: "connected", updatedAt: new Date() })
        .where(eq(connectorsTable.id, existing[0].id));
    } else {
      await db.insert(connectorsTable).values({ id: randomUUID(), userId, connectorId: "fathom", displayName, status: "connected", config });
    }

    if (platform === "mobile") return res.redirect("replyai://oauth-success?event=fathom_connected");
    res.redirect(`${frontendUrl}/connectors?fathom_connected=true`);
  } catch (err) {
    console.error("[fathom-callback] unexpected error:", err);
    if (platform === "mobile") return res.redirect("replyai://oauth-error?reason=fathom_callback_failed");
    res.redirect(`${frontendUrl}/connectors?error=fathom_callback_failed`);
  }
});

export default router;
