import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

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
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    const hasAuthHeader = !!req.headers.authorization;
    const authPrefix = req.headers.authorization?.substring(0, 20);
    const rawToken = req.headers.authorization?.split(" ")[1];
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
    return;
  }
  (req as any).userId = userId;
  next();
}
