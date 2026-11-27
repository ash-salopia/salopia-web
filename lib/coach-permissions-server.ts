import { coachPermissions, type CoachPermissions } from "@/lib/coach-permissions";

// Server-side read of the signed-in coach's permissions (0134), for API
// routes. `supabase` is the route's RLS client (lib/supabase-server).
export async function getMyCoachPermissions(
  supabase: { auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> }; from: (t: string) => any }
): Promise<{ userId: string; organisationId: string; permissions: CoachPermissions } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: coach } = await supabase
    .from("coaches")
    .select("*, organisations(settings)")
    .eq("id", user.id)
    .maybeSingle();
  if (!coach) return null;
  return {
    userId: user.id,
    organisationId: coach.organisation_id,
    permissions: coachPermissions(coach, coach.organisations?.settings ?? null),
  };
}
