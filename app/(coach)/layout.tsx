import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import CoachShell from "@/components/CoachShell";
import { resolveBranding, DEFAULT_BRANDING } from "@/types/branding";

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
    .select("*, organisations(id, name, tier, branding)")
    .eq("id", user.id)
    .single();

  if (coachError) {
    console.error("Coach lookup failed:", coachError);
  }

  if (!coach) {
    redirect("/login?error=no_coach_profile");
  }

  const org = coach.organisations;
  const branding = org
    ? resolveBranding({ name: org.name, tier: org.tier ?? "standard", branding: org.branding ?? {} })
    : DEFAULT_BRANDING;

  return (
    <CoachShell
      coachName={coach.name}
      orgName={org?.name ?? ""}
      branding={branding}
    >
      {children}
    </CoachShell>
  );
}
