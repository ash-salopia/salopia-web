import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { getStripe } from "@/lib/stripe";

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

// Self-serve card update / cancel / invoice history, all handled by
// Stripe's hosted Billing Portal -- no custom UI needed for any of it.
export async function POST(req: NextRequest) {
  const { origin } = new URL(req.url);
  const supabase = await createClient();
  const owner = await getOwner(supabase);
  if (!owner) {
    return NextResponse.json({ error: "Only the organisation owner can manage billing" }, { status: 403 });
  }

  const service = createServiceRoleClient();
  const { data: org } = await service
    .from("organisations")
    .select("stripe_customer_id")
    .eq("id", owner.organisation_id)
    .single();

  if (!org?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account yet -- subscribe to a plan first" }, { status: 400 });
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${origin}/settings`,
  });

  return NextResponse.json({ url: session.url });
}
