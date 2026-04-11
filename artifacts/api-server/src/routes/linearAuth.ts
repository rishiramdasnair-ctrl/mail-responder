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

function getLinearRedirectUri() {
  if (process.env.LINEAR_REDIRECT_URI) return process.env.LINEAR_REDIRECT_URI;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  return `https://${domain}/api/auth/linear/callback`;
}

function getFrontendUrl() {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  return `https://${domain}`;
}

router.get("/auth/linear/mobile-url", requireAuth, (req, res) => {
  const clientId = process.env.LINEAR_CLIENT_ID;
  if (!clientId) {
    return res.status(400).json({ error: "Linear not configured" });
  }
    const userId = getReqUserId(req)!;
  try {
    const state = createOAuthState(userId, false, "mobile");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getLinearRedirectUri(),
      response_type: "code",
      scope: "read,write",
      state,
    });
    res.json({ url: `https://linear.app/oauth/authorize?${params}` });
  } catch {
    res.status(500).json({ error: "Failed to generate auth URL" });
  }
});

router.get("/auth/linear/start", requireAuth, (req, res) => {
  const clientId = process.env.LINEAR_CLIENT_ID;
  if (!clientId) {
    return res.redirect(`${getFrontendUrl()}?error=linear_not_configured`);
  }

    const userId = getReqUserId(req)!;
  const platform = (req.query.platform as string) === "mobile" ? "mobile" : undefined;

  let state: string;
  try {
    state = createOAuthState(userId, false, platform as "mobile" | undefined);
  } catch {
    return res.redirect(`${getFrontendUrl()}?error=linear_state_failed`);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getLinearRedirectUri(),
    response_type: "code",
    scope: "read,write",
    state,
  });

  res.redirect(`https://linear.app/oauth/authorize?${params}`);
});

router.get("/auth/linear/callback", async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    return res.redirect(`${frontendUrl}?error=linear_denied`);
  }
  if (!code || !state) {
    return res.redirect(`${frontendUrl}?error=linear_missing_params`);
  }

  const statePayload = verifyOAuthState(state);
  if (!statePayload) {
    return res.redirect(`${frontendUrl}?error=linear_invalid_state`);
  }
  const { userId, platform } = statePayload;

  const clientId = process.env.LINEAR_CLIENT_ID;
  const clientSecret = process.env.LINEAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.redirect(`${frontendUrl}?error=linear_not_configured`);
  }

  try {
    const tokenRes = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: getLinearRedirectUri(),
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      return res.redirect(`${frontendUrl}?error=linear_token_failed`);
    }

    // Fetch Linear viewer to get display name
    const viewerRes = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "{ viewer { id name email } }" }),
    });
    const viewerData = await viewerRes.json() as { data?: { viewer?: { name?: string; email?: string } } };
    const viewer = viewerData.data?.viewer;
    const displayName = viewer?.name || viewer?.email || "Linear";

    const existing = await db
      .select({ id: connectorsTable.id })
      .from(connectorsTable)
      .where(and(eq(connectorsTable.userId, userId), eq(connectorsTable.connectorId, "linear")));

    const linearConfig = encryptConnectorConfig({ access_token: tokenData.access_token });

    if (existing.length > 0) {
      await db
        .update(connectorsTable)
        .set({
          displayName,
          status: "connected",
          config: linearConfig,
          updatedAt: new Date(),
        })
        .where(eq(connectorsTable.id, existing[0].id));
    } else {
      await db.insert(connectorsTable).values({
        id: randomUUID(),
        userId,
        connectorId: "linear",
        displayName,
        status: "connected",
        config: linearConfig,
      });
    }

    if (platform === "mobile") {
      return res.redirect(`replyai://oauth-success?connector=linear`);
    }
    res.redirect(`${frontendUrl}?linear_connected=true`);
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.message : "Unknown error" }, "[linearAuth] callback error");
    res.redirect(`${frontendUrl}?error=linear_callback_failed`);
  }
});

export default router;
