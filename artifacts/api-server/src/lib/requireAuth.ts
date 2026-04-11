import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { verifySessionToken } from "./sessionToken";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payloadB64] = token.split(".");
    const padded = payloadB64 + "==".slice((payloadB64.length % 4));
    const decoded = Buffer.from(padded, "base64url").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const rawToken = req.headers.authorization?.split(" ")[1];

  // Try our own session token first (Google OAuth flow)
  if (rawToken) {
    const session = verifySessionToken(rawToken);
    if (session) {
      (req as any).userId = session.userId;
      (req as any).userEmail = session.email;
      return next();
    }
  }

  // Fall back to Clerk JWT verification (web app / legacy)
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (userId) {
    (req as any).userId = userId;
    return next();
  }

  const hasAuthHeader = !!req.headers.authorization;
  const authPrefix = req.headers.authorization?.substring(0, 20);
  const payload = rawToken ? decodeJwtPayload(rawToken) : null;
  const tokenIss = payload?.iss as string | undefined;
  const configuredPubKey = (process.env.CLERK_PUBLISHABLE_KEY ?? "").substring(0, 35);
  req.log?.warn(
    { hasAuthHeader, authPrefix, sessionId: auth?.sessionId, tokenIss, configuredPubKey },
    "requireAuth: no userId — check Clerk key config",
  );
  res.status(401).json({
    error: "Unauthorized",
    hint: hasAuthHeader ? "token_rejected" : "no_token",
  });
}
