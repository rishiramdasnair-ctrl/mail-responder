import { createHmac, timingSafeEqual, randomUUID } from "crypto";

interface OAuthStatePayload {
  userId: string;
  nonce: string;
  exp: number;
}

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET must be set");
  return s;
}

export function createOAuthState(userId: string): string {
  const payload: OAuthStatePayload = {
    userId,
    nonce: randomUUID(),
    exp: Date.now() + 10 * 60 * 1000,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", getSecret()).update(data).digest("base64url");
  return `${data}.${mac}`;
}

export function verifyOAuthState(state: string): string | null {
  try {
    const dotIdx = state.lastIndexOf(".");
    if (dotIdx < 0) return null;
    const data = state.slice(0, dotIdx);
    const mac = state.slice(dotIdx + 1);
    const expected = createHmac("sha256", getSecret()).update(data).digest("base64url");
    if (
      mac.length !== expected.length ||
      !timingSafeEqual(Buffer.from(mac, "base64url"), Buffer.from(expected, "base64url"))
    ) return null;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as OAuthStatePayload;
    if (payload.exp < Date.now()) return null;
    return payload.userId;
  } catch {
    return null;
  }
}
