import { createClient } from "@/lib/supabase-browser";

export type GoalType = "exercise" | "weight" | "time" | "text" | "test";

export interface AthleteGoal {
  id: string;
  athlete_id: string;
  label: string;
  goal_type: GoalType;
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
  // 0016
  target_date: string | null;
  tier: "primary" | "secondary" | null;
  // 0093 — testing-metric goals
  test_metric_id: string | null;
  start_value: number | null;
  start_value_date: string | null;
  target_value: number | null;
  show_on_calendar: boolean;
}

type GoalOptionalKeys =
  | "target_date" | "tier"
  | "test_metric_id" | "start_value" | "start_value_date" | "target_value" | "show_on_calendar";

export type NewGoalInput =
  Omit<AthleteGoal, "id" | "athlete_id" | "created_at" | "sort_order" | GoalOptionalKeys>
  & Partial<Pick<AthleteGoal, GoalOptionalKeys>>;

// A goal's target_date shown as a calendar milestone (coach + athlete
// calendars). goal_type/value fields kept so the marker can show context.
export interface GoalMilestone {
  id: string;
  label: string;
  goal_type: GoalType;
  target_date: string;
  target_value: number | null;
  target_kg: number | null;
  target_time: string;
  unit: string;
}

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

// Goals flagged to show as a calendar milestone, for a set of athletes
// (coach-side, RLS-scoped to the coach's org). Only goals with a
// target_date come back.
export async function listGoalMilestones(athleteIds: string[]): Promise<Record<string, GoalMilestone[]>> {
  if (athleteIds.length === 0) return {};
  const supabase = createClient();
  const { data, error } = await supabase
    .from("athlete_goals")
    .select("id, athlete_id, label, goal_type, target_date, target_value, target_kg, target_time, unit")
    .in("athlete_id", athleteIds)
    .eq("show_on_calendar", true)
    .not("target_date", "is", null);
  if (error) throw error;
  const out: Record<string, GoalMilestone[]> = {};
  for (const g of data ?? []) {
    (out[g.athlete_id as string] ??= []).push({
      id: g.id as string,
      label: g.label as string,
      goal_type: g.goal_type as GoalType,
      target_date: g.target_date as string,
      target_value: (g.target_value as number | null) ?? null,
      target_kg: (g.target_kg as number | null) ?? null,
      target_time: (g.target_time as string) ?? "",
      unit: (g.unit as string) ?? "",
    });
  }
  return out;
}
