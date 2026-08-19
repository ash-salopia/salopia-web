import { createClient } from "@/lib/supabase-browser";

// Per-coach athlete access restriction (0064_coach_athlete_access.sql).
// 'all' (default) is today's behaviour - every coach sees every org
// athlete. 'assigned' narrows a coach to only the athletes present in
// coach_athletes, enforced at the RLS layer (coach_can_access_athlete())
// so every athlete-scoped query across the app narrows automatically -
// these functions only manage the assignment/access-level data itself.

export async function setCoachAthleteAccess(
  coachId: string,
  access: "all" | "assigned"
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("coaches").update({ athlete_access: access }).eq("id", coachId);
  if (error) throw error;
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
