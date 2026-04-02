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

    if (error) {
      res.redirect(`${frontendUrl}/settings?gmail_error=access_denied`);
      return;
    }

    if (!code || !userId) {
      res.redirect(`${frontendUrl}/settings?gmail_error=missing_params`);
      return;
    }

    const oAuth2Client = getOAuthClient();
    const { tokens } = await oAuth2Client.getToken(code as string);

    oAuth2Client.setCredentials(tokens);

    // Get the user's Gmail address
    const oauth2 = google.oauth2({ version: "v2", auth: oAuth2Client });
    const userInfo = await oauth2.userinfo.get();
    const googleEmail = userInfo.data.email || "";

    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    await db.update(usersTable)
      .set({
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token || undefined,
        googleTokenExpiresAt: expiresAt,
        googleEmail,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId as string));

    res.redirect(`${frontendUrl}/dashboard?gmail_connected=true`);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
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
