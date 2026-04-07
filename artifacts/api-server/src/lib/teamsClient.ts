import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

interface TeamsConfig {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
}

export async function getTeamsToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(connectorsTable)
    .where(and(eq(connectorsTable.userId, userId), eq(connectorsTable.connectorId, "teams")))
    .limit(1);

  if (!rows.length || rows[0].status !== "connected") return null;

  const config = rows[0].config as TeamsConfig;

  if (config.expiresAt && new Date(config.expiresAt) < new Date(Date.now() + 60_000)) {
    return refreshTeamsToken(userId, rows[0].id, config);
  }

  return config.accessToken;
}

async function refreshTeamsToken(
  userId: string,
  rowId: string,
  config: TeamsConfig
): Promise<string | null> {
  if (!config.refreshToken) return null;
  const clientId = process.env.TEAMS_CLIENT_ID;
  const clientSecret = process.env.TEAMS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const tenantId = process.env.TEAMS_TENANT_ID || "common";
    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: config.refreshToken,
      }).toString(),
    });
    if (!res.ok) return null;
    const tokens = await res.json() as { access_token: string; refresh_token?: string; expires_in?: number };
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;
    await db.update(connectorsTable).set({
      config: { ...config, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? config.refreshToken, expiresAt },
      updatedAt: new Date(),
    }).where(eq(connectorsTable.id, rowId));
    return tokens.access_token;
  } catch {
    return null;
  }
}

export async function teamsGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Graph error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function teamsPost<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Graph error ${res.status}`);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}
