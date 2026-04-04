import { Router } from "express";
import { google } from "googleapis";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { usersTable, connectorsTable, gmailAccountsTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getOrCreateUser } from "../lib/getOrCreateUser";
import { createOAuthState, verifyOAuthState } from "../lib/oauthState";
import { getConnectedGmailAccounts } from "../lib/gmailClient";

const router = Router();

function getRedirectUri() {
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
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/contacts.readonly",
];

const GSUITE_EXTENSION_CONNECTORS = ["google-drive", "google-contacts"];

router.get("/auth/google/start", requireAuth, async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  try {
    const auth = getAuth(req);
    const userId = auth.userId!;
    const addAccount = req.query.addAccount === "true";
    const oAuth2Client = getOAuthClient();

    let state: string;
    try {
      state = createOAuthState(userId, addAccount);
    } catch {
      res.redirect(`${frontendUrl}/settings?gmail_error=not_configured`);
      return;
    }

    const url = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: GMAIL_SCOPES,
      prompt: "consent",
      state,
    });

    console.log("[google-start] redirect_uri:", getRedirectUri(), "addAccount:", addAccount);
    res.redirect(url);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("GOOGLE_CLIENT_ID")) {
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
    const { code, state, error } = req.query;

    if (error) {
      console.error("[google-callback] Google returned error:", error);
      res.redirect(`${frontendUrl}/settings?gmail_error=access_denied`);
      return;
    }

    if (!code || !state || typeof state !== "string") {
      res.redirect(`${frontendUrl}/settings?gmail_error=missing_params`);
      return;
    }

    const statePayload = verifyOAuthState(state);
    if (!statePayload) {
      res.redirect(`${frontendUrl}/settings?gmail_error=missing_params`);
      return;
    }

    const { userId, addAccount } = statePayload;

    let tokens;
    try {
      const result = await getOAuthClient().getToken(code as string);
      tokens = result.tokens;
    } catch (tokenErr: unknown) {
      const msg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
      console.error("[google-callback] token exchange FAILED:", msg);
      res.redirect(`${frontendUrl}/settings?gmail_error=callback_failed`);
      return;
    }

    if (!tokens.access_token) {
      res.redirect(`${frontendUrl}/settings?gmail_error=callback_failed`);
      return;
    }

    const oAuth2Client = getOAuthClient();
    oAuth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oAuth2Client });
    const userInfo = await oauth2.userinfo.get();
    const googleEmail = userInfo.data.email || "";

    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    // Determine if this should be the primary account
    const existingAccounts = await db.select({ id: gmailAccountsTable.id })
      .from(gmailAccountsTable)
      .where(eq(gmailAccountsTable.userId, userId));
    const isFirstAccount = existingAccounts.length === 0;

    // If adding a new account that already exists as the primary, keep it primary
    const existingRow = await db.select().from(gmailAccountsTable)
      .where(and(eq(gmailAccountsTable.userId, userId), eq(gmailAccountsTable.email, googleEmail)))
      .limit(1);
    const shouldBePrimary = isFirstAccount || (existingRow.length > 0 && existingRow[0].isPrimary);

    // Upsert into gmail_accounts (update tokens if email already connected)
    if (existingRow.length > 0) {
      await db.update(gmailAccountsTable)
        .set({
          accessToken: tokens.access_token,
          ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
          tokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(gmailAccountsTable.id, existingRow[0].id));
    } else {
      await db.insert(gmailAccountsTable).values({
        userId,
        email: googleEmail,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || "",
        tokenExpiresAt: expiresAt,
        isPrimary: shouldBePrimary,
      });
    }

    // Also update users table for backward compatibility (primary account only)
    if (!addAccount || isFirstAccount || shouldBePrimary) {
      const updated = await db.update(usersTable)
        .set({
          googleAccessToken: tokens.access_token,
          ...(tokens.refresh_token ? { googleRefreshToken: tokens.refresh_token } : {}),
          googleTokenExpiresAt: expiresAt,
          googleEmail,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, userId))
        .returning({ id: usersTable.id });

      if (updated.length === 0) {
        await db.insert(usersTable).values({
          id: userId,
          email: googleEmail,
          googleEmail,
          googleAccessToken: tokens.access_token,
          googleRefreshToken: tokens.refresh_token || null,
          googleTokenExpiresAt: expiresAt,
        }).onConflictDoNothing();
      }
    } else {
      // Ensure user exists
      await getOrCreateUser(userId);
    }

    const redirectParam = addAccount ? "gmail_account_added=true" : "gmail_connected=true";
    res.redirect(`${frontendUrl}/dashboard?${redirectParam}`);
  } catch (err) {
    console.error("[google-callback] unexpected error:", err);
    res.redirect(`${frontendUrl}/settings?gmail_error=callback_failed`);
  }
});

// List all connected Gmail accounts
router.get("/gmail/accounts", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const accounts = await getConnectedGmailAccounts(userId);
    res.json({ accounts });
  } catch (err) {
    console.error("[gmail-accounts] error:", err);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

// Disconnect a specific Gmail account
router.delete("/gmail/accounts/:email", requireAuth, async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const email = decodeURIComponent(req.params.email);

    // Find the account
    const [account] = await db.select().from(gmailAccountsTable)
      .where(and(eq(gmailAccountsTable.userId, userId), eq(gmailAccountsTable.email, email)))
      .limit(1);

    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    await db.delete(gmailAccountsTable)
      .where(and(eq(gmailAccountsTable.userId, userId), eq(gmailAccountsTable.email, email)));

    // If we removed the primary, promote another
    if (account.isPrimary) {
      const remaining = await db.select().from(gmailAccountsTable)
        .where(eq(gmailAccountsTable.userId, userId))
        .limit(1);
      if (remaining.length > 0) {
        await db.update(gmailAccountsTable)
          .set({ isPrimary: true, updatedAt: new Date() })
          .where(eq(gmailAccountsTable.id, remaining[0].id));
        // Update users table to reflect new primary
        await db.update(usersTable)
          .set({ googleEmail: remaining[0].email, updatedAt: new Date() })
          .where(eq(usersTable.id, userId));
      } else {
        // No more accounts — clear users table tokens
        await db.update(usersTable)
          .set({
            googleAccessToken: null,
            googleRefreshToken: null,
            googleTokenExpiresAt: null,
            googleEmail: null,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, userId));
        await db.delete(connectorsTable).where(
          and(
            eq(connectorsTable.userId, userId),
            inArray(connectorsTable.connectorId, GSUITE_EXTENSION_CONNECTORS),
          ),
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[gmail-account-disconnect] error:", err);
    res.status(500).json({ error: "Failed to disconnect account" });
  }
});

router.post("/auth/google/disconnect", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth.userId!;

    // Remove all accounts
    await db.delete(gmailAccountsTable).where(eq(gmailAccountsTable.userId, userId));
    await db.update(usersTable)
      .set({
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiresAt: null,
        googleEmail: null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    await db.delete(connectorsTable).where(
      and(
        eq(connectorsTable.userId, userId),
        inArray(connectorsTable.connectorId, GSUITE_EXTENSION_CONNECTORS),
      ),
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[google-disconnect] error:", err);
    res.status(500).json({ error: "Failed to disconnect Gmail" });
  }
});

export default router;
