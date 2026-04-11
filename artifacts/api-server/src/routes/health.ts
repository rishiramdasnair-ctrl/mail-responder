import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getReqUserId } from "../lib/getReqAuth";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/debug/redirect-uri", (_req, res) => {
  const explicit = process.env.GOOGLE_REDIRECT_URI;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
  const computed = `https://${domain}/api/auth/google/callback`;
  res.json({
    redirectUri: explicit || computed,
    source: explicit ? "GOOGLE_REDIRECT_URI env var" : "REPLIT_DOMAINS",
    allDomains: process.env.REPLIT_DOMAINS || null,
  });
});

router.get("/debug/gmail-token", async (_req, res) => {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const hasIdentity = !!process.env.REPL_IDENTITY;
  const hasRenewal = !!process.env.WEB_REPL_RENEWAL;
  const identityLen = process.env.REPL_IDENTITY?.length ?? 0;

  if (!hostname) {
    res.json({ error: "REPLIT_CONNECTORS_HOSTNAME not set", hasIdentity, hasRenewal });
    return;
  }

  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    res.json({ error: "No Replit token available", hasIdentity, hasRenewal });
    return;
  }

  try {
    const result = await fetch(
      "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-mail",
      { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
    ).then(r => r.json());

    const item = result?.items?.[0];
    const settingsKeys = Object.keys(item?.settings ?? {});
    const hasAccessToken = !!item?.settings?.access_token;
    const hasOauthToken = !!item?.settings?.oauth?.credentials?.access_token;

    res.json({
      hostname: hostname ? "set" : "missing",
      hasIdentity,
      identityLen,
      hasRenewal,
      itemsCount: result?.items?.length ?? 0,
      errorMessage: result?.message,
      settingsKeys,
      hasAccessToken,
      hasOauthToken,
      hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    });
  } catch (err: any) {
    res.json({ error: err.message, hasIdentity, hasRenewal });
  }
});

router.get("/debug/auth-check", (req, res) => {
  const auth = { userId: getReqUserId(req) };
  const hasAuthHeader = !!req.headers.authorization;
  const authPrefix = req.headers.authorization?.substring(0, 30) ?? null;
  res.json({
    hasAuthHeader,
    authPrefix,
    userId: auth?.userId ?? null,
    sessionId: auth?.sessionId ?? null,
    hasClerkSecretKey: !!process.env.CLERK_SECRET_KEY,
  });
});

router.get("/debug/clerk-pk", (_req, res) => {
  const pk = process.env.CLERK_PUBLISHABLE_KEY ?? "";
  res.json({ clerkPublishableKey: pk });
});

export default router;
