import { createClient } from "@/lib/supabase-browser";

export interface AthleteGoal {
  id: string;
  athlete_id: string;
  label: string;
  goal_type: "exercise" | "weight" | "time" | "text";
  exercise_name: string | null;
  rep_max: number | null;
  target_kg: number | null;
  target_time: string;
  target_text: string;
  unit: string;
  starred: boolean;
  notes: string;
  created_by: "coach" | "athlete";
  sort_order: number;
  created_at: string;
}

export type NewGoalInput = Omit<AthleteGoal, "id" | "athlete_id" | "created_at" | "sort_order">;

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function listGoalsForAthlete(athleteId: string): Promise<AthleteGoal[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("athlete_goals")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("starred", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ── Writes ────────────────────────────────────────────────────────────────────

export async function createGoal(
  athleteId: string,
  input: NewGoalInput
): Promise<AthleteGoal> {
  const supabase = createClient();
  // Put new goals at the end
  const { count } = await supabase
    .from("athlete_goals")
    .select("*", { count: "exact", head: true })
    .eq("athlete_id", athleteId);

  const { data, error } = await supabase
    .from("athlete_goals")
    .insert({ ...input, athlete_id: athleteId, sort_order: count ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateGoal(
  goalId: string,
  patch: Partial<Omit<AthleteGoal, "id" | "athlete_id" | "created_at">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("athlete_goals").update(patch).eq("id", goalId);
  if (error) throw error;
}

export async function deleteGoal(goalId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("athlete_goals").delete().eq("id", goalId);
  if (error) throw error;
}

export async function toggleGoalStar(goalId: string, starred: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("athlete_goals")
    .update({ starred })
    .eq("id", goalId);
  if (error) throw error;
}
