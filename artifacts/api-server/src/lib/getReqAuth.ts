import type { Request } from "express";

export function getReqUserId(req: Request): string | null {
  return (req as any).userId ?? null;
}
