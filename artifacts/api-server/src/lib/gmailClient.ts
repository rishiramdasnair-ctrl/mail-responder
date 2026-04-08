// Gmail integration via per-user Google OAuth tokens stored in the database
import { google } from "googleapis";
import { db } from "@workspace/db";
import { usersTable, gmailAccountsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { maybeEncrypt, maybeDecrypt } from "./tokenCrypto";

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const redirectUri = `https://${domain}/api/auth/google/callback`;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Auto-migrate: if user has tokens in users table but no gmail_accounts rows,
// insert a primary row so multi-account works transparently.
async function ensureMigrated(userId: string, user: { googleRefreshToken: string | null; googleAccessToken: string | null; googleTokenExpiresAt: Date | null; googleEmail: string | null }) {
  if (!user.googleRefreshToken) return;
  const existing = await db.select({ id: gmailAccountsTable.id })
    .from(gmailAccountsTable)
    .where(eq(gmailAccountsTable.userId, userId))
    .limit(1);
  if (existing.length > 0) return; // already migrated
  const email = user.googleEmail || "";
  if (!email) return;
  await db.insert(gmailAccountsTable).values({
    userId,
    email,
    accessToken: maybeEncrypt(user.googleAccessToken) ?? null,
    refreshToken: maybeEncrypt(user.googleRefreshToken) ?? user.googleRefreshToken,
    tokenExpiresAt: user.googleTokenExpiresAt,
    isPrimary: true,
  }).onConflictDoNothing();
}

async function getFreshAccessToken(userId: string, accountEmail?: string): Promise<string> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) throw new Error("User not found");

  // Try to migrate legacy tokens first
  await ensureMigrated(userId, user);

  let account;
  if (accountEmail) {
    const [found] = await db.select().from(gmailAccountsTable)
      .where(and(eq(gmailAccountsTable.userId, userId), eq(gmailAccountsTable.email, accountEmail)))
      .limit(1);
    if (!found) throw new Error(`Gmail account ${accountEmail} not connected.`);
    account = found;
  } else {
    // Use primary account from gmail_accounts
    const accounts = await db.select().from(gmailAccountsTable)
      .where(eq(gmailAccountsTable.userId, userId));
    account = accounts.find(a => a.isPrimary) ?? accounts[0];
    if (!account) {
      // Final fallback: old users table tokens (pre-migration)
      if (!user.googleRefreshToken) throw new Error("Gmail not connected. Please connect your Gmail account.");
      account = {
        id: -1,
        userId,
        email: user.googleEmail || "",
        accessToken: maybeDecrypt(user.googleAccessToken) ?? null,
        refreshToken: maybeDecrypt(user.googleRefreshToken)!,
        tokenExpiresAt: user.googleTokenExpiresAt,
        isPrimary: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
  }

  const refreshToken = maybeDecrypt(account.refreshToken);
  const accessToken = maybeDecrypt(account.accessToken);

  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken,
    expiry_date: account.tokenExpiresAt?.getTime(),
  });

  // Refresh if expired or expiring within 60 seconds
  const expiresAt = account.tokenExpiresAt?.getTime() ?? 0;
  if (!accessToken || expiresAt < Date.now() + 60_000) {
    const { credentials } = await oAuth2Client.refreshAccessToken();
    if (account.id !== -1) {
      await db.update(gmailAccountsTable).set({
        accessToken: maybeEncrypt(credentials.access_token ?? null) ?? null,
        tokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : undefined,
        updatedAt: new Date(),
      }).where(eq(gmailAccountsTable.id, account.id));
    } else {
      // legacy path: update users table (always encrypt on write)
      await db.update(usersTable).set({
        googleAccessToken: maybeEncrypt(credentials.access_token ?? null) ?? null,
        googleTokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : undefined,
        updatedAt: new Date(),
      }).where(eq(usersTable.id, userId));
    }
    oAuth2Client.setCredentials(credentials);
  }

  const token = oAuth2Client.credentials.access_token;
  if (!token) throw new Error("Failed to get Gmail access token");
  return token;
}

// Returns a raw OAuth2 client (for use with any Google API: People, Drive, etc.)
export async function getOAuth2ClientForUser(userId: string, accountEmail?: string) {
  const accessToken = await getFreshAccessToken(userId, accountEmail);
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}

