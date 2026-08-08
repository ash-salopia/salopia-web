import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { ensureCoachProvisioned } from "@/lib/auth/ensure-coach-provisioned";

// Supabase redirects here after the coach clicks the magic-link in their
// email. We exchange the one-time code for a real session, then — if
// this is their first ever sign-in — provision an organisation and a
// coach row for them, since the regular browser client deliberately
// can't insert into `coaches` directly (see migration 0001's note:
// allowing that would let anyone assign themselves to any
// organisation). This is the one legitimate server-side exception.
//
// This is the browser-initiated PKCE flow (?code=) used by regular
// magic-link login/signup. Invite links use a different mechanism —
// see app/auth/confirm/route.ts — because inviteUserByEmail is
// triggered by the org owner, not the invited coach's own browser, so
// there's no PKCE code-verifier cookie waiting on their device.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      try {
        await ensureCoachProvisioned(data.user.id, data.user.email ?? "", data.user.user_metadata);
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
