import { createClient } from "@/lib/supabase-browser";
import { resolveBranding, DEFAULT_BRANDING, type ResolvedBranding } from "@/types/branding";

// Client-side counterpart to app/(coach)/layout.tsx's server-side
// branding resolution - needed anywhere a coach page builds a PDF in
// the browser (via @react-pdf/renderer's pdf(), which runs client-side)
// and wants the org's logo/colours on it, since that generation path
// has no server component to fetch branding through.
export async function getMyBranding(): Promise<ResolvedBranding> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_BRANDING;

  const { data: coach } = await supabase
    .from("coaches")
    .select("organisations(name, tier, branding)")
    .eq("id", user.id)
    .single();

  const org = Array.isArray(coach?.organisations) ? coach.organisations[0] : coach?.organisations;
  if (!org) return DEFAULT_BRANDING;
  return resolveBranding({ name: org.name, tier: org.tier ?? "standard", branding: org.branding ?? {} });
}
