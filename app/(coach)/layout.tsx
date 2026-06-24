import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import CoachShell from "@/components/CoachShell";

// Server component: confirms the signed-in user actually has a coach
// profile (not just an authenticated Supabase user — those are
// created automatically on magic-link sign-in, but the coach row
// itself is provisioned separately, see migration 0001's note on
// signup happening server-side with the service role key). If
// there's no coach row yet, send them somewhere that explains it
// rather than letting every page below silently fail.
export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: coach, error: coachError } = await supabase
    .from("coaches")
    .select("*, organisations(name)")
    .eq("id", user.id)
    .single();

  if (coachError) {
    // Surface the real database error rather than silently treating
    // every failure as "no profile yet" — a permissions problem and a
    // genuinely missing row look identical otherwise, which made an
    // earlier version of this bug much harder to diagnose than it
    // needed to be.
    console.error("Coach lookup failed:", coachError);
  }

  if (!coach) {
    // Authenticated, but no coach profile provisioned yet (or the
    // lookup itself failed — see the logged error above for which).
    redirect("/login?error=no_coach_profile");
  }

  return (
    <CoachShell coachName={coach.name} orgName={coach.organisations?.name ?? ""}>
      {children}
    </CoachShell>
  );
}
