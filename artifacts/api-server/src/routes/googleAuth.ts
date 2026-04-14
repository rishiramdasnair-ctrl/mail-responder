import { Router } from "express";
import { google } from "googleapis";
import { requireAuth } from "../lib/requireAuth";
import { getReqUserId } from "../lib/getReqAuth";
import { db } from "@workspace/db";
import {
  usersTable,
  connectorsTable,
  gmailAccountsTable,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getOrCreateUser } from "../lib/getOrCreateUser";
import {
  createOAuthState,
  createSigninOAuthState,
  verifyOAuthState,
} from "../lib/oauthState";
import { createSigninCode } from "../lib/sessionToken";
import { getConnectedGmailAccounts } from "../lib/gmailClient";
import { maybeEncrypt } from "../lib/tokenCrypto";
import { logger } from "../lib/logger";
import {
  getOAuthClient,
  generateOAuthUrl,
  exchangeCodeForTokens,
  GMAIL_SCOPES,
} from "../lib/googleOAuth";

const router = Router();

const GSUITE_EXTENSION_CONNECTORS = ["google-drive", "google-contacts"];

router.get("/auth/google/signin-url", async (_req, res) => {
  try {
    let state: string;
    try {
      state = createSigninOAuthState();
    } catch {
      res.status(500).json({ error: "OAuth not configured" });
      return;
    }
    const url = generateOAuthUrl(state);
    res.json({ url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("GOOGLE_CLIENT_ID")) {
      res.status(500).json({ error: "OAuth not configured" });
    } else {
      res.status(500).json({ error: "Failed to generate OAuth URL" });
    }
  }
});

router.get("/auth/google/mobile-url", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const addAccount = req.query.addAccount === "true";

    let state: string;
    try {
      state = createOAuthState(userId, addAccount, "mobile");
    } catch {
      res.status(500).json({ error: "OAuth not configured" });
      return;
    }

    const url = generateOAuthUrl(state);
    res.json({ url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("GOOGLE_CLIENT_ID")) {
      res.status(500).json({ error: "OAuth not configured" });
    } else {
      res.status(500).json({ error: "Failed to generate OAuth URL" });
    }
  }
});

router.get("/auth/google/start", requireAuth, async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  try {
    const userId = getReqUserId(req)!;
    const addAccount = req.query.addAccount === "true";
    const platform =
      req.query.platform === "mobile" ? ("mobile" as const) : undefined;

    let state: string;
    try {
      state = createOAuthState(userId, addAccount, platform);
    } catch {
      if (platform === "mobile") {
        res.redirect(`replyai://oauth-error?error=not_configured`);
      } else {
        res.redirect(`${frontendUrl}/settings?gmail_error=not_configured`);
      }
      return;
    }

    const url = generateOAuthUrl(state);
    req.log.info({ addAccount, platform }, "[google-start] oauth init");
    res.redirect(url);
  } catch (err: unknown) {
    const domain2 = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
    const frontendUrl2 = `https://${domain2}`;
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("GOOGLE_CLIENT_ID")) {
      res.redirect(`${frontendUrl2}/settings?gmail_error=not_configured`);
    } else {
      res.redirect(`${frontendUrl2}/settings?gmail_error=start_failed`);
    }
  }
});

