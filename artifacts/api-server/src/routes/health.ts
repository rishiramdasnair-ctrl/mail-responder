import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
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
    });
  } catch (err: any) {
    res.json({ error: err.message, hasIdentity, hasRenewal });
  }
});

export default router;
