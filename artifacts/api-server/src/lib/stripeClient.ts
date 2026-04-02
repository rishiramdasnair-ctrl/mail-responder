import Stripe from "stripe";

async function getStripeCredentials(): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (xReplitToken && hostname) {
    try {
      const data: any = await fetch(
        "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=stripe",
        {
          headers: {
            Accept: "application/json",
            "X-Replit-Token": xReplitToken,
          },
        }
      ).then((res) => res.json());

      const secretKey = data.items?.[0]?.settings?.secret_key;
      if (secretKey) return secretKey;
    } catch {}
  }

  const envKey = process.env.STRIPE_SECRET_KEY;
  if (envKey) return envKey;

  throw new Error("Stripe not configured. Add STRIPE_SECRET_KEY or connect Stripe integration.");
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = await getStripeCredentials();
  return new Stripe(secretKey, { apiVersion: "2025-01-27.acacia" as any });
}

export async function verifyWebhook(payload: Buffer, signature: string): Promise<Stripe.Event> {
  const secretKey = await getStripeCredentials();
  const stripe = new Stripe(secretKey, { apiVersion: "2025-01-27.acacia" as any });
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET not set");
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
