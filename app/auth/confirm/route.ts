import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { ensureCoachProvisioned } from "@/lib/auth/ensure-coach-provisioned";

// Handles Supabase's token_hash-style auth links — used by the coach
// invite email (see app/api/coaches/invite/route.ts), which is the
// only email type this app sends that isn't a same-browser magic-link
// login. inviteUserByEmail is triggered by the org owner, not the
// invited coach's own browser, so there's no PKCE code-verifier cookie
// waiting on their device when they click the link — the ?code= flow
// in app/auth/callback/route.ts can't handle this case. See that
// file's comment for the full explanation; that route stays untouched.
//
// Requires the Supabase dashboard's "Invite user" email template to
// link here with token_hash/type/redirect_to instead of the default
// hosted verify URL — Magic Link/Confirm Signup templates are
// unaffected and keep using the working PKCE path.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // NOT a fallback source for `next`: Supabase's redirect_to param here
  // is the full absolute URL we originally passed as `redirectTo` to
  // inviteUserByEmail (this same route) — prefixing it with `origin`
  // below would double the domain. app/auth/callback/route.ts's `next`
  // param is a relative path; this route only ever needs the default.
  const next = searchParams.get("next") ?? "/";

  if (token_hash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error && data.user) {
      try {
        await ensureCoachProvisioned(data.user.id, data.user.email ?? "", data.user.user_metadata);
      } catch (provisionError) {
        console.error("Coach provisioning failed:", provisionError);
        return NextResponse.redirect(`${origin}/login?error=provisioning`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
