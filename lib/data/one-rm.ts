import { createClient } from "@/lib/supabase-browser";
import { bestRollingOneRM, type OneRMFormula } from "@/lib/one-rm";
import type { AthleteOneRM } from "@/types";

// Coach-side CRUD for athlete_one_rms (0038) — fixed 1RM values a
// coach sets on an athlete's profile, used to compute %1RM targets.
// RLS scopes all of this to the coach's own organisation.

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

// Browser-client counterpart to getCurrentOneRM (lib/data/athlete-share-link.ts,
// server-only) — used by coach-facing pages that only have the
// current session loaded (the session builder, Live Group), not the
// athlete's full history, so the rolling estimate is queried directly
// rather than computed from whatever the caller happens to have
// fetched. Same resolution order: a fixed value on the athlete's
// profile always wins if one exists, otherwise the rolling estimate
// from logged history for that exercise name.
export async function resolveCurrentOneRM(
  athleteId: string,
  exerciseName: string,
  formula: OneRMFormula
): Promise<number | null> {
  const supabase = createClient();
  const { data: fixedData } = await supabase
    .from("athlete_one_rms")
    .select("one_rm_kg")
    .eq("athlete_id", athleteId)
    .ilike("exercise_name", exerciseName)
    .limit(1);
  const fixed = fixedData?.[0]?.one_rm_kg;
  if (fixed != null) return Number(fixed);

  const { data: rows } = await supabase
    .from("session_exercises")
    .select("log, reps, is_primer, sessions!inner(athlete_id, is_primer)")
    .ilike("name", exerciseName)
    .eq("sessions.athlete_id", athleteId)
    .eq("is_primer", false)
    .eq("sessions.is_primer", false);

  return bestRollingOneRM(rows ?? [], formula);
}

// Same resolution order as resolveCurrentOneRM(), but also reports
// which source won — used by the Strength report to tag values that
// come from a coach-set manual override rather than the rolling
// estimate (spec: "Show manual overrides with a manual tag"). A
// separate function rather than changing resolveCurrentOneRM()'s
// return shape, since three existing call sites depend on it
// returning a plain number.
export async function resolveCurrentOneRMWithSource(
  athleteId: string,
  exerciseName: string,
  formula: OneRMFormula
): Promise<{ value: number | null; source: "manual" | "rolling" }> {
  const supabase = createClient();
  const { data: fixedData } = await supabase
    .from("athlete_one_rms")
    .select("one_rm_kg")
    .eq("athlete_id", athleteId)
    .ilike("exercise_name", exerciseName)
    .limit(1);
  const fixed = fixedData?.[0]?.one_rm_kg;
  if (fixed != null) return { value: Number(fixed), source: "manual" };

  const { data: rows } = await supabase
    .from("session_exercises")
    .select("log, reps, is_primer, sessions!inner(athlete_id, is_primer)")
    .ilike("name", exerciseName)
    .eq("sessions.athlete_id", athleteId)
    .eq("is_primer", false)
    .eq("sessions.is_primer", false);

  return { value: bestRollingOneRM(rows ?? [], formula), source: "rolling" };
}
