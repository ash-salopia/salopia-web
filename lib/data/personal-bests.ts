import { createClient } from "@/lib/supabase-browser";

// 0110 — explicit PB shape, replacing inference from which columns
// are null: 'weight' (heaviest single weight, the classic PB), 'e1rm'
// (best estimated 1RM this session), 'volume' (best total session
// tonnage), 'bw_reps'/'bw_time' (bodyweight, unchanged from before).
export type PBType = "weight" | "e1rm" | "volume" | "bw_reps" | "bw_time";

export interface PersonalBest {
  id: string;
  athlete_id: string;
  exercise_name: string;
  pb_type: PBType;
  weight_kg: number | null;
  reps: number | null;
  time_seconds: number | null; // 0041 — set for a time-mode bodyweight PB (e.g. longest plank hold); null otherwise
  e1rm_kg: number | null; // 0110 — set for pb_type='e1rm' rows only
  volume_kg: number | null; // 0110 — set for pb_type='volume' rows only
  date: string;
  session_id: string | null;
  created_at: string;
  athlete?: { id: string; name: string } | null;
  reactions?: PBReaction[];
  comments?: PBComment[];
}

// Shared display formatting so every PB surface (community feed,
// athlete profile, dashboard, history modals) shows every PB shape
// consistently: weighted (kg, + reps if set), estimated 1RM, session
// volume, bodyweight+reps, bodyweight+time (longest hold).
export function formatPBValue(
  pb: Partial<Pick<PersonalBest, "pb_type" | "weight_kg" | "reps" | "time_seconds" | "e1rm_kg" | "volume_kg">>
): string {
  if (pb.pb_type === "e1rm" && pb.e1rm_kg != null) {
    return `e1RM ${pb.e1rm_kg}kg${pb.weight_kg ? ` (${pb.weight_kg}kg × ${pb.reps})` : ""}`;
  }
  if (pb.pb_type === "volume" && pb.volume_kg != null) {
    return `${Math.round(pb.volume_kg)}kg total volume`;
  }
  if (pb.time_seconds != null) {
    const mins = Math.floor(pb.time_seconds / 60);
    const secs = Math.round(pb.time_seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${pb.time_seconds}s`;
  }
  if (pb.weight_kg != null) {
    return `${pb.weight_kg}kg${pb.reps ? ` × ${pb.reps}` : ""}`;
  }
  if (pb.reps != null) {
    return `${pb.reps} reps`;
  }
  return "Bodyweight";
}

// Short badge label for the PB type, shown alongside the value so a
// non-'weight' lane (e1RM, volume) doesn't read as a plain weight PB.
export function pbTypeLabel(pbType: PBType | undefined): string | null {
  switch (pbType) {
    case "e1rm": return "Estimated 1RM";
    case "volume": return "Session volume";
    case "bw_reps": return "Most reps";
    case "bw_time": return "Longest hold";
    default: return null; // 'weight' - the classic PB, no extra label needed
  }
}

export interface PBComment {
  id: string;
  pb_id: string;
  author_id: string;
  author_type: "coach" | "athlete";
  author_name: string;
  body: string;
  created_at: string;
}

export interface PBReaction {
  id: string;
  pb_id: string;
  reactor_type: "coach" | "athlete";
  reactor_id: string;
  reactor_name: string;
  emoji: string;
  created_at: string;
}

export async function listRecentOrgPBs(limit = 30): Promise<PersonalBest[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("personal_bests")
    .select("*, athlete:athletes!inner(id, name), reactions:pb_reactions(*), comments:pb_comments(*)")
    .eq("athlete.archived", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listAthletePBs(athleteId: string): Promise<PersonalBest[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("personal_bests")
    .select("*, reactions:pb_reactions(*)")
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addCoachReaction(
  pbId: string,
  coachId: string,
  coachName: string,
  emoji = "fire"
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("pb_reactions").upsert(
    { pb_id: pbId, reactor_type: "coach", reactor_id: coachId, reactor_name: coachName, emoji },
    { onConflict: "pb_id,reactor_type,reactor_id" }
  );
  if (error) throw error;
}

export async function removeCoachReaction(pbId: string, coachId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("pb_reactions")
    .delete()
    .eq("pb_id", pbId)
    .eq("reactor_type", "coach")
    .eq("reactor_id", coachId);
  if (error) throw error;
}

export async function deletePB(pbId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("personal_bests")
    .delete()
    .eq("id", pbId);
  if (error) throw error;
}

// Deletes every stored PB row for one exercise (there can be several —
// one per session, see 0039). Used by "Delete PB" on the profile so the
// next logged set is a PB from zero, not from the second-best row.
export async function deletePBsForExercise(athleteId: string, exerciseName: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("personal_bests")
    .delete()
    .eq("athlete_id", athleteId)
    .ilike("exercise_name", exerciseName);
  if (error) throw error;
}

export async function updatePB(
  pbId: string,
  patch: { weight_kg?: number | null; reps?: number | null; date?: string }
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("personal_bests")
    .update(patch)
    .eq("id", pbId);
  if (error) throw error;
}

export async function createManualPB(params: {
  athleteId: string;
  exerciseName: string;
  weightKg: number | null;
  reps: number | null;
  date: string;
}): Promise<PersonalBest> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("personal_bests")
    .insert({
      athlete_id: params.athleteId,
      exercise_name: params.exerciseName,
      pb_type: "weight",
      weight_kg: params.weightKg,
      reps: params.reps,
      date: params.date,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
