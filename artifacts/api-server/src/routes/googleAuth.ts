import { Router } from "express";
import { google } from "googleapis";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getOrCreateUser } from "../lib/getOrCreateUser";

const router = Router();

function getRedirectUri() {
  // Prefer explicit override, then fall back to REPLIT_DOMAINS
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  return `https://${domain}/api/auth/google/callback`;
}

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getRedirectUri();

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
];

router.get("/auth/google/start", requireAuth, async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  try {
    const auth = getAuth(req);
    const userId = auth.userId!;
    const oAuth2Client = getOAuthClient();

    const url = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: GMAIL_SCOPES,
      prompt: "consent",
      state: userId,
    });

    console.log("[google-start] redirect_uri:", getRedirectUri());
    console.log("[google-start] userId:", userId);
    console.log("[google-start] oauth_url:", url);

    res.redirect(url);
  } catch (err: any) {
    if (err.message?.includes("GOOGLE_CLIENT_ID")) {
      res.redirect(`${frontendUrl}/settings?gmail_error=not_configured`);
    } else {
      res.redirect(`${frontendUrl}/settings?gmail_error=start_failed`);
    }
  }
});

router.get("/auth/google/callback", async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  try {
    const { code, state: userId, error } = req.query;

    console.log("[google-callback] received", { hasCode: !!code, userId, error });

    if (error) {
      console.error("[google-callback] Google returned error:", error);
      res.redirect(`${frontendUrl}/settings?gmail_error=access_denied`);
      return;
    }

    if (!code || !userId) {
      console.error("[google-callback] Missing params", { code: !!code, userId });
      res.redirect(`${frontendUrl}/settings?gmail_error=missing_params`);
      return;
    }

    let tokens;
    try {
      const result = await getOAuthClient().getToken(code as string);
      tokens = result.tokens;
      console.log("[google-callback] token exchange ok", {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresAt: tokens.expiry_date,
      });
    } catch (tokenErr: any) {
      console.error("[google-callback] token exchange FAILED:", tokenErr?.message, tokenErr?.response?.data);
      res.redirect(`${frontendUrl}/settings?gmail_error=callback_failed`);
      return;
    }

    if (!tokens.access_token) {
      console.error("[google-callback] no access_token in response");
      res.redirect(`${frontendUrl}/settings?gmail_error=callback_failed`);
      return;
    }

    // Get the user's Gmail address
    const oAuth2Client = getOAuthClient();
    oAuth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oAuth2Client });
    const userInfo = await oauth2.userinfo.get();
    const googleEmail = userInfo.data.email || "";

    console.log("[google-callback] got gmail address:", googleEmail, "for userId:", userId);

    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    // Upsert so it works even if the user row doesn't exist yet
    const updated = await db.update(usersTable)
      .set({
        googleAccessToken: tokens.access_token,
        ...(tokens.refresh_token ? { googleRefreshToken: tokens.refresh_token } : {}),
        googleTokenExpiresAt: expiresAt,
        googleEmail,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId as string))
      .returning({ id: usersTable.id });

    console.log("[google-callback] DB update rows:", updated.length, "userId searched:", userId);

    if (updated.length === 0) {
      // User row doesn't exist yet — create it
      console.log("[google-callback] user not found in DB, inserting...");
      await db.insert(usersTable).values({
        id: userId as string,
        email: googleEmail,
        googleEmail,
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token || null,
        googleTokenExpiresAt: expiresAt,
      }).onConflictDoNothing();
    }

    res.redirect(`${frontendUrl}/dashboard?gmail_connected=true`);
  } catch (err) {
    console.error("[google-callback] unexpected error:", err);
    res.redirect(`${frontendUrl}/settings?gmail_error=callback_failed`);
  }
});

router.post("/auth/google/disconnect", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth.userId!;

    await db.update(usersTable)
      .set({
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiresAt: null,
        googleEmail: null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to disconnect Gmail" });
  }
});

export default router;
