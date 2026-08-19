import { createClient } from "@/lib/supabase-browser";

// Per-coach athlete access restriction (0064_coach_athlete_access.sql).
// 'all' (default) is today's behaviour - every coach sees every org
// athlete. 'assigned' narrows a coach to only the athletes present in
// coach_athletes, enforced at the RLS layer (coach_can_access_athlete())
// so every athlete-scoped query across the app narrows automatically -
// these functions only manage the assignment/access-level data itself.

// Goes through /api/coaches/athlete-access, not a direct client
// update - the coaches table's own RLS only lets a coach update THEIR
// OWN row, so an owner changing a colleague's access level needs the
// service-role path (same reason archive/invite/revoke are API
// routes rather than direct client calls).
export async function setCoachAthleteAccess(
  coachId: string,
  access: "all" | "assigned"
): Promise<void> {
  const res = await fetch("/api/coaches/athlete-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ coachId, athleteAccess: access }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not update athlete access");
}

export async function listCoachAssignedAthleteIds(coachId: string): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("coach_athletes")
    .select("athlete_id")
    .eq("coach_id", coachId);
  if (error) throw error;
  return (data ?? []).map((row) => row.athlete_id);
}

// Replaces a coach's full assignment set with exactly `athleteIds` -
// simplest correct way to apply a picker's selection without diffing.
export async function setCoachAssignedAthletes(coachId: string, athleteIds: string[]): Promise<void> {
  const supabase = createClient();
  const { error: deleteError } = await supabase.from("coach_athletes").delete().eq("coach_id", coachId);
  if (deleteError) throw deleteError;
  if (athleteIds.length === 0) return;
  const { error: insertError } = await supabase
    .from("coach_athletes")
    .insert(athleteIds.map((athlete_id) => ({ coach_id: coachId, athlete_id })));
  if (insertError) throw insertError;
}
