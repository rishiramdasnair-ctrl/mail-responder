import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createOAuthState, verifyOAuthState } from "../lib/oauthState";

const router = Router();

const SLACK_SCOPES = ["channels:read", "chat:write", "users:read"].join(",");

function getSlackRedirectUri() {
  if (process.env.SLACK_REDIRECT_URI) return process.env.SLACK_REDIRECT_URI;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  return `https://${domain}/api/auth/slack/callback`;
}

router.get("/auth/slack/start", requireAuth, (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return res.redirect(`${frontendUrl}/connectors?error=slack_not_configured`);
  }

  const auth = getAuth(req);
  const userId = auth.userId!;

  let state: string;
  try {
    state = createOAuthState(userId);
  } catch {
    return res.redirect(`${frontendUrl}/connectors?error=slack_not_configured`);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    scope: SLACK_SCOPES,
    redirect_uri: getSlackRedirectUri(),
    state,
  });

  res.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
});

router.get("/auth/slack/callback", async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const { code, state, error } = req.query;

  if (error) {
    console.error("[slack-callback] OAuth error:", error);
    return res.redirect(`${frontendUrl}/connectors?error=slack_denied`);
  }

  if (!code || !state || typeof state !== "string") {
    return res.redirect(`${frontendUrl}/connectors?error=slack_missing_params`);
  }

  const stateResult = verifyOAuthState(state);
  if (!stateResult) {
    console.error("[slack-callback] invalid or expired state");
    return res.redirect(`${frontendUrl}/connectors?error=slack_missing_params`);
  }
  const { userId } = stateResult;

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.redirect(`${frontendUrl}/connectors?error=slack_not_configured`);
  }

  try {
    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code as string,
        redirect_uri: getSlackRedirectUri(),
      }).toString(),
    });

    const tokens = await tokenRes.json() as {
      ok: boolean;
      error?: string;
      access_token?: string;
      bot_user_id?: string;
      team?: { name?: string; id?: string };
      authed_user?: { id?: string };
    };

    if (!tokens.ok || !tokens.access_token) {
      console.error("[slack-callback] token exchange failed:", tokens.error);
      return res.redirect(`${frontendUrl}/connectors?error=slack_token_failed`);
    }

    const teamName = tokens.team?.name ?? "Slack";
    const displayName = `Slack — ${teamName}`;

    const existing = await db
      .select({ id: connectorsTable.id })
      .from(connectorsTable)
      .where(and(
        eq(connectorsTable.userId, userId),
        eq(connectorsTable.connectorId, "slack"),
      ))
      .limit(1);

    const config = {
      accessToken: tokens.access_token,
      teamId: tokens.team?.id ?? null,
      teamName,
    };

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
        connectorId: "slack",
        displayName,
        status: "connected",
        config,
      });
    }

    res.redirect(`${frontendUrl}/connectors?slack_connected=true`);
  } catch (err) {
    console.error("[slack-callback] unexpected error:", err);
    res.redirect(`${frontendUrl}/connectors?error=slack_callback_failed`);
  }
});

export default router;
