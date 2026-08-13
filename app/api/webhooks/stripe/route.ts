import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { getStripe } from "@/lib/stripe";
import { getTierByPriceId, getIntervalByPriceId } from "@/lib/billing/plans";

// Stripe needs the raw, unparsed body to verify the signature -- must
// run on the Node runtime (not Edge) and must read req.text(), never
// req.json(), before verification.
export const runtime = "nodejs";

// Every event is resolved to an organisation strictly via its Stripe
// customer id matched against organisations.stripe_customer_id, which
// this app itself set when the customer was created (checkout/route.ts)
// -- never from event metadata, mirroring the athlete-link rule of
// resolving identity from something we control rather than trusting
// data along for the ride (see CLAUDE.md).
async function getOrgByCustomerId(
  service: ReturnType<typeof createServiceRoleClient>,
  customerId: string
) {
  const { data } = await service
    .from("organisations")
    .select("id, subscription_status, past_due_since")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data;
}

function mapStripeStatus(status: Stripe.Subscription.Status): "active" | "past_due" | "canceled" {
  if (status === "active" || status === "trialing") return "active";
  if (status === "canceled") return "canceled";
  // past_due, unpaid, incomplete, incomplete_expired, paused
  return "past_due";
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json({ error: `Invalid signature: ${(err as Error).message}` }, { status: 400 });
  }

  const service = createServiceRoleClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;
      if (!customerId || !subscriptionId) break;

      const org = await getOrgByCustomerId(service, customerId);
      if (!org) break;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price.id;
      const tier = priceId ? getTierByPriceId(priceId) : undefined;
      const interval = priceId ? getIntervalByPriceId(priceId) : undefined;
      if (!tier) break;

      await service
        .from("organisations")
        .update({
          stripe_subscription_id: subscription.id,
          plan: tier.id,
          seat_limit: tier.seatLimit,
          subscription_status: "active",
          billing_interval: interval ?? null,
          past_due_since: null,
        })
        .eq("id", org.id);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const org = await getOrgByCustomerId(service, customerId);
      if (!org) break;

      const priceId = subscription.items.data[0]?.price.id;
      const tier = priceId ? getTierByPriceId(priceId) : undefined;
      const interval = priceId ? getIntervalByPriceId(priceId) : undefined;
      const status = mapStripeStatus(subscription.status);

      // Only stamp past_due_since the first time -- Smart Retries fires
      // repeated payment_failed/subscription.updated events across the
      // whole retry window, and re-stamping on every one would keep
      // pushing the 7-day grace period out indefinitely.
      const wasAlreadyPastDue = org.subscription_status === "past_due" && org.past_due_since;
      const pastDueSince =
        status === "past_due" ? (wasAlreadyPastDue ? org.past_due_since : new Date().toISOString()) : null;

      await service
        .from("organisations")
        .update({
          subscription_status: status,
          past_due_since: pastDueSince,
          ...(tier ? { plan: tier.id, seat_limit: tier.seatLimit } : {}),
          ...(interval ? { billing_interval: interval } : {}),
        })
        .eq("id", org.id);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const org = await getOrgByCustomerId(service, customerId);
      if (!org) break;

      await service
        .from("organisations")
        .update({ subscription_status: "canceled", past_due_since: null })
        .eq("id", org.id);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      if (!customerId) break;
      const org = await getOrgByCustomerId(service, customerId);
      if (!org) break;

      // Same "only stamp once" rule as subscription.updated above.
      if (org.subscription_status !== "past_due" || !org.past_due_since) {
        await service
          .from("organisations")
          .update({ subscription_status: "past_due", past_due_since: new Date().toISOString() })
          .eq("id", org.id);
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      if (!customerId) break;
      const org = await getOrgByCustomerId(service, customerId);
      if (!org) break;

      await service
        .from("organisations")
        .update({ subscription_status: "active", past_due_since: null })
        .eq("id", org.id);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
