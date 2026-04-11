import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import { clerkMiddleware } from "@clerk/express";
import { getAuth } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import type { Request } from "express";

// Validate required Clerk env vars at startup — fail fast rather than serving
// with a silently broken auth layer.
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;
logger.info(
  {
    hasClerkSecretKey: Boolean(clerkSecretKey),
    hasClerkPublishableKey: Boolean(clerkPublishableKey),
  },
  "Clerk key configuration at startup",
);
if (!clerkSecretKey || !clerkPublishableKey) {
  logger.error("CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY must be set — exiting");
  process.exit(1);
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://clerk.replyai.app",
          "https://*.clerk.accounts.dev",
          "https://challenges.cloudflare.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: [
          "'self'",
          "https://clerk.replyai.app",
          "https://*.clerk.accounts.dev",
          "https://api.clerk.com",
          "https://accounts.google.com",
          "https://oauth2.googleapis.com",
          "https://openrouter.ai",
          "https://api.stripe.com",
        ],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: "deny" },
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true,
  }),
);

// Stripe webhook needs raw body — register BEFORE express.json()
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const { handleStripeWebhook } = await import("./webhookHandlers");
      const signature = req.headers["stripe-signature"];
      if (!signature) {
        res.status(400).json({ error: "Missing signature" });
        return;
      }
      const sig = Array.isArray(signature) ? signature[0] : signature;
      await handleStripeWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err) {
      logger.error({ err }, "Stripe webhook error");
      res.status(400).json({ error: "Webhook error" });
    }
  }
);

// Clerk proxy must be mounted before body parsers
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clerk middleware MUST run before any limiter that calls getAuth()
// IMPORTANT: publishableKey must match the mobile app's Clerk instance (saved-seasnail-79)
// Keys are validated at startup above — no fallbacks here.
app.use(clerkMiddleware({
  secretKey: clerkSecretKey,
  publishableKey: clerkPublishableKey,
}));

// --- Rate limiting (tiered, applied after Clerk auth context is available) ---

// Global limiter: broad protection for all authenticated API routes.
// Keys by userId so authenticated users get their own bucket.
const globalRateLimit = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getAuth(req).userId ?? req.ip ?? "anon",
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => {
    res.status(429).json({
      error: "Too many requests. Please slow down.",
      code: "RATE_LIMITED",
    });
  },
});

// OAuth callback limiter: tighter limit for all routes under /api/auth (OAuth
// initiation and callbacks). Keyed by IP since auth is not yet established.
const oauthRateLimit = rateLimit({
  windowMs: 15 * 60_000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip ?? "anon",
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => {
    res.status(429).json({
      error: "Too many OAuth requests. Please wait before trying again.",
      code: "RATE_LIMITED",
    });
  },
});

// Connector action limiter: rate limit routes that trigger external API calls
// (Slack, HubSpot, Teams, Calendly, LinkedIn, etc.) to protect upstream quotas.
const connectorActionRateLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getAuth(req).userId ?? req.ip ?? "anon",
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => {
    res.status(429).json({
      error: "Too many connector requests. Please slow down.",
      code: "RATE_LIMITED",
    });
  },
});

// Calendar-specific limiter: looser limit since day-swipe navigation generates
// burst queries but each query is for a full week and is client-side cached.
const calendarRateLimit = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getAuth(req).userId ?? req.ip ?? "anon",
  validate: { xForwardedForHeader: false },
  handler: (_req, res) => {
    res.status(429).json({
      error: "Too many calendar requests. Please slow down.",
      code: "RATE_LIMITED",
    });
  },
});

app.use("/api", globalRateLimit);

// Tighter limit on all OAuth initiation and callback endpoints
app.use("/api/auth", oauthRateLimit);

// Tighter limit on connector action endpoints that call external APIs
app.use(
  [
    "/api/slack",
    "/api/hubspot",
    "/api/teams",
    "/api/teams-actions",
    "/api/calendly",
    "/api/linkedin",
    "/api/fathom",
    "/api/drive",
  ],
  connectorActionRateLimit,
);

// Looser limit for calendar — day-swipe navigation creates bursts that are
// backed by 5-minute client cache but each week boundary still hits the API once.
app.use("/api/calendar", calendarRateLimit);

app.use("/api", router);

export default app;
