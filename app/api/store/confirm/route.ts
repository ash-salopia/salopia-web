import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { getStripe } from "@/lib/stripe";
import { fulfilCheckoutSession } from "@/lib/store/server";

export const dynamic = "force-dynamic";

// POST /api/store/confirm { sessionId, organisationId } - the thank-you
// page asks Stripe directly whether the Checkout was paid and fulfils it
// if the webhook hasn't already (fulfilment is idempotent). The session
// id is only known to whoever was redirected back from Checkout.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sessionId = String(body?.sessionId ?? "");
  const orgId = String(body?.organisationId ?? "");
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId) || !/^[0-9a-f-]{36}$/i.test(orgId)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const service = createServiceRoleClient();
  const { data: org } = await service.from("organisations").select("stripe_connect_account_id").eq("id", orgId).maybeSingle();
  if (!org?.stripe_connect_account_id) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId, {}, { stripeAccount: org.stripe_connect_account_id });
    const result = await fulfilCheckoutSession(session, org.stripe_connect_account_id, req.nextUrl.origin);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[store/confirm] failed", e);
    return NextResponse.json({ status: "pending" });
  }
}
