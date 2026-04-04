// Gmail integration via per-user Google OAuth tokens stored in the database
import { google } from "googleapis";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const redirectUri = `https://${domain}/api/auth/google/callback`;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function getFreshAccessToken(userId: string): Promise<string> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user?.googleRefreshToken) {
    throw new Error("Gmail not connected. Please connect your Gmail account.");
  }

  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials({
    refresh_token: user.googleRefreshToken,
    access_token: user.googleAccessToken,
    expiry_date: user.googleTokenExpiresAt?.getTime(),
  });

  // Refresh token if expired or expiring within 60 seconds
  const expiresAt = user.googleTokenExpiresAt?.getTime() ?? 0;
  if (!user.googleAccessToken || expiresAt < Date.now() + 60_000) {
    const { credentials } = await oAuth2Client.refreshAccessToken();
    // Update stored token
    await db.update(usersTable).set({
      googleAccessToken: credentials.access_token,
      googleTokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : undefined,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, userId));
    oAuth2Client.setCredentials(credentials);
  }

  const token = oAuth2Client.credentials.access_token;
  if (!token) throw new Error("Failed to get Gmail access token");
  return token;
}

// Returns a raw OAuth2 client (for use with any Google API: People, Drive, etc.)
export async function getOAuth2ClientForUser(userId: string) {
  const accessToken = await getFreshAccessToken(userId);
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}

// WARNING: Never cache this client. Access tokens expire.
export async function getGmailClientForUser(userId: string) {
  const oauth2Client = await getOAuth2ClientForUser(userId);
  return google.gmail({ version: "v1", auth: oauth2Client });
}

export async function getCalendarClientForUser(userId: string) {
  const accessToken = await getFreshAccessToken(userId);
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

export async function isGmailConnected(userId: string): Promise<{ connected: boolean; email?: string }> {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user?.googleRefreshToken) return { connected: false };
    return { connected: true, email: user.googleEmail || undefined };
  } catch {
    return { connected: false };
  }
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

export function decodeBody(part: any): string {
  if (!part) return "";
  if (part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf-8");
  }
  if (part.parts) {
    for (const p of part.parts) {
      const text = decodeBody(p);
      if (text) return text;
    }
  }
  return "";
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
