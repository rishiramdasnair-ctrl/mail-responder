import { createHmac, timingSafeEqual, randomUUID } from "crypto";

interface SessionPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET must be set");
  return s;
}

export function createSessionToken(userId: string, email: string, ttlDays = 90): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: userId,
    email,
    iat: now,
    exp: now + ttlDays * 24 * 60 * 60,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", getSecret()).update(data).digest("base64url");
  return `${data}.${mac}`;
}

export function verifySessionToken(token: string): { userId: string; email: string } | null {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx < 0) return null;
    const data = token.slice(0, dotIdx);
    const mac = token.slice(dotIdx + 1);
    const expected = createHmac("sha256", getSecret()).update(data).digest("base64url");
    if (
      mac.length !== expected.length ||
      !timingSafeEqual(Buffer.from(mac, "base64url"), Buffer.from(expected, "base64url"))
    ) return null;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
