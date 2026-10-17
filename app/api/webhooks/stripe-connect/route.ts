import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { fulfilCheckoutSession } from "@/lib/store/server";

// Stripe Connect webhook for the Programme Store (0124) - events from
// coaches' connected accounts, so it has its own endpoint + signing
// secret (STRIPE_CONNECT_WEBHOOK_SECRET), separate from the platform's
// own billing webhook (/api/webhooks/stripe). Raw body for signature
// verification; Node runtime.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch (e) {
    return NextResponse.json({ error: `Invalid signature: ${(e as Error).message}` }, { status: 400 });
  }
  const accountId = event.account;
  if (!accountId) return NextResponse.json({ received: true });
  const service = createServiceRoleClient();

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      await fulfilCheckoutSession(event.data.object as Stripe.Checkout.Session, accountId, req.nextUrl.origin);
      break;
    }
    case "account.updated": {
      const acct = event.data.object as Stripe.Account;
      await service
        .from("organisations")
        .update({ stripe_connect_charges_enabled: !!acct.charges_enabled, stripe_connect_details_submitted: !!acct.details_submitted })
        .eq("stripe_connect_account_id", accountId);
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (pi && charge.refunded) {
        await service.from("programme_purchases").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("stripe_payment_intent_id", pi).neq("status", "refunded");
      }
      break;
    }
  }
  return NextResponse.json({ received: true });
}
