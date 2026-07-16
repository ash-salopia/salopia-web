import "server-only";
import { unstable_noStore as noStore } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { todayISO } from "@/lib/date-utils";
import type { Athlete, Session, SessionExercise, SetLog, Template, TemplateDef, PrescribedExercise } from "@/types";

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
  noStore();
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

// Exercise swap / opt-out (0035) — lets an athlete substitute a
// prescribed exercise for an alternative, or skip it entirely, in the
// moment. Never touches the coach's actual prescription for future
// occurrences — this is scoped to this one session_exercises row.
export async function swapAthleteExercise(
  sessionId: string,
  athleteId: string,
  exerciseId: string,
  newName: string,
  newVideoUrl: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: exercise, error: lookupError } = await supabase
    .from("session_exercises")
    .select("id, name, sets, swapped_from, sessions!inner(id, athlete_id)")
    .eq("id", exerciseId)
    .eq("session_id", sessionId)
    .single();
  if (lookupError || !exercise) throw new Error("Exercise not found");

  const sessionRecord = Array.isArray(exercise.sessions) ? exercise.sessions[0] : exercise.sessions;
  if (sessionRecord?.athlete_id !== athleteId) {
    throw new Error("This exercise does not belong to your sessions");
  }

  // swapped_from always tracks the ORIGINAL prescribed name, even
  // across multiple swaps, so swapping back to it is recognised as a
  // revert (clears swapped_from) rather than stacking another swap on
  // top of an already-swapped name.
  const originalName = exercise.swapped_from ?? exercise.name;
  const isRevert = newName === originalName;

  const { error } = await supabase
    .from("session_exercises")
    .update({
      name: newName,
      video_url: newVideoUrl,
      swapped_from: isRevert ? null : originalName,
      opted_out: false,
      progress: "",
      // Sets logged against the old exercise don't belong under the
      // new one — reset to fresh empty sets at the same prescribed count.
      log: Array.from({ length: exercise.sets ?? 3 }, () => ({ weight: "", done: false, reps: "" })),
    })
    .eq("id", exerciseId);
  if (error) throw error;
}

export async function setAthleteExerciseOptOut(
  sessionId: string,
  athleteId: string,
  exerciseId: string,
  optedOut: boolean
): Promise<void> {
  const supabase = createServiceRoleClient();
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

  const { error } = await supabase
    .from("session_exercises")
    .update({ opted_out: optedOut })
    .eq("id", exerciseId);
  if (error) throw error;
}

// Read-only: the org's full exercise library, for the athlete to
// freely search when swapping to something not on the coach's
// pre-approved alternatives list. organisationId comes from the
// already-resolved Athlete (via getAthleteByShareToken), never from
// client input.
export async function getLibraryForOrganisation(
  organisationId: string
): Promise<Array<{ id: string; name: string; video_url: string }>> {
  noStore();
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("library_entries")
    .select("id, name, video_url")
    .eq("organisation_id", organisationId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
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

// Athlete's own note on a session (separate from the coach's
// session_notes — see 0033_athlete_session_notes.sql). Deliberately
// its own function, same pattern as the two above, rather than a
// generic session-patch endpoint.
export async function updateAthleteSessionNotes(
  sessionId: string,
  athleteId: string,
  athleteNotes: string
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: session, error: lookupError } = await supabase
    .from("sessions")
    .select("id, athlete_id")
    .eq("id", sessionId)
    .single();
  if (lookupError || !session) throw new Error("Session not found");
  if (session.athlete_id !== athleteId) {
    throw new Error("This session does not belong to you");
  }

  // A new/changed non-empty note needs the coach's attention again —
  // reset acknowledged so it (re)surfaces on the dashboard. Clearing
  // the note back to empty needs no review, so mark it acknowledged.
  const { error } = await supabase
    .from("sessions")
    .update({ athlete_notes: athleteNotes, athlete_notes_acknowledged: !athleteNotes.trim() })
    .eq("id", sessionId);
  if (error) throw error;
}

// Session Library (0034) — templates a coach has granted this athlete
// access to, for browsing/logging informally outside their assigned
// programme. Read-side: no ownership check needed beyond scoping the
// grants query to this athlete's own id.
export async function getAthleteLibraryTemplates(athleteId: string): Promise<Template[]> {
  noStore();
  const supabase = createServiceRoleClient();

  const { data: grants, error: grantsErr } = await supabase
    .from("athlete_template_access")
    .select("template_id")
    .eq("athlete_id", athleteId);
  if (grantsErr) throw grantsErr;

  const templateIds = (grants ?? []).map((g) => g.template_id);
  if (!templateIds.length) return [];

  const { data, error } = await supabase
    .from("templates")
    .select("*, template_defs(*)")
    .in("id", templateIds)
    .order("name", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((t) => ({
    ...t,
    defs: (t.template_defs ?? []).sort((a: TemplateDef, b: TemplateDef) => a.sort_order - b.sort_order),
  }));
}

// Athlete-initiated "start a library session" — materializes a real
// sessions row (session_source: 'library', dated today) from a
// template def, seeded with empty per-set logs exactly like
// loadProgrammeSessionForAthlete does for coach-loaded sessions, then
// returns the new session's id so the athlete can be routed straight
// into the normal logging UI. Never trusts the client-supplied
// templateDefId is one this athlete was actually granted — resolves
// it to its parent template and re-checks the access grant here, even
// though the service-role client would technically allow writing
// anywhere.
export async function startLibrarySession(athleteId: string, templateDefId: string): Promise<string> {
  const supabase = createServiceRoleClient();

  const { data: def, error: defErr } = await supabase
    .from("template_defs")
    .select("*")
    .eq("id", templateDefId)
    .maybeSingle();
  if (defErr || !def) throw new Error("Session not found");

  const { data: grant, error: grantErr } = await supabase
    .from("athlete_template_access")
    .select("id")
    .eq("athlete_id", athleteId)
    .eq("template_id", def.template_id)
    .maybeSingle();
  if (grantErr || !grant) throw new Error("You don't have access to this session");

  const { data: session, error: sessErr } = await supabase
    .from("sessions")
    .insert({
      athlete_id: athleteId,
      name: def.name,
      date: todayISO(),
      type: def.type,
      hyrox_type: def.hyrox_type,
      hyrox_config: def.hyrox_config,
      cardio_type: def.cardio_type,
      cardio_config: def.cardio_config,
      session_source: "library",
    })
    .select()
    .single();
  if (sessErr) throw sessErr;

  const exercises = (def.exercises ?? []) as PrescribedExercise[];
  if (exercises.length) {
    const exerciseRows = exercises.map((e, i) => ({
      session_id: session.id,
      name: e.name,
      order: e.order ?? "",
      sets: e.sets ?? 3,
      reps: e.reps ?? "",
      time: e.time ?? "",
      rest: e.rest ?? "",
      target_load: e.target_load ?? "",
      tempo: e.tempo ?? "2-0-2",
      each_side: e.each_side ?? false,
      notes: e.notes ?? "",
      video_url: e.video_url ?? "",
      rpe: e.rpe ?? null,
      percent_1rm: e.percent_1rm ?? null,
      sort_order: i,
      log: Array.from({ length: e.sets ?? 3 }, () => ({ weight: "", done: false, reps: "" })),
    }));
    const { error: exErr } = await supabase.from("session_exercises").insert(exerciseRows);
    if (exErr) throw exErr;
  }

  return session.id;
}
