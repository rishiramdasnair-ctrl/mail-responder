import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

const router = Router();

interface LinkedInConnectorConfig {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string;
  connectedUserName?: string | null;
  connectedUserEmail?: string | null;
  connectedUserPhoto?: string | null;
  connectedUserSub?: string | null;
}

async function getLinkedInConnector(userId: string): Promise<{ config: LinkedInConnectorConfig; rowId: string } | null> {
  const rows = await db
    .select({ config: connectorsTable.config, rowId: connectorsTable.id })
    .from(connectorsTable)
    .where(and(
      eq(connectorsTable.userId, userId),
      eq(connectorsTable.connectorId, "linkedin"),
      eq(connectorsTable.status, "connected"),
    ))
    .limit(1);

  if (!rows.length) return null;
  const config = rows[0].config as LinkedInConnectorConfig | null;
  if (!config?.accessToken) return null;
  return { config, rowId: rows[0].rowId };
}

async function refreshLinkedInToken(
  rowId: string,
  config: LinkedInConnectorConfig,
): Promise<string> {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  if (!clientId || !clientSecret || !config.refreshToken) {
    return config.accessToken;
  }

  try {
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: config.refreshToken,
      }).toString(),
    });

    if (!tokenRes.ok) {
      console.error("[linkedin] token refresh failed:", await tokenRes.text());
      return config.accessToken;
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };

    const newConfig: LinkedInConnectorConfig = {
      ...config,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? config.refreshToken,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    };

    await db
      .update(connectorsTable)
      .set({ config: newConfig, updatedAt: new Date() })
      .where(eq(connectorsTable.id, rowId));

    return tokens.access_token;
  } catch (err) {
    console.error("[linkedin] token refresh error:", err);
    return config.accessToken;
  }
}

async function getValidConfig(userId: string): Promise<LinkedInConnectorConfig | null> {
  const row = await getLinkedInConnector(userId);
  if (!row) return null;

  const { config, rowId } = row;

  if (config.expiresAt) {
    const expiryTime = new Date(config.expiresAt).getTime();
    const nowPlus5Min = Date.now() + 5 * 60 * 1000;
    if (expiryTime < nowPlus5Min && config.refreshToken) {
      const newToken = await refreshLinkedInToken(rowId, config);
      return { ...config, accessToken: newToken };
    }
  }

  return config;
}

function nameSimilar(a: string, b: string): boolean {
  if (!a || !b) return false;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  const partsA = na.split(/\s+/);
  const partsB = nb.split(/\s+/);
  const shared = partsA.filter(p => p.length > 1 && partsB.includes(p));
  return shared.length >= Math.min(partsA.length, partsB.length, 2);
}

router.get("/linkedin/profile", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const { email, name } = req.query;

  const config = await getValidConfig(userId);
  if (!config) {
    res.status(404).json({ connected: false, profile: null });
    return;
  }

  const senderName = (typeof name === "string" ? name : "").trim();
  const senderEmail = (typeof email === "string" ? email : "").trim();

  if (!senderName && !senderEmail) {
    res.status(400).json({ error: "email or name query parameter is required" });
    return;
  }

  const searchQuery = senderName || senderEmail;
  const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchQuery)}`;

  const connectedName = config.connectedUserName ?? "";
  const connectedEmail = config.connectedUserEmail ?? "";

  const emailMatch =
    senderEmail.length > 0 &&
    connectedEmail.length > 0 &&
    senderEmail.toLowerCase() === connectedEmail.toLowerCase();

  const nameMatch = senderName.length > 0 && nameSimilar(senderName, connectedName);

  if (emailMatch || nameMatch) {
    let livePhoto = config.connectedUserPhoto ?? null;

    try {
      const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${config.accessToken}` },
      });
      if (profileRes.ok) {
        const live = await profileRes.json() as {
          sub?: string;
          name?: string;
          given_name?: string;
          family_name?: string;
          picture?: string;
          email?: string;
        };
        livePhoto = live.picture ?? livePhoto;
      }
    } catch {
      // use cached data
    }

    const nameParts = connectedName.split(" ");
    res.json({
      connected: true,
      profile: {
        id: config.connectedUserSub ?? null,
        name: connectedName || null,
        firstName: nameParts[0] ?? null,
        lastName: nameParts.slice(1).join(" ") || null,
        photoUrl: livePhoto,
        email: connectedEmail || null,
        headline: null,
        company: null,
        linkedinUrl: searchUrl,
      },
      searchUrl,
      matchedConnectedUser: true,
    });
  } else {
    res.json({
      connected: true,
      profile: null,
      searchUrl,
      matchedConnectedUser: false,
    });
  }
});

export default router;