router.get("/auth/google/callback", async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  let isMobile = false;
  let isMobileSignin = false;

  try {
    const { code, state, error } = req.query;

    if (error) {
      req.log.warn(
        { oauthError: String(error) },
        "[google-callback] Google returned error",
      );
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

    const { userId: stateUserId, addAccount, platform } = statePayload;
    isMobile = platform === "mobile";
    isMobileSignin = platform === "mobile-signin";

    let tokens;
    try {
      const result = await getOAuthClient().getToken(code as string);
      tokens = result.tokens;
    } catch (tokenErr: unknown) {
      const msg =
        tokenErr instanceof Error ? tokenErr.message : "Unknown error";
      req.log.error({ err: msg }, "[google-callback] token exchange FAILED");
      if (isMobileSignin) {
        res.redirect(`replyai://signin-error?error=callback_failed`);
      } else if (isMobile) {
        res.redirect(`replyai://oauth-error?error=callback_failed`);
      } else {
        res.redirect(`${frontendUrl}/settings?gmail_error=callback_failed`);
      }
      return;
    }

    if (!tokens.access_token) {
      if (isMobileSignin) {
        res.redirect(`replyai://signin-error?error=callback_failed`);
      } else if (isMobile) {
        res.redirect(`replyai://oauth-error?error=callback_failed`);
      } else {
        res.redirect(`${frontendUrl}/settings?gmail_error=callback_failed`);
      }
      return;
    }

    const oAuth2Client = getOAuthClient();
    oAuth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oAuth2Client });
    const userInfo = await oauth2.userinfo.get();
    const googleEmail = userInfo.data.email || "";
    const googleSub = userInfo.data.id || "";

    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    // For mobile sign-in, derive userId from Google sub
    const userId = isMobileSignin ? `google_${googleSub}` : stateUserId;

    // Upsert the user FIRST (before gmail_accounts, which has a FK to users)
    const updated = await db
      .update(usersTable)
      .set({
        googleAccessToken: maybeEncrypt(tokens.access_token) ?? null,
        ...(tokens.refresh_token
          ? {
              googleRefreshToken:
                maybeEncrypt(tokens.refresh_token) ?? tokens.refresh_token,
            }
          : {}),
        googleTokenExpiresAt: expiresAt,
        googleEmail,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id });

    if (updated.length === 0) {
      await db
        .insert(usersTable)
        .values({
          id: userId,
          email: googleEmail,
          googleEmail,
          googleAccessToken: maybeEncrypt(tokens.access_token) ?? null,
          googleRefreshToken:
            maybeEncrypt(tokens.refresh_token) ?? tokens.refresh_token ?? null,
          googleTokenExpiresAt: expiresAt,
        })
        .onConflictDoNothing();
    }

    // Determine if this should be the primary account
    const existingAccounts = await db
      .select({ id: gmailAccountsTable.id })
      .from(gmailAccountsTable)
      .where(eq(gmailAccountsTable.userId, userId));
    const isFirstAccount = existingAccounts.length === 0;

    // If adding a new account that already exists as the primary, keep it primary
    const existingRow = await db
      .select()
      .from(gmailAccountsTable)
      .where(
        and(
          eq(gmailAccountsTable.userId, userId),
          eq(gmailAccountsTable.email, googleEmail),
        ),
      )
      .limit(1);
    const shouldBePrimary =
      isFirstAccount || (existingRow.length > 0 && existingRow[0].isPrimary);

    // Upsert into gmail_accounts (update tokens if email already connected)
    if (existingRow.length > 0) {
      await db
        .update(gmailAccountsTable)
        .set({
          accessToken: maybeEncrypt(tokens.access_token) ?? null,
          ...(tokens.refresh_token
            ? {
                refreshToken:
                  maybeEncrypt(tokens.refresh_token) ?? tokens.refresh_token,
              }
            : {}),
          tokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(gmailAccountsTable.id, existingRow[0].id));
    } else {
      await db.insert(gmailAccountsTable).values({
        userId,
        email: googleEmail,
        accessToken: maybeEncrypt(tokens.access_token) ?? null,
        refreshToken:
          maybeEncrypt(tokens.refresh_token) ?? tokens.refresh_token ?? "",
        tokenExpiresAt: expiresAt,
        isPrimary: shouldBePrimary,
      });
    }

    if (isMobileSignin) {
      const signinCode = createSigninCode(userId, googleEmail);
      res.redirect(
        `replyai://signin-success?code=${encodeURIComponent(signinCode)}`,
      );
    } else if (isMobile) {
      const event = addAccount ? "account_added" : "connected";
      res.redirect(
        `replyai://oauth-success?event=${event}&email=${encodeURIComponent(googleEmail)}`,
      );
    } else {
      const redirectParam = addAccount
        ? "gmail_account_added=true"
        : "gmail_connected=true";
      res.redirect(`${frontendUrl}/dashboard?${redirectParam}`);
    }
  } catch (err) {
    req.log.error(
      { err: err instanceof Error ? err.message : "Unknown error" },
      "[google-callback] unexpected error",
    );
    if (isMobileSignin) {
      res.redirect(`replyai://signin-error?error=server_error`);
    } else if (isMobile) {
      res.redirect(`replyai://oauth-error?error=server_error`);
    } else {
      res.redirect(`${frontendUrl}/settings?gmail_error=callback_failed`);
    }
  }
});

