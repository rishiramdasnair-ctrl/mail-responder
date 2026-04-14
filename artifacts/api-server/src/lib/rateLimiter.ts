import rateLimit from "express-rate-limit";
import { Request } from "express";

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
}

export const RATE_LIMITS = {
  AI_GENERATE: {
    windowMs: 60_000,
    max: 30,
    message: "AI generation rate limited",
  },
  AI_PRIORITY: {
    windowMs: 60_000,
    max: 10,
    message: "Priority inbox rate limited",
  },
  AGENT_RUN: { windowMs: 60_000, max: 10, message: "Agent rate limited" },
  EMAIL_SEND: { windowMs: 60_000, max: 20, message: "Email send rate limited" },
  EMAIL_FETCH: {
    windowMs: 60_000,
    max: 60,
    message: "Email fetch rate limited",
  },
  AUTH_GOOGLE: { windowMs: 60_000, max: 10, message: "Auth rate limited" },
  GENERAL: { windowMs: 60_000, max: 100, message: "Rate limited" },
} as const;

export function createRateLimiter(config: RateLimitConfig) {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: config.message ?? "Rate limited" },
    keyGenerator: (req: Request) => {
      return (req as any).user?.id ?? req.ip ?? "unknown";
    },
  });
}

export const rateLimiters = {
  aiGenerate: createRateLimiter(RATE_LIMITS.AI_GENERATE),
  aiPriority: createRateLimiter(RATE_LIMITS.AI_PRIORITY),
  agentRun: createRateLimiter(RATE_LIMITS.AGENT_RUN),
  emailSend: createRateLimiter(RATE_LIMITS.EMAIL_SEND),
  emailFetch: createRateLimiter(RATE_LIMITS.EMAIL_FETCH),
  authGoogle: createRateLimiter(RATE_LIMITS.AUTH_GOOGLE),
  general: createRateLimiter(RATE_LIMITS.GENERAL),
};
