import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { getStripe } from "@/lib/stripe";
import { getPlanTier, type BillingInterval } from "@/lib/billing/plans";

async function getOwner(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: coach } = await supabase
    .from("coaches")
    .select("id, organisation_id, role")
    .eq("id", user.id)
    .single();
  if (!coach || coach.role !== "owner") return null;
  return coach;
}

// Starts (or resumes, if a Stripe customer already exists for this
// organisation) a Checkout Session for the requested tier/interval.
// Only the org owner can change billing -- same gate as invite/archive.
export async function POST(req: NextRequest) {
  const { origin } = new URL(req.url);
  const supabase = await createClient();
  const owner = await getOwner(supabase);
  if (!owner) {
    return NextResponse.json({ error: "Only the organisation owner can manage billing" }, { status: 403 });
  }

  const body = await req.json();
  const tierId = typeof body.tier === "string" ? body.tier : "";
  const interval: BillingInterval = body.interval === "year" ? "year" : "month";

  const tier = getPlanTier(tierId);
  if (!tier) {
    return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  }
  const priceId = tier.priceIds[interval];
  if (!priceId) {
    return NextResponse.json({ error: "This plan isn't available yet -- Stripe pricing hasn't been set up for it" }, { status: 500 });
  }

  const service = createServiceRoleClient();
  const { data: org } = await service
    .from("organisations")
    .select("stripe_customer_id")
    .eq("id", owner.organisation_id)
    .single();

  const stripe = getStripe();
  let customerId = org?.stripe_customer_id ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { organisation_id: owner.organisation_id },
    });
    customerId = customer.id;
    await service
      .from("organisations")
      .update({ stripe_customer_id: customerId })
      .eq("id", owner.organisation_id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/settings?billing=success`,
    cancel_url: `${origin}/settings?billing=cancelled`,
    subscription_data: {
      metadata: { organisation_id: owner.organisation_id },
    },
  });

  return NextResponse.json({ url: session.url });
}
