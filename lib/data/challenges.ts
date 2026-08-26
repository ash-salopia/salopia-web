import { createClient } from "@/lib/supabase-browser";
import type { EquipmentType, MetricKey } from "@/lib/cardio-metrics";
import type { ChallengeResultRow } from "@/lib/challenges";

export interface Challenge {
  id: string;
  organisation_id: string;
  created_by: string;
  name: string;
  equipment: EquipmentType | null;
  metric_key: MetricKey;
  duration_cap_seconds: number | null;
  direction: "higher" | "lower";
  is_saved: boolean;
  created_at: string;
}

// Coaches RLS returns every colleague in the org, not just this one -
// .single() with no filter silently breaks for any org with more than
// one coach, so this resolves auth.uid() first (same lesson already
// documented on the Community page for the identical pattern).
async function getMyCoach(): Promise<{ id: string; organisation_id: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("coaches")
    .select("id, organisation_id")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return data;
}

export async function listChallenges(): Promise<Challenge[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createChallenge(challenge: {
  name: string;
  equipment: EquipmentType | null;
  metric_key: MetricKey;
  duration_cap_seconds: number | null;
  direction: "higher" | "lower";
  is_saved: boolean;
}): Promise<Challenge> {
  const coach = await getMyCoach();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("challenges")
    .insert({ ...challenge, organisation_id: coach.organisation_id, created_by: coach.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateChallenge(
  id: string,
  patch: Partial<Pick<Challenge, "name" | "equipment" | "metric_key" | "duration_cap_seconds" | "direction" | "is_saved">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("challenges").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteChallenge(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("challenges").delete().eq("id", id);
  if (error) throw error;
}

export async function listChallengeResults(challengeId: string): Promise<ChallengeResultRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("challenge_results")
    .select("id, challenge_id, athlete_id, value, logged_by, logged_at")
    .eq("challenge_id", challengeId)
    .order("logged_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Lets a coach fill in results directly during a live session instead of
// relying on each athlete to self-log from their own device.
export async function logChallengeResultAsCoach(
  challengeId: string,
  athleteId: string,
  value: number
): Promise<void> {
  const coach = await getMyCoach();
  const supabase = createClient();
  const { error } = await supabase.from("challenge_results").insert({
    challenge_id: challengeId,
    athlete_id: athleteId,
    organisation_id: coach.organisation_id,
    value,
    logged_by: "coach",
  });
  if (error) throw error;
}
