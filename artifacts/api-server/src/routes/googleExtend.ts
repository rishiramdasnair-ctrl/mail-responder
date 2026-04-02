import { Router } from "express";
import { google } from "googleapis";
import { requireAuth } from "../lib/requireAuth";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable, connectorsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
];
const CONTACTS_SCOPES = [
  "https://www.googleapis.com/auth/contacts.readonly",
];
const BASE_GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

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

const VALID_EXTENSIONS = ["drive", "contacts"] as const;
type ExtensionType = typeof VALID_EXTENSIONS[number];

router.get("/auth/google/extend", requireAuth, (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const { scope: scopeParam } = req.query;
  if (!scopeParam || !VALID_EXTENSIONS.includes(scopeParam as ExtensionType)) {
    return res.redirect(`${frontendUrl}/connectors?error=invalid_scope`);
  }

  const auth = getAuth(req);
  const userId = auth.userId!;

  const extraScopes = scopeParam === "drive" ? DRIVE_SCOPES : CONTACTS_SCOPES;
  const allScopes = [...BASE_GOOGLE_SCOPES, ...extraScopes];

  try {
    const oAuth2Client = getOAuthClient();
    const url = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: allScopes,
      prompt: "consent",
      state: JSON.stringify({ userId, extension: scopeParam }),
    });
    res.redirect(url);
  } catch {
    res.redirect(`${frontendUrl}/connectors?error=google_not_configured`);
  }
});

router.get("/auth/google/extend/callback", async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const frontendUrl = `https://${domain}`;

  const { code, state: stateStr, error } = req.query;

  if (error) {
    return res.redirect(`${frontendUrl}/connectors?error=google_extend_denied`);
  }

  if (!code || !stateStr) {
    return res.redirect(`${frontendUrl}/connectors?error=google_extend_missing_params`);
  }

  let userId: string;
  let extension: ExtensionType;
  try {
    const parsed = JSON.parse(stateStr as string);
    userId = parsed.userId;
    extension = parsed.extension;
  } catch {
    return res.redirect(`${frontendUrl}/connectors?error=google_extend_invalid_state`);
  }

  try {
    const oAuth2Client = getOAuthClient();
    const { tokens } = await oAuth2Client.getToken(code as string);

    if (!tokens.access_token) {
      return res.redirect(`${frontendUrl}/connectors?error=google_extend_token_failed`);
    }

    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    await db.update(usersTable).set({
      googleAccessToken: tokens.access_token,
      ...(tokens.refresh_token ? { googleRefreshToken: tokens.refresh_token } : {}),
      googleTokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, userId));

    const connectorId = extension === "drive" ? "google-drive" : "google-contacts";
    const displayName = extension === "drive" ? "Google Drive" : "Google Contacts";

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
        config: { extension },
      });
    }

    res.redirect(`${frontendUrl}/connectors?${extension}_connected=true`);
  } catch (err) {
    console.error("[google-extend-callback] error:", err);
    res.redirect(`${frontendUrl}/connectors?error=google_extend_callback_failed`);
  }
});

router.post("/auth/google/extend/disconnect", requireAuth, async (req, res) => {
  const { extension } = req.body as { extension: string };
  const auth = getAuth(req);
  const userId = auth.userId!;

  const connectorId = extension === "drive" ? "google-drive" : "google-contacts";

  try {
    await db.delete(connectorsTable).where(and(
      eq(connectorsTable.userId, userId),
      eq(connectorsTable.connectorId, connectorId),
    ));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

export default router;