// WARNING: Never cache this client. Access tokens expire.
export async function getGmailClientForUser(userId: string, accountEmail?: string) {
  const oauth2Client = await getOAuth2ClientForUser(userId, accountEmail);
  return google.gmail({ version: "v1", auth: oauth2Client });
}

export async function getCalendarClientForUser(userId: string, accountEmail?: string) {
  const accessToken = await getFreshAccessToken(userId, accountEmail);
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

export async function isGmailConnected(userId: string): Promise<{ connected: boolean; email?: string }> {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) return { connected: false };
    // Check gmail_accounts table first
    const accounts = await db.select().from(gmailAccountsTable).where(eq(gmailAccountsTable.userId, userId)).limit(1);
    if (accounts.length > 0) return { connected: true, email: accounts[0].email };
    // Fall back to users table
    if (!user.googleRefreshToken) return { connected: false };
    return { connected: true, email: user.googleEmail || undefined };
  } catch {
    return { connected: false };
  }
}

export async function getConnectedGmailAccounts(userId: string): Promise<Array<{ email: string; isPrimary: boolean; signature?: string | null; signatureImageUrl?: string | null }>> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (user) await ensureMigrated(userId, user);
  const accounts = await db.select().from(gmailAccountsTable)
    .where(eq(gmailAccountsTable.userId, userId));
  return accounts.map(a => ({ email: a.email, isPrimary: a.isPrimary, signature: a.signature, signatureImageUrl: a.signatureImageUrl }));
}

export function parseEmailAddress(header: string): { name: string; email: string } {
  const match = header.match(/^(.*?)\s*<(.+)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2].trim() };
  }
  return { name: header, email: header };
}

export function getHeader(headers: any[], name: string): string {
  return headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function findBodyByMime(part: any, mimeType: string): string {
  if (!part) return "";
  if (part.mimeType === mimeType && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf-8");
  }
  if (part.parts) {
    for (const p of part.parts) {
      const result = findBodyByMime(p, mimeType);
      if (result) return result;
    }
  }
  return "";
}

/**
 * Strips potentially dangerous content from HTML email bodies.
 * Removes <script> tags, inline event handlers, and javascript: URLs
 * so the HTML can be safely rendered in a sandboxed iframe for display purposes.
 */
export function sanitizeEmailHtml(html: string): string {
  return html
    // Remove <script>...</script> blocks (including multiline)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove self-closing <script ... />
    .replace(/<script\b[^>]*\/>/gi, "")
    // Remove inline event handler attributes (onclick, onload, onerror, etc.)
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")
    // Replace javascript: href URLs with a safe placeholder
    .replace(/(href\s*=\s*["']?)javascript:[^"'\s>]*/gi, '$1#')
    // Remove javascript: src attributes
    .replace(/(src\s*=\s*["']?)javascript:[^"'\s>]*/gi, '$1')
    // Replace vbscript: URLs
    .replace(/(href\s*=\s*["']?)vbscript:[^"'\s>]*/gi, '$1#')
    // Remove CSS expression() (IE attack vector)
    .replace(/expression\s*\([^)]*\)/gi, "");
}

export function decodeBody(part: any): { body: string; bodyType: "html" | "plain" } {
  if (!part) return { body: "", bodyType: "plain" };
  // Always prefer HTML over plain text (mirrors what Gmail shows)
  const html = findBodyByMime(part, "text/html");
  if (html) return { body: sanitizeEmailHtml(html), bodyType: "html" };
  const plain = findBodyByMime(part, "text/plain");
  if (plain) return { body: plain, bodyType: "plain" };
  // Fallback: top-level body with no mime type
  if (part.body?.data) {
    return { body: Buffer.from(part.body.data, "base64url").toString("utf-8"), bodyType: "plain" };
  }
  return { body: "", bodyType: "plain" };
}

export interface EmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export function extractAttachments(part: any, result: EmailAttachment[] = []): EmailAttachment[] {
  if (!part) return result;
  if (part.filename && part.body?.attachmentId) {
    result.push({
      attachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType || "application/octet-stream",
      size: part.body.size || 0,
    });
  }
  if (part.parts) {
    for (const p of part.parts) {
      extractAttachments(p, result);
    }
  }
  return result;
}

export { maybeEncrypt, maybeDecrypt };
