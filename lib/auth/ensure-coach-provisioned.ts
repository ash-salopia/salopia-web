import { createServiceRoleClient } from "@/lib/supabase-service";

// Shared by both auth entry points — app/auth/callback/route.ts (magic-link
// login, PKCE ?code= flow) and app/auth/confirm/route.ts (invite links,
// token_hash flow). Both exchange their respective token for a session
// first, then call this to make sure a coaches row exists before the
// coach reaches any page (no coach row = every RLS-scoped query 403s).
export async function ensureCoachProvisioned(
  userId: string,
  email: string,
  metadata: { name?: string; org_name?: string }
): Promise<void> {
  const supabase = createServiceRoleClient();

  const { data: existing, error: lookupError } = await supabase
    .from("coaches")
    .select("id, accepted_at")
    .eq("id", userId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing) {
    // Already provisioned. If this is an invited coach's first login,
    // the invite endpoint pre-created this row with accepted_at null —
    // flip it now so Settings can distinguish pending from active.
    if (!existing.accepted_at) {
      const { error: acceptError } = await supabase
        .from("coaches")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", userId);
      if (acceptError) throw acceptError;
    }
    return;
  }

  // First-ever sign-in for this user with no pre-created row: a
  // self-signup, not an invite. Create a new organisation and make
  // them its owner. The org/coach name fields are optional (a
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
    email,
    role: "owner",
    accepted_at: new Date().toISOString(),
  });
  if (coachError) throw coachError;
}
