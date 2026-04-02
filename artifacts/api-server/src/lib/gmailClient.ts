// Gmail integration via Replit Connectors (google-mail)
import { google } from "googleapis";

let connectionSettings: any;

async function getAccessToken() {
  // Only use cache if token is still valid (with 60s buffer)
  if (
    connectionSettings &&
    connectionSettings.settings?.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > Date.now() + 60_000
  ) {
    return connectionSettings.settings.access_token;
  }
  // Reset cache so we always re-fetch if expired or missing
  connectionSettings = null;

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error("X-Replit-Token not found for repl/depl");
  }

  const raw = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-mail",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    }
  ).then((res) => res.json());

  connectionSettings = raw?.items?.[0];

  // Log structure for debugging (only in dev, redact actual token values)
  if (process.env.NODE_ENV === "development") {
    const settingsKeys = connectionSettings?.settings ? Object.keys(connectionSettings.settings) : [];
    console.log("[Gmail] connector response — items count:", raw?.items?.length ?? 0, "settings keys:", settingsKeys);
  }

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token ||
    connectionSettings?.settings?.token?.access_token;

  if (!connectionSettings || !accessToken) {
    console.error("[Gmail] No access token found. Settings keys:", Object.keys(connectionSettings?.settings ?? {}));
    throw new Error("Gmail not connected");
  }
  return accessToken;
}

// WARNING: Never cache this client. Access tokens expire.
// Always call this function again to get a fresh client.
export async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  return google.gmail({ version: "v1", auth: oauth2Client });
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
