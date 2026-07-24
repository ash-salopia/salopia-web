import { createClient } from "@/lib/supabase-browser";
import type { AthleteOneRM } from "@/types";

// Coach-side CRUD for athlete_one_rms (0038) — fixed 1RM values a
// coach sets on an athlete's profile, used to compute %1RM targets
// when the org's one_rm_source setting is "fixed". RLS scopes all of
// this to the coach's own organisation.

export async function listAthleteOneRMs(athleteId: string): Promise<AthleteOneRM[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("athlete_one_rms")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("exercise_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function upsertAthleteOneRM(
  athleteId: string,
  exerciseName: string,
  oneRmKg: number
): Promise<AthleteOneRM> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("athlete_one_rms")
    .upsert(
      {
        athlete_id: athleteId,
        exercise_name: exerciseName.trim(),
        one_rm_kg: oneRmKg,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "athlete_id,exercise_name" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAthleteOneRM(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("athlete_one_rms").delete().eq("id", id);
  if (error) throw error;
}
