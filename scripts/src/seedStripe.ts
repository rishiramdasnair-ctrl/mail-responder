// Run with: pnpm --filter @workspace/scripts exec tsx src/seedStripe.ts
// Creates Stripe products for ReplyAI

import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  throw new Error("STRIPE_SECRET_KEY env var required");
}

const stripe = new Stripe(secretKey, { apiVersion: "2025-01-27.acacia" as any });

async function seed() {
  console.log("Seeding Stripe products for ReplyAI...");

  const existing = await stripe.products.search({ query: "name:'ReplyAI Pro'" });
  if (existing.data.length > 0) {
    console.log("Products already exist:");
    const product = existing.data[0];
    const prices = await stripe.prices.list({ product: product.id, active: true });
    for (const price of prices.data) {
      console.log(`  ${price.recurring?.interval}: ${price.id} — $${(price.unit_amount || 0) / 100}`);
    }
    return;
  }

  const product = await stripe.products.create({
    name: "ReplyAI Pro",
    description: "Unlimited AI email replies — Pro/Casual/Fast tones, analytics, and more",
    metadata: { app: "replyai", plan: "pro" },
  });
  console.log("Created product:", product.id);

  const monthlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 1400,
    currency: "usd",
    recurring: { interval: "month" },
    nickname: "Pro Monthly",
  });
  console.log("Monthly price:", monthlyPrice.id);

  const annualPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 9900,
    currency: "usd",
    recurring: { interval: "year" },
    nickname: "Pro Annual",
  });
  console.log("Annual price:", annualPrice.id);

  console.log("\nSet these env vars:");
  console.log(`STRIPE_PRICE_MONTHLY=${monthlyPrice.id}`);
  console.log(`STRIPE_PRICE_ANNUAL=${annualPrice.id}`);
}

seed().catch(console.error);
