import "server-only";
import { createServiceRoleClient } from "@/lib/supabase-service";
import type { Athlete, Session, SessionExercise, SetLog } from "@/types";

// Looks up the athlete matching a share token. Returns null if the
// token doesn't match anything — the route should treat that exactly
// like a 404, never revealing whether a token was "close" to valid.
export async function getAthleteByShareToken(token: string): Promise<Athlete | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("athletes")
    .select("*")
    .eq("share_token", token)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Fetches sessions + exercises for exactly one athlete ID. The athlete
// ID here MUST come from a token lookup via getAthleteByShareToken
// above — never accept an athlete ID directly from anywhere else in
// this file's callers, since that would let a visitor with one valid
// token request another athlete's data by guessing IDs.
export async function getAthleteSessions(athleteId: string): Promise<Session[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("sessions")
    .select("*, session_exercises(*)")
    .eq("athlete_id", athleteId)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((s) => ({
    ...s,
    exercises: (s.session_exercises ?? []).sort(
      (a: SessionExercise, b: SessionExercise) => a.sort_order - b.sort_order
    ),
  }));
}

// Athlete-permitted update: logging a set's weight/reps/done, or
// ticking the session-level progress check. Deliberately narrow —
// this does NOT accept changes to prescribed fields (sets, reps,
// target_load, tempo, each_side, name, notes) since those are
// coach-only. The route handler enforces this by only ever calling
// this function with a `log` value, never a generic patch object.
export async function updateAthleteSetLog(
  sessionId: string,
  athleteId: string,
  exerciseId: string,
  log: SetLog[]
): Promise<void> {
  const supabase = createServiceRoleClient();
  // Defence in depth: confirm the exercise actually belongs to a
  // session that belongs to this athlete before writing anything,
  // even though the service role key would technically allow writing
  // anywhere — this stops a forged exerciseId (for a DIFFERENT
  // athlete's exercise) from being writable just because the request
  // carried a valid token for someone else.
  const { data: exercise, error: lookupError } = await supabase
    .from("session_exercises")
    .select("id, sessions!inner(id, athlete_id)")
    .eq("id", exerciseId)
    .eq("session_id", sessionId)
    .single();
  if (lookupError || !exercise) throw new Error("Exercise not found");

  const sessionRecord = Array.isArray(exercise.sessions) ? exercise.sessions[0] : exercise.sessions;
  if (sessionRecord?.athlete_id !== athleteId) {
    throw new Error("This exercise does not belong to your sessions");
  }

  const { error } = await supabase.from("session_exercises").update({ log }).eq("id", exerciseId);
  if (error) throw error;
}

export async function updateAthleteProgress(
  exerciseId: string,
  athleteId: string,
  progress: "" | "yes" | "no"
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: exercise, error: lookupError } = await supabase
    .from("session_exercises")
    .select("id, sessions!inner(athlete_id)")
    .eq("id", exerciseId)
    .single();
  if (lookupError || !exercise) throw new Error("Exercise not found");

  const sessionRecord = Array.isArray(exercise.sessions) ? exercise.sessions[0] : exercise.sessions;
  if (sessionRecord?.athlete_id !== athleteId) {
    throw new Error("This exercise does not belong to your sessions");
  }

  const { error } = await supabase.from("session_exercises").update({ progress }).eq("id", exerciseId);
  if (error) throw error;
}
