import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    const hasAuthHeader = !!req.headers.authorization;
    const authPrefix = req.headers.authorization?.substring(0, 20);
    req.log?.warn({ hasAuthHeader, authPrefix, sessionId: auth?.sessionId }, "requireAuth: no userId");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).userId = userId;
  next();
}
