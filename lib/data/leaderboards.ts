import { createClient } from "@/lib/supabase-browser";
import { getOrgSettings } from "@/lib/data/settings";
import { listAthletes } from "@/lib/data/athletes";
import { buildLeaderboards, ageInYears, type LeaderboardBoard, type AgeBand, type LbAthlete, type LbSquad } from "@/lib/leaderboards";

export interface LeaderboardsData {
  enabled: boolean;
  boards: LeaderboardBoard[];
  bands: AgeBand[];
  squads: LbSquad[];
}

// ── Coach client ──────────────────────────────────────────────────────────────

export async function getLeaderboards(): Promise<LeaderboardsData> {
  const settings = await getOrgSettings();
  if (!settings.leaderboards_enabled) return { enabled: false, boards: [], bands: [], squads: [] };

  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const athletesRaw = await listAthletes();
  const athletes: LbAthlete[] = athletesRaw.map((a) => ({
    id: a.id,
    name: a.name,
    sex: a.sex,
    age: ageInYears(a.date_of_birth, today),
    bodyweightKg: a.bodyweight_kg,
    hideFromFeed: !!a.hide_pbs_from_feed,
    firstNameOnly: false, // the coach sees full names
  }));

  const { boards, bands } = await buildLeaderboards(supabase, {
    strengthExercises: settings.leaderboards.strength_exercises,
    testMetrics: settings.leaderboards.test_metrics,
  }, athletes);

  // Squads — RLS scopes both reads to the coach's org.
  const [{ data: groupRows }, { data: memberRows }] = await Promise.all([
    supabase.from("groups").select("id, name").order("name"),
    supabase.from("group_members").select("group_id, athlete_id"),
  ]);
  const squads: LbSquad[] = (groupRows ?? []).map((g) => ({
    id: g.id as string,
    name: g.name as string,
    athleteIds: (memberRows ?? []).filter((m) => m.group_id === g.id).map((m) => m.athlete_id as string),
  }));

  return { enabled: true, boards, bands, squads };
}

// Distinct exercise names with a weighted PB in the org — populates the
// strength-exercise picker in Settings.
export async function listOrgPbExerciseNames(): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase.from("personal_bests").select("exercise_name").not("weight_kg", "is", null);
  const seen = new Map<string, string>();
  for (const r of data ?? []) {
    const name = (r.exercise_name as string) ?? "";
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}
