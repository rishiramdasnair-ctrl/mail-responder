import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getReqUserId } from "../lib/getReqAuth";
import { db } from "@workspace/db";
import { connectorsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { decryptConnectorConfig } from "../lib/tokenCrypto";

const router = Router();

const FATHOM_BASE = "https://api.fathom.ai/external/v1";

interface FathomConfig {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
}

interface FathomMeeting {
  id?: string;
  title?: string;
  meeting_title?: string;
  url?: string;
  share_url?: string;
  created_at?: string;
  scheduled_start_time?: string;
  scheduled_end_time?: string;
  meeting_type?: string;
  calendar_invitees?: Array<{ name?: string; email?: string; is_external?: boolean }>;
  recorded_by?: { name?: string; email?: string };
  default_summary?: { content?: string; template_name?: string } | null;
  recordings?: Array<{ id: string }>;
}

export async function getFathomToken(userId: string): Promise<string | null> {
  const rows = await db.select({ config: connectorsTable.config })
    .from(connectorsTable)
    .where(and(eq(connectorsTable.userId, userId), eq(connectorsTable.connectorId, "fathom"), eq(connectorsTable.status, "connected")))
    .limit(1);
  if (!rows.length) return null;
  const config = rows[0].config ? decryptConnectorConfig(rows[0].config as Record<string, unknown>) as unknown as FathomConfig : null;
  return config?.accessToken ?? null;
}

async function fathomGet<T>(token: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${FATHOM_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Fathom API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

router.get("/fathom/meetings", requireAuth, async (req, res) => {
  const userId = getReqUserId(req)!;
  const token = await getFathomToken(userId!);
  if (!token) return res.status(401).json({ error: "Fathom not connected" });

  try {
    const params: Record<string, string> = { limit: "20" };
    if (req.query.created_after) params.created_after = req.query.created_after as string;
    if (req.query.created_before) params.created_before = req.query.created_before as string;
    const data = await fathomGet<{ items: FathomMeeting[] }>(token, "/meetings", params);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/fathom/meetings/by-attendees", requireAuth, async (req, res) => {
  const userId = getReqUserId(req)!;
  const token = await getFathomToken(userId!);
  if (!token) return res.status(401).json({ error: "Fathom not connected" });

  const emailsParam = req.query.emails as string;
  if (!emailsParam) return res.status(400).json({ error: "emails param required" });
  const targetEmails = emailsParam.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

  try {
    const data = await fathomGet<{ items: FathomMeeting[] }>(token, "/meetings", { limit: "50" });
    const matched = (data.items || []).filter(m =>
      (m.calendar_invitees || []).some(inv => targetEmails.includes((inv.email || "").toLowerCase()))
    );
    res.json({ items: matched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/fathom/recordings/:recordingId/transcript", requireAuth, async (req, res) => {
  const userId = getReqUserId(req)!;
  const token = await getFathomToken(userId!);
  if (!token) return res.status(401).json({ error: "Fathom not connected" });

  try {
    const data = await fathomGet(token, `/recordings/${req.params.recordingId}/transcript`);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
