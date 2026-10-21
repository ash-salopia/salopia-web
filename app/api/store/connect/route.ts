import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// Coach-only. Stripe Connect (Express) for the Programme Store (0124):
//   POST                 -> create the org's connected account if needed,
//                           return a Stripe-hosted onboarding link
//   GET                  -> refresh + return the account's status
//   POST {action:"dashboard"} -> a login link to their Stripe Express dashboard
// Lives under /api/store/ (public prefix in middleware) so it checks the
// coach session itself and only ever answers with JSON.

async function coachOrg() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: coach } = await supabase.from("coaches").select("*").eq("id", user.id).single();
  if (!coach) return null;
  const service = createServiceRoleClient();
  const { data: org } = await service
    .from("organisations")
    .select("id, name, stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_details_submitted")
    .eq("id", coach.organisation_id)
    .single();
  return org ? { coach, org, service } : null;
}

export async function GET() {
  const ctx = await coachOrg();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { coach, org, service } = ctx;
  if (coach.role !== "owner" && coach.can_manage_store !== true) return NextResponse.json({ error: "No access to the online store" }, { status: 403 });
  if (!org.stripe_connect_account_id) return NextResponse.json({ connected: false, chargesEnabled: false, detailsSubmitted: false });
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ connected: true, chargesEnabled: org.stripe_connect_charges_enabled, detailsSubmitted: org.stripe_connect_details_submitted });
  try {
    const acct = await getStripe().accounts.retrieve(org.stripe_connect_account_id);
    const chargesEnabled = !!acct.charges_enabled;
    const detailsSubmitted = !!acct.details_submitted;
    if (chargesEnabled !== org.stripe_connect_charges_enabled || detailsSubmitted !== org.stripe_connect_details_submitted) {
      await service.from("organisations").update({ stripe_connect_charges_enabled: chargesEnabled, stripe_connect_details_submitted: detailsSubmitted }).eq("id", org.id);
    }
    return NextResponse.json({ connected: true, chargesEnabled, detailsSubmitted, requirementsDue: acct.requirements?.currently_due?.length ?? 0 });
  } catch (e) {
    console.error("[store/connect] retrieve failed", e);
    return NextResponse.json({ connected: true, chargesEnabled: org.stripe_connect_charges_enabled, detailsSubmitted: org.stripe_connect_details_submitted });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await coachOrg();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { coach, org, service } = ctx;
  if (coach.role !== "owner") return NextResponse.json({ error: "Only the account owner can connect payments." }, { status: 403 });
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Payments aren't set up on this server yet." }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const stripe = getStripe();
  const origin = req.nextUrl.origin;

  try {
    if (body.action === "dashboard") {
      if (!org.stripe_connect_account_id) return NextResponse.json({ error: "Not connected yet" }, { status: 400 });
      // Coaches have their own full Stripe account (see below), so the
      // dashboard is just Stripe's own site. Older Express accounts still
      // get a one-off login link.
      const acct = await stripe.accounts.retrieve(org.stripe_connect_account_id);
      if (acct.controller?.stripe_dashboard?.type === "express") {
        const link = await stripe.accounts.createLoginLink(org.stripe_connect_account_id);
        return NextResponse.json({ url: link.url });
      }
      return NextResponse.json({ url: "https://dashboard.stripe.com/" });
    }

    let accountId = org.stripe_connect_account_id as string | null;
    if (!accountId) {
      // Stripe now requires new connected accounts to have Stripe (not the
      // platform) liable for losses - "Managed Risk". That rules out the
      // Express dashboard on the stable API, so each coach gets their own
      // full Stripe account: they own it, see everything in Stripe's
      // dashboard, pay Stripe's fees directly, and VIS BUILD carries no
      // chargeback/negative-balance risk. Works with our direct charges.
      const acct = await stripe.accounts.create({
        controller: {
          losses: { payments: "stripe" },
          fees: { payer: "account" },
          requirement_collection: "stripe",
          stripe_dashboard: { type: "full" },
        },
        country: "GB",
        email: coach.email ?? undefined,
        business_profile: { name: org.name ?? undefined, product_description: "Training programmes sold through VIS BUILD" },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { organisation_id: org.id },
      });
      accountId = acct.id;
      await service.from("organisations").update({ stripe_connect_account_id: accountId }).eq("id", org.id);
    }
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${origin}/shop?connect=retry`,
      return_url: `${origin}/shop?connect=done`,
    });
    return NextResponse.json({ url: link.url });
  } catch (e) {
    console.error("[store/connect] failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not start Stripe setup" }, { status: 500 });
  }
}
