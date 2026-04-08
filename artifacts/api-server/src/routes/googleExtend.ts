import { Router } from "express";
import { google } from "googleapis";
import { requireAuth } from "../lib/requireAuth";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable, connectorsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createOAuthState, verifyOAuthState } from "../lib/oauthState";
import { maybeEncrypt } from "../lib/tokenCrypto";

const router = Router();

const ALL_EXTENDED_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/contacts.readonly",
];

const GSUITE_CONNECTORS = [
  { connectorId: "google-drive", displayName: "Google Drive" },
  { connectorId: "google-contacts", displayName: "Google Contacts" },
] as const;

function getExtendRedirectUri() {
  if (process.env.GOOGLE_REDIRECT_URI_EXTEND) return process.env.GOOGLE_REDIRECT_URI_EXTEND;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  return `https://${domain}/api/auth/google/extend/callback`;
}

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getExtendRedirectUri();
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

router.get("/auth/google/extend", requireAuth, async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const auth = getAuth(req);
  const userId = auth.userId!;

  const [existingUser] = await db
    .select({ id: usersTable.id, googleRefreshToken: usersTable.googleRefreshToken })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!existingUser?.googleRefreshToken) {
    return res.redirect(`${frontendUrl}/connectors?error=google_extend_not_linked`);
  }

  let state: string;
  try {
    state = createOAuthState(userId);
  } catch {
    return res.redirect(`${frontendUrl}/connectors?error=google_not_configured`);
  }

  try {
    const oAuth2Client = getOAuthClient();
    const url = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ALL_EXTENDED_SCOPES,
      prompt: "consent",
      state,
    });
    res.redirect(url);
  } catch {
    res.redirect(`${frontendUrl}/connectors?error=google_not_configured`);
  }
});

router.get("/auth/google/extend/callback", async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${frontendUrl}/connectors?error=google_extend_denied`);
  }

  if (!code || !state || typeof state !== "string") {
    return res.redirect(`${frontendUrl}/connectors?error=google_extend_missing_params`);
  }

  let userId: string | null;
  try {
    userId = verifyOAuthState(state);
  } catch {
    userId = null;
  }

  if (!userId) {
    req.log.warn("[google-extend-callback] invalid or expired state");
    return res.redirect(`${frontendUrl}/connectors?error=google_extend_missing_params`);
  }

  try {
    const oAuth2Client = getOAuthClient();
    const { tokens } = await oAuth2Client.getToken(code as string);

    if (!tokens.access_token) {
      return res.redirect(`${frontendUrl}/connectors?error=google_extend_token_failed`);
    }

    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    const updated = await db.update(usersTable).set({
      googleAccessToken: maybeEncrypt(tokens.access_token) ?? null,
      ...(tokens.refresh_token ? { googleRefreshToken: maybeEncrypt(tokens.refresh_token) ?? tokens.refresh_token } : {}),
      googleTokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, userId)).returning({ id: usersTable.id });

    if (updated.length === 0) {
      req.log.error("[google-extend-callback] user row not found for userId");
      return res.redirect(`${frontendUrl}/connectors?error=google_extend_callback_failed`);
    }

    for (const { connectorId, displayName } of GSUITE_CONNECTORS) {
      const existing = await db
        .select({ id: connectorsTable.id })
        .from(connectorsTable)
        .where(and(
          eq(connectorsTable.userId, userId),
          eq(connectorsTable.connectorId, connectorId),
        ))
        .limit(1);

      if (existing.length > 0) {
        await db.update(connectorsTable).set({
          status: "connected",
          updatedAt: new Date(),
        }).where(eq(connectorsTable.id, existing[0].id));
      } else {
        await db.insert(connectorsTable).values({
          id: randomUUID(),
          userId,
          connectorId,
          displayName,
          status: "connected",
          config: null,
        });
      }
    }

    res.redirect(`${frontendUrl}/connectors?gsuite_extended=true`);
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.message : "Unknown error" }, "[google-extend-callback] error");
    res.redirect(`${frontendUrl}/connectors?error=google_extend_callback_failed`);
  }
});

export default router;
