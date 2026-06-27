import { createClient } from "@/lib/supabase-browser";

export interface PersonalBest {
  id: string;
  athlete_id: string;
  exercise_name: string;
  weight_kg: number | null;
  reps: number | null;
  date: string;
  session_id: string | null;
  created_at: string;
  athlete?: { id: string; name: string } | null;
  reactions?: PBReaction[];
  comments?: PBComment[];
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
    .select("*, athlete:athletes(id, name), reactions:pb_reactions(*), comments:pb_comments(*)")
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
