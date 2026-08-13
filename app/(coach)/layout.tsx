import { createClient } from "@/lib/supabase-server";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { redirect } from "next/navigation";
import CoachShell from "@/components/CoachShell";
import { resolveBranding, DEFAULT_BRANDING } from "@/types/branding";
import { graceDaysRemaining } from "@/lib/billing/access";

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: coach, error: coachError } = await supabase
    .from("coaches")
    .select("*, organisations(id, name, tier, branding, subscription_status, past_due_since)")
    .eq("id", user.id)
    .single();

  if (coachError) {
    console.error("Coach lookup failed:", coachError);
  }

  if (!coach) {
    // The RLS-scoped query above can return no row for two different
    // reasons that need different messaging: genuinely no coach
    // profile, or an archived coach (my_organisation_id() returns
    // NULL for them — see 0051_coach_archive.sql — which makes even
    // their OWN coaches row RLS-invisible, not just other org data).
    // This is the one legitimate service-role exception to
    // distinguish the two, mirroring the pattern already used in
    // lib/auth/ensure-coach-provisioned.ts.
    const service = createServiceRoleClient();
    const { data: archivedCheck } = await service
      .from("coaches")
      .select("archived")
      .eq("id", user.id)
      .maybeSingle();
    redirect(archivedCheck?.archived ? "/login?error=archived" : "/login?error=no_coach_profile");
  }

  const org = coach.organisations;
  const branding = org
    ? resolveBranding({ name: org.name, tier: org.tier ?? "standard", branding: org.branding ?? {} })
    : DEFAULT_BRANDING;

  const billingBanner =
    org?.subscription_status === "canceled"
      ? ({ type: "canceled" } as const)
      : org?.subscription_status === "past_due"
      ? ({ type: "past_due", daysLeft: graceDaysRemaining(org) } as const)
      : null;

  return (
    <CoachShell
      coachName={coach.name}
      coachAvatarUrl={coach.avatar_url}
      orgName={org?.name ?? ""}
      branding={branding}
      billingBanner={billingBanner}
    >
      {children}
    </CoachShell>
  );
}
