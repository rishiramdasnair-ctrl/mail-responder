import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getReqUserId } from "../lib/getReqAuth";
import { getOrCreateUser, getUserPlan, getRepliesLimit } from "../lib/getOrCreateUser";
import { CreateCheckoutBody } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const router = Router();

const PLANS = [
  {
    id: "pro",
    name: "Pro",
    description: "Unlimited AI replies, all tones, priority AI, analytics",
    priceMonthly: 14,
    priceAnnual: 99,
    features: [
      "Unlimited AI replies per month",
      "All 3 reply tones (Pro, Casual, Fast)",
      "Custom instructions & tone",
      "Reply analytics dashboard",
      "Priority AI (fastest models)",
      "Email signature support",
      "Reply history & search",
    ],
    stripePriceIdMonthly: process.env.STRIPE_PRICE_MONTHLY || "",
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ANNUAL || "",
    isPopular: true,
  },
];

router.get("/billing/plans", async (req, res) => {
  res.json({ plans: PLANS, trialDays: 14 });
});

router.get("/billing/subscription", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const user = await getOrCreateUser(userId);
    const plan = getUserPlan(user);
    const repliesLimit = getRepliesLimit(user);

    let subscriptionDetails: any = {};
    if (user.stripeSubscriptionId) {
      try {
        const { getUncachableStripeClient } = await import("../lib/stripeClient");
        const stripe = await getUncachableStripeClient();
        const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        subscriptionDetails = {
          status: sub.status,
          currentPeriodEnd: new Date((sub as any).current_period_end * 1000).toISOString(),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        };
      } catch {}
    }

    res.json({
      plan,
      status: user.stripeSubscriptionId ? subscriptionDetails.status || "active" : plan === "trial" ? "trialing" : "inactive",
      trialEndsAt: user.trialEndsAt?.toISOString(),
      currentPeriodEnd: subscriptionDetails.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptionDetails.cancelAtPeriodEnd || false,
      repliesUsed: user.repliesUsed,
      repliesLimit,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching subscription");
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

router.post("/billing/checkout", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const body = CreateCheckoutBody.parse(req.body);

    const user = await getOrCreateUser(userId);
    const { getUncachableStripeClient } = await import("../lib/stripeClient");
    const stripe = await getUncachableStripeClient();

    const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
    const baseUrl = `https://${domain}`;

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId },
      });
      customerId = customer.id;
      await db.update(usersTable)
        .set({ stripeCustomerId: customerId })
        .where(eq(usersTable.id, userId));
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: body.priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${baseUrl}/?checkout=success`,
      cancel_url: `${baseUrl}/?checkout=cancelled`,
      subscription_data: { metadata: { userId } },
    });

    res.json({ url: session.url });
  } catch (err) {
    req.log.error({ err }, "Error creating checkout");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/billing/portal", requireAuth, async (req, res) => {
  try {
    const userId = getReqUserId(req)!;
    const user = await getOrCreateUser(userId);

    if (!user.stripeCustomerId) {
      res.status(400).json({ error: "No active subscription" });
      return;
    }

    const { getUncachableStripeClient } = await import("../lib/stripeClient");
    const stripe = await getUncachableStripeClient();

    const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost";
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `https://${domain}/settings`,
    });

    res.json({ url: session.url });
  } catch (err) {
    req.log.error({ err }, "Error creating portal");
    res.status(500).json({ error: "Failed to create billing portal" });
  }
});

export default router;
