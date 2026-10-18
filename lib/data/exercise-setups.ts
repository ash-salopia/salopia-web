import { createClient } from "@/lib/supabase-browser";

// Coach-side read of an athlete's recurring per-exercise setup notes
// (0125), keyed by lower-cased exercise name. Empty if 0125 isn't run.
export async function listAthleteExerciseSetups(athleteId: string): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data, error } = await supabase.from("athlete_exercise_setups").select("exercise_key, note").eq("athlete_id", athleteId);
  if (error) return {};
  return Object.fromEntries((data ?? []).map((r) => [r.exercise_key as string, r.note as string]));
}
