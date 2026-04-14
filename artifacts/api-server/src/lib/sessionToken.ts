import { createHmac, timingSafeEqual, randomUUID } from "crypto";

interface SessionPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

interface CodeEntry {
  userId: string;
  email: string;
  sessionToken: string;
  expiresAt: number;
}

const codeStore = new Map<string, CodeEntry>();

const CODE_TTL_MS = 60_000; // 1 minute

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET must be set");
  return s;
}

export function createSessionToken(
  userId: string,
  email: string,
  ttlDays = 90,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: userId,
    email,
    iat: now,
    exp: now + ttlDays * 24 * 60 * 60,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", getSecret())
    .update(data)
    .digest("base64url");
  return `${data}.${mac}`;
}

export function verifySessionToken(
  token: string,
): { userId: string; email: string } | null {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx < 0) return null;
    const data = token.slice(0, dotIdx);
    const mac = token.slice(dotIdx + 1);
    const expected = createHmac("sha256", getSecret())
      .update(data)
      .digest("base64url");
    if (
      mac.length !== expected.length ||
      !timingSafeEqual(
        Buffer.from(mac, "base64url"),
        Buffer.from(expected, "base64url"),
      )
    )
      return null;
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString(),
    ) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export function createSigninCode(userId: string, email: string): string {
  const code = randomUUID().replace(/-/g, "").slice(0, 16);
  const sessionToken = createSessionToken(userId, email);
  codeStore.set(code, {
    userId,
    email,
    sessionToken,
    expiresAt: Date.now() + CODE_TTL_MS,
  });
  setTimeout(() => codeStore.delete(code), CODE_TTL_MS);
  return code;
}

export function exchangeSigninCode(
  code: string,
): { userId: string; email: string; sessionToken: string } | null {
  const entry = codeStore.get(code);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    codeStore.delete(code);
    return null;
  }
  codeStore.delete(code);
  return {
    userId: entry.userId,
    email: entry.email,
    sessionToken: entry.sessionToken,
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of codeStore) {
    if (now > entry.expiresAt) {
      codeStore.delete(code);
    }
  }
}, 10_000);
