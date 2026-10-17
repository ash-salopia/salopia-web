import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { getStripe } from "@/lib/stripe";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { getStoreBySlug, getStoreForOrg, seatStatus, notifySeatLimitBlocked, STORE_FEE_PERCENT } from "@/lib/store/server";

export const dynamic = "force-dynamic";

// POST /api/store/checkout - starts a Stripe Checkout on the coach's
// connected account. Two kinds of buyer:
//   { slug, productId, name, email }  - public store; a new buyer will
//                                       become an athlete (uses a seat)
//   { token, productId }              - an existing athlete buying in-app
// A sale that would need a seat the org doesn't have is refused BEFORE
// payment (and the coach is told), so nobody pays for something we
// can't deliver.

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Payments aren't available right now." }, { status: 503 });
  const body = await req.json().catch(() => null);
  if (!body?.productId) return NextResponse.json({ error: "Missing programme" }, { status: 400 });
  const origin = req.nextUrl.origin;
  const service = createServiceRoleClient();

  let store;
  let athlete: { id: string; name: string; contact_email?: string | null; organisation_id: string } | null = null;
  let buyerName = "";
  let buyerEmail = "";
  if (body.token) {
    const a = await getAthleteByShareToken(String(body.token));
    if (!a) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    athlete = a as any;
    store = await getStoreForOrg((a as any).organisation_id);
    buyerName = (a as any).name ?? "";
    buyerEmail = String((a as any).contact_email ?? "").toLowerCase();
  } else {
    store = typeof body.slug === "string" ? await getStoreBySlug(body.slug) : null;
    buyerName = String(body.name ?? "").trim().slice(0, 80);
    buyerEmail = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
    if (!buyerName) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
    if (!EMAIL_RE.test(buyerEmail)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (!store.canSell || !store.accountId) return NextResponse.json({ error: "This store isn't taking payments yet." }, { status: 409 });
  const product = store.products.find((p) => p.id === body.productId);
  if (!product) return NextResponse.json({ error: "That programme isn't available." }, { status: 404 });

  // Public buyer whose email already matches an athlete here: no new seat needed.
  if (!athlete && buyerEmail) {
    const { data: existing } = await service
      .from("athletes")
      .select("id, name, contact_email, organisation_id")
      .eq("organisation_id", store.organisationId)
      .ilike("contact_email", buyerEmail)
      .eq("archived", false)
      .limit(1);
    athlete = (existing?.[0] as any) ?? null;
  }
  if (!athlete) {
    const seats = await seatStatus(service, store.organisationId);
    if (seats.free === 0) {
      notifySeatLimitBlocked(store.organisationId, product.title, origin).catch(() => {});
      return NextResponse.json(
        { error: "This programme can't be bought right now - the coach has been notified. Please try again later." },
        { status: 409 }
      );
    }
  }

  const backTo = body.token ? `${origin}/a/${encodeURIComponent(body.token)}/programmes` : `${origin}/store/${encodeURIComponent(store.slug)}`;
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: product.currency,
              unit_amount: product.pricePence,
              product_data: { name: product.title, description: product.weeks ? `${product.weeks}-week programme · ${product.sessions} sessions` : undefined },
            },
          },
        ],
        customer_email: buyerEmail || undefined,
        success_url: `${origin}/store/${encodeURIComponent(store.slug || "app")}/thanks?session_id={CHECKOUT_SESSION_ID}&o=${store.organisationId}`,
        cancel_url: backTo,
        metadata: { organisation_id: store.organisationId, product_id: product.id, athlete_id: athlete?.id ?? "" },
        ...(STORE_FEE_PERCENT > 0 ? { payment_intent_data: { application_fee_amount: Math.round((product.pricePence * STORE_FEE_PERCENT) / 100) } } : {}),
      },
      { stripeAccount: store.accountId }
    );
    const { error } = await service.from("programme_purchases").insert({
      organisation_id: store.organisationId,
      product_id: product.id,
      athlete_id: athlete?.id ?? null,
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      amount_pence: product.pricePence,
      currency: product.currency,
      stripe_checkout_session_id: session.id,
      status: "pending",
    });
    if (error) throw error;
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[store/checkout] failed", e);
    return NextResponse.json({ error: "Couldn't start checkout - please try again." }, { status: 500 });
  }
}
