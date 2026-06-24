import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceRoleClient } from "@/lib/supabase-service";

// Supabase redirects here after the coach clicks the magic-link in their
// email. We exchange the one-time code for a real session, then — if
// this is their first ever sign-in — provision an organisation and a
// coach row for them, since the regular browser client deliberately
// can't insert into `coaches` directly (see migration 0001's note:
// allowing that would let anyone assign themselves to any
// organisation). This is the one legitimate server-side exception.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      try {
        await ensureCoachProvisioned(data.user.id, data.user.user_metadata);
      } catch (provisionError) {
        // If provisioning fails, send the coach to a dedicated error
        // page rather than silently dropping them into an app where
        // every page will fail (no coach row = every query 403s).
        console.error("Coach provisioning failed:", provisionError);
        return NextResponse.redirect(`${origin}/login?error=provisioning`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong (expired/invalid link) — send back to login
  // with a flag the login page can use to show a friendly message.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}

async function ensureCoachProvisioned(
  userId: string,
  metadata: { name?: string; org_name?: string }
): Promise<void> {
  const supabase = createServiceRoleClient();

  const { data: existing, error: lookupError } = await supabase
    .from("coaches")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return; // already provisioned — nothing to do

  // First-ever sign-in for this user: create a new organisation and
  // make them its owner. The org/coach name fields are optional (a
  // returning user clicking an old magic link won't have them set),
  // so fall back to sensible defaults rather than failing the signup.
  const orgName = metadata.org_name?.trim() || "My Organisation";
  const coachName = metadata.name?.trim() || "";

  const { data: org, error: orgError } = await supabase
    .from("organisations")
    .insert({ name: orgName })
    .select()
    .single();
  if (orgError) throw orgError;

  const { error: coachError } = await supabase.from("coaches").insert({
    id: userId,
    organisation_id: org.id,
    name: coachName,
    role: "owner",
  });
  if (coachError) throw coachError;
}