// List all connected Gmail accounts
router.get("/gmail/accounts", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const accounts = await getConnectedGmailAccounts(userId);
    res.json({ accounts });
  } catch (err) {
    req.log.error(
      { err: err instanceof Error ? err.message : "Unknown error" },
      "[gmail-accounts] error",
    );
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

// Update signature for a specific Gmail account
router.put(
  "/gmail/accounts/:email/signature",
  requireAuth,
  async (req, res) => {
    try {
      const userId = getReqUserId(req);
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const email = decodeURIComponent(req.params.email);
      const signature =
        typeof req.body?.signature === "string" ? req.body.signature : null;
      const signatureImageUrl =
        typeof req.body?.signatureImageUrl === "string"
          ? req.body.signatureImageUrl
          : null;
      await db
        .update(gmailAccountsTable)
        .set({ signature, signatureImageUrl, updatedAt: new Date() })
        .where(
          and(
            eq(gmailAccountsTable.userId, userId),
            eq(gmailAccountsTable.email, email),
          ),
        );
      res.json({ ok: true });
    } catch (err) {
      req.log.error(
        { err: err instanceof Error ? err.message : "Unknown error" },
        "[signature] error",
      );
      res.status(500).json({ error: "Failed to update signature" });
    }
  },
);

// Disconnect a specific Gmail account
router.delete("/gmail/accounts/:email", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const email = decodeURIComponent(req.params.email);

    // Find the account
    const [account] = await db
      .select()
      .from(gmailAccountsTable)
      .where(
        and(
          eq(gmailAccountsTable.userId, userId),
          eq(gmailAccountsTable.email, email),
        ),
      )
      .limit(1);

    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    await db
      .delete(gmailAccountsTable)
      .where(
        and(
          eq(gmailAccountsTable.userId, userId),
          eq(gmailAccountsTable.email, email),
        ),
      );

    // If we removed the primary, promote another
    if (account.isPrimary) {
      const remaining = await db
        .select()
        .from(gmailAccountsTable)
        .where(eq(gmailAccountsTable.userId, userId))
        .limit(1);
      if (remaining.length > 0) {
        await db
          .update(gmailAccountsTable)
          .set({ isPrimary: true, updatedAt: new Date() })
          .where(eq(gmailAccountsTable.id, remaining[0].id));
        // Update users table to reflect new primary
        await db
          .update(usersTable)
          .set({ googleEmail: remaining[0].email, updatedAt: new Date() })
          .where(eq(usersTable.id, userId));
      } else {
        // No more accounts — clear users table tokens
        await db
          .update(usersTable)
          .set({
            googleAccessToken: null,
            googleRefreshToken: null,
            googleTokenExpiresAt: null,
            googleEmail: null,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, userId));
        await db
          .delete(connectorsTable)
          .where(
            and(
              eq(connectorsTable.userId, userId),
              inArray(connectorsTable.connectorId, GSUITE_EXTENSION_CONNECTORS),
            ),
          );
      }
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error(
      { err: err instanceof Error ? err.message : "Unknown error" },
      "[gmail-account-disconnect] error",
    );
    res.status(500).json({ error: "Failed to disconnect account" });
  }
});

router.post("/auth/google/disconnect", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;

    // Remove all accounts
    await db
      .delete(gmailAccountsTable)
      .where(eq(gmailAccountsTable.userId, userId));
    await db
      .update(usersTable)
      .set({
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiresAt: null,
        googleEmail: null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    await db
      .delete(connectorsTable)
      .where(
        and(
          eq(connectorsTable.userId, userId),
          inArray(connectorsTable.connectorId, GSUITE_EXTENSION_CONNECTORS),
        ),
      );

    res.json({ success: true });
  } catch (err) {
    req.log.error(
      { err: err instanceof Error ? err.message : "Unknown error" },
      "[google-disconnect] error",
    );
    res.status(500).json({ error: "Failed to disconnect Gmail" });
  }
});

export default router;
