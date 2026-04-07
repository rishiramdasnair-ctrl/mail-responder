import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createOAuthState, verifyOAuthState } from "../lib/oauthState";

const router = Router();

function getGitHubRedirectUri() {
  if (process.env.GITHUB_REDIRECT_URI) return process.env.GITHUB_REDIRECT_URI;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  return `https://${domain}/api/auth/github/callback`;
}

function getFrontendUrl() {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  return `https://${domain}`;
}

router.get("/auth/github/mobile-url", requireAuth, (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(400).json({ error: "GitHub not configured" });
  }
  const auth = getAuth(req);
  const userId = auth.userId!;
  try {
    const state = createOAuthState(userId, false, "mobile");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getGitHubRedirectUri(),
      scope: "repo read:user read:org",
      state,
    });
    res.json({ url: `https://github.com/login/oauth/authorize?${params}` });
  } catch {
    res.status(500).json({ error: "Failed to generate auth URL" });
  }
});

router.get("/auth/github/start", requireAuth, (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.redirect(`${getFrontendUrl()}?error=github_not_configured`);
  }

  const auth = getAuth(req);
  const userId = auth.userId!;
  const platform = (req.query.platform as string) === "mobile" ? "mobile" : undefined;

  let state: string;
  try {
    state = createOAuthState(userId, false, platform as "mobile" | undefined);
  } catch {
    return res.redirect(`${getFrontendUrl()}?error=github_state_failed`);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGitHubRedirectUri(),
    scope: "repo read:user read:org",
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

router.get("/auth/github/callback", async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    return res.redirect(`${frontendUrl}?error=github_denied`);
  }
  if (!code || !state) {
    return res.redirect(`${frontendUrl}?error=github_missing_params`);
  }

  const statePayload = verifyOAuthState(state);
  if (!statePayload) {
    return res.redirect(`${frontendUrl}?error=github_invalid_state`);
  }
  const { userId, platform } = statePayload;

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.redirect(`${frontendUrl}?error=github_not_configured`);
  }

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: getGitHubRedirectUri(),
      }),
    });

    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      return res.redirect(`${frontendUrl}?error=github_token_failed`);
    }

    // Fetch GitHub user to get display name
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
      },
    });
    const ghUser = await userRes.json() as { login?: string; name?: string };
    const displayName = ghUser.name || ghUser.login || "GitHub";

    // Upsert connector
    const existing = await db
      .select({ id: connectorsTable.id })
      .from(connectorsTable)
      .where(and(eq(connectorsTable.userId, userId), eq(connectorsTable.connectorId, "github")));

    if (existing.length > 0) {
      await db
        .update(connectorsTable)
        .set({
          displayName,
          status: "connected",
          config: { access_token: tokenData.access_token, login: ghUser.login },
          updatedAt: new Date(),
        })
        .where(eq(connectorsTable.id, existing[0].id));
    } else {
      await db.insert(connectorsTable).values({
        id: randomUUID(),
        userId,
        connectorId: "github",
        displayName,
        status: "connected",
        config: { access_token: tokenData.access_token, login: ghUser.login },
      });
    }

    if (platform === "mobile") {
      return res.redirect(`replyai://oauth-success?connector=github`);
    }
    res.redirect(`${frontendUrl}?github_connected=true`);
  } catch (err) {
    req.log?.error?.({ err }, "GitHub OAuth callback error");
    console.error("[githubAuth] callback error:", err);
    res.redirect(`${frontendUrl}?error=github_callback_failed`);
  }
});

export default router;
