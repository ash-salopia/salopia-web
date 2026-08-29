import { createClient } from "@/lib/supabase-browser";
import { fitLinearRegression, type VelocityPoint } from "@/lib/velocity-profile";
import type { AthleteVelocityProfile } from "@/types";

// Coach-side CRUD for athlete_velocity_profiles (0078) - per-athlete,
// per-exercise load-velocity calibration used to estimate 1RM from bar
// speed. RLS scopes all of this to the coach's own organisation, same
// as lib/data/one-rm.ts.

export async function listVelocityProfiles(athleteId: string): Promise<AthleteVelocityProfile[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("athlete_velocity_profiles")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("exercise_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Fits the regression here (not trusted from the caller) so a saved
// row's slope/intercept always genuinely matches its calibration_points.
export async function upsertVelocityProfile(
  athleteId: string,
  exerciseName: string,
  points: VelocityPoint[],
  mvt: number
): Promise<AthleteVelocityProfile> {
  const fit = fitLinearRegression(points);
  if (!fit) throw new Error("Need at least 2 points at different loads to fit a profile");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("athlete_velocity_profiles")
    .upsert(
      {
        athlete_id: athleteId,
        exercise_name: exerciseName.trim(),
        mvt,
        calibration_points: points,
        slope: fit.slope,
        intercept: fit.intercept,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "athlete_id,exercise_name" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteVelocityProfile(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("athlete_velocity_profiles").delete().eq("id", id);
  if (error) throw error;
}
