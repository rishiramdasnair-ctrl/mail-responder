import { verifyWebhook } from "./lib/stripeClient";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

export async function handleStripeWebhook(payload: Buffer, signature: string) {
  const event = await verifyWebhook(payload, signature);

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.userId;
      if (!userId) break;
      const status = subscription.status;
      const plan = status === "active" || status === "trialing" ? "pro" : "trial";
      await db.update(usersTable)
        .set({
          plan,
          stripeSubscriptionId: subscription.id,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, userId));
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.userId;
      if (!userId) break;
      await db.update(usersTable)
        .set({ plan: "trial", stripeSubscriptionId: null, updatedAt: new Date() })
        .where(eq(usersTable.id, userId));
      break;
    }
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string;
      if (!customerId) break;
      const [user] = await db.select().from(usersTable).where(eq(usersTable.stripeCustomerId, customerId)).limit(1);
      if (user) {
        await db.update(usersTable)
          .set({ plan: "pro", updatedAt: new Date() })
          .where(eq(usersTable.id, user.id));
      }
      break;
    }
    default:
      break;
  }
}
