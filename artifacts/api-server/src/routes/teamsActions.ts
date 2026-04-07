import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

const router = Router();

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

interface TeamsConfig {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  teamsUserId?: string | null;
  teamsEmail?: string | null;
}

async function getTeamsToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(connectorsTable)
    .where(and(eq(connectorsTable.userId, userId), eq(connectorsTable.connectorId, "teams")))
    .limit(1);

  if (!rows.length || rows[0].status !== "connected") return null;

  const config = rows[0].config as TeamsConfig;

  if (config.expiresAt && new Date(config.expiresAt) < new Date(Date.now() + 60_000)) {
    const refreshed = await refreshTeamsToken(userId, rows[0].id, config);
    return refreshed;
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

    const tokens = await res.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    await db.update(connectorsTable).set({
      config: {
        ...config,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? config.refreshToken,
        expiresAt,
      },
      updatedAt: new Date(),
    }).where(eq(connectorsTable.id, rowId));

    return tokens.access_token;
  } catch {
    return null;
  }
}

async function graphGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error("Graph API error"), { status: res.status, details: err });
  }
  return res.json() as Promise<T>;
}

async function graphPost<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error("Graph API error"), { status: res.status, details: err });
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

router.get("/teams/me", requireAuth, async (req, res) => {
  const { userId } = getAuth(req);
  const token = await getTeamsToken(userId!);
  if (!token) return res.status(401).json({ error: "Teams not connected" });

  try {
    const me = await graphGet(token, "/me?$select=id,displayName,mail,userPrincipalName,jobTitle");
    res.json(me);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message, details: err.details });
  }
});

router.get("/teams/chats", requireAuth, async (req, res) => {
  const { userId } = getAuth(req);
  const token = await getTeamsToken(userId!);
  if (!token) return res.status(401).json({ error: "Teams not connected" });

  try {
    const data = await graphGet<{ value: unknown[] }>(
      token,
      "/me/chats?$expand=members&$top=50"
    );
    res.json(data);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message, details: err.details });
  }
});

router.get("/teams/chats/:chatId/messages", requireAuth, async (req, res) => {
  const { userId } = getAuth(req);
  const token = await getTeamsToken(userId!);
  if (!token) return res.status(401).json({ error: "Teams not connected" });

  try {
    const data = await graphGet(token, `/me/chats/${req.params.chatId}/messages?$top=50`);
    res.json(data);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message, details: err.details });
  }
});

router.post("/teams/chats/:chatId/messages", requireAuth, async (req, res) => {
  const { userId } = getAuth(req);
  const token = await getTeamsToken(userId!);
  if (!token) return res.status(401).json({ error: "Teams not connected" });

  const { content, contentType = "text" } = req.body as { content: string; contentType?: string };
  if (!content) return res.status(400).json({ error: "content is required" });

  try {
    const msg = await graphPost(token, `/me/chats/${req.params.chatId}/messages`, {
      body: { contentType, content },
    });
    res.json(msg);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message, details: err.details });
  }
});

router.get("/teams/list", requireAuth, async (req, res) => {
  const { userId } = getAuth(req);
  const token = await getTeamsToken(userId!);
  if (!token) return res.status(401).json({ error: "Teams not connected" });

  try {
    const data = await graphGet(token, "/me/joinedTeams?$select=id,displayName,description");
    res.json(data);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message, details: err.details });
  }
});

router.get("/teams/:teamId/channels", requireAuth, async (req, res) => {
  const { userId } = getAuth(req);
  const token = await getTeamsToken(userId!);
  if (!token) return res.status(401).json({ error: "Teams not connected" });

  try {
    const data = await graphGet(
      token,
      `/teams/${req.params.teamId}/channels?$select=id,displayName,description`
    );
    res.json(data);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message, details: err.details });
  }
});

router.get("/teams/:teamId/channels/:channelId/messages", requireAuth, async (req, res) => {
  const { userId } = getAuth(req);
  const token = await getTeamsToken(userId!);
  if (!token) return res.status(401).json({ error: "Teams not connected" });

  try {
    const data = await graphGet(
      token,
      `/teams/${req.params.teamId}/channels/${req.params.channelId}/messages?$top=50`
    );
    res.json(data);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message, details: err.details });
  }
});

router.post("/teams/:teamId/channels/:channelId/messages", requireAuth, async (req, res) => {
  const { userId } = getAuth(req);
  const token = await getTeamsToken(userId!);
  if (!token) return res.status(401).json({ error: "Teams not connected" });

  const { content, contentType = "text", subject } = req.body as {
    content: string;
    contentType?: string;
    subject?: string;
  };
  if (!content) return res.status(400).json({ error: "content is required" });

  try {
    const body: Record<string, unknown> = { body: { contentType, content } };
    if (subject) body.subject = subject;

    const msg = await graphPost(
      token,
      `/teams/${req.params.teamId}/channels/${req.params.channelId}/messages`,
      body
    );
    res.json(msg);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message, details: err.details });
  }
});

router.post("/teams/:teamId/channels/:channelId/messages/:messageId/replies", requireAuth, async (req, res) => {
  const { userId } = getAuth(req);
  const token = await getTeamsToken(userId!);
  if (!token) return res.status(401).json({ error: "Teams not connected" });

  const { content, contentType = "text" } = req.body as { content: string; contentType?: string };
  if (!content) return res.status(400).json({ error: "content is required" });

  try {
    const reply = await graphPost(
      token,
      `/teams/${req.params.teamId}/channels/${req.params.channelId}/messages/${req.params.messageId}/replies`,
      { body: { contentType, content } }
    );
    res.json(reply);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message, details: err.details });
  }
});

router.post("/teams/meetings", requireAuth, async (req, res) => {
  const { userId } = getAuth(req);
  const token = await getTeamsToken(userId!);
  if (!token) return res.status(401).json({ error: "Teams not connected" });

  const { subject, startDateTime, endDateTime, attendees } = req.body as {
    subject: string;
    startDateTime: string;
    endDateTime: string;
    attendees?: Array<{ email: string; displayName?: string }>;
  };

  if (!subject || !startDateTime || !endDateTime) {
    return res.status(400).json({ error: "subject, startDateTime, endDateTime are required" });
  }

  try {
    const body: Record<string, unknown> = {
      subject,
      startDateTime,
      endDateTime,
    };

    if (attendees?.length) {
      body.participants = {
        attendees: attendees.map((a) => ({
          identity: { user: { id: a.email } },
          role: "attendee",
        })),
      };
    }

    const meeting = await graphPost(token, "/me/onlineMeetings", body);
    res.json(meeting);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message, details: err.details });
  }
});

export default router;
