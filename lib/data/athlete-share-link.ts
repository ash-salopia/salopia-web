import "server-only";
import { unstable_noStore as noStore } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { todayISO } from "@/lib/date-utils";
import { bestRollingOneRM, calculateSetTargets, type OneRMFormula } from "@/lib/one-rm";
import { DEFAULT_SETTINGS, type OrgSettings } from "@/lib/data/settings";
import type { Athlete, Session, SessionExercise, SetLog, Template, TemplateDef, PrescribedExercise, RecoveryConfig } from "@/types";

// Service-role version of getOrgSettings, resolved via the athlete's
// organisation rather than a coach login. Lives here (not in
// lib/data/settings.ts) because settings.ts is imported by client
// components and must stay free of server-only packages.
export async function getOrgSettingsForAthlete(athleteId: string): Promise<OrgSettings> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("athletes")
    .select("organisation_id, organisations(settings)")
    .eq("id", athleteId)
    .single();
  const org = Array.isArray(data?.organisations) ? data.organisations[0] : (data?.organisations as any);
  return { ...DEFAULT_SETTINGS, ...(org?.settings ?? {}) };
}

// Looks up the athlete matching a share token. Returns null if the
// token doesn't match anything — the route should treat that exactly
// like a 404, never revealing whether a token was "close" to valid.
// share_token is a uuid column, so a malformed token (not valid UUID
// syntax — e.g. a bot probing random strings) makes Postgres error
// instead of just returning no rows; treated identically to "not
// found" here rather than left to throw, which previously crashed any
// route that didn't separately wrap this call in its own try/catch
// with a raw 500 instead of a clean "Invalid link" response.
export async function getAthleteByShareToken(token: string): Promise<Athlete | null> {
  const supabase = createServiceRoleClient();
  try {
    const { data, error } = await supabase
      .from("athletes")
      .select("*")
      .eq("share_token", token)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
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
    .order("date", { ascending: false })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  const sessions: Session[] = (data ?? []).map((s) => ({
    ...s,
    exercises: (s.session_exercises ?? []).sort(
      (a: SessionExercise, b: SessionExercise) => a.sort_order - b.sort_order
    ),
  }));
  await attachComputedTargets(athleteId, sessions);
  return sessions;
}

// ── %1RM targets (0038) ───────────────────────────────────────────────────────

// The athlete's current 1RM for one exercise: a coach-set fixed value
// on the athlete's profile if one exists, always checked first
// regardless of the org's one_rm_source setting (an explicit number a
// coach entered shouldn't be silently ignored), otherwise the rolling
// estimate from logged history. Returns null only when there's no
// fixed value AND no logged history at all.
export async function getCurrentOneRM(
  athleteId: string,
  exerciseName: string,
  orgSettings: OrgSettings
): Promise<number | null> {
  const supabase = createServiceRoleClient();

  const { data } = await supabase
    .from("athlete_one_rms")
    .select("one_rm_kg")
    .eq("athlete_id", athleteId)
    .ilike("exercise_name", exerciseName)
    .limit(1);
  const fixed = data?.[0]?.one_rm_kg;
  if (fixed != null) return Number(fixed);

  const { data: rows } = await supabase
    .from("session_exercises")
    .select("log, reps, is_primer, sessions!inner(athlete_id, is_primer)")
    .ilike("name", exerciseName)
    .eq("sessions.athlete_id", athleteId)
    .eq("is_primer", false)
    .eq("sessions.is_primer", false);

  return bestRollingOneRM(rows ?? [], orgSettings.one_rm_formula);
}

// Attaches computed_targets (per-set calculated kg) to every
// %1RM-prescribed exercise, the moment a 1RM is available to compute
// it from. Purely a display value — shown as a greyed suggestion in
// the load box — never written to log[i].weight itself; the athlete
// app decides what to do with it (show as a placeholder, and capture
// it into the real log only if the athlete taps done without typing
// over it). set_percents is the prescription (coach-controlled,
// parallel to reps/rest/tempo); log stays purely the athlete's actual
// results.
//
// The sessions array already contains the athlete's complete logged
// history, so the rolling estimate is computed in-memory from data
// that's fetched anyway — no per-exercise queries. Only the org
// settings (and one batch of athlete_one_rms rows) cost an extra
// round-trip, and only when at least one %1RM exercise exists.
async function attachComputedTargets(athleteId: string, sessions: Session[]): Promise<void> {
  const withPercent = sessions.flatMap((s) =>
    (s.exercises ?? []).filter((e) => e.use_percent_1rm && (e.set_percents ?? []).some((p) => p))
  );
  if (!withPercent.length) return;

  const settings = await getOrgSettingsForAthlete(athleteId);
  const supabase = createServiceRoleClient();

  // A fixed 1RM the coach has explicitly set on the athlete's profile
  // is always checked first, regardless of the org's one_rm_source
  // toggle — an explicit number a coach entered shouldn't be silently
  // ignored just because the org defaults to rolling estimates.
  // one_rm_source only decides the fallback when no fixed value
  // exists: "rolling" estimates from logged history, "fixed" leaves
  // it uncalculated until the coach sets one.
  const fixedByName = new Map<string, number>();
  const { data: fixedRows } = await supabase
    .from("athlete_one_rms")
    .select("exercise_name, one_rm_kg")
    .eq("athlete_id", athleteId);
  for (const row of fixedRows ?? []) {
    if (row.one_rm_kg != null) fixedByName.set(row.exercise_name.trim().toLowerCase(), Number(row.one_rm_kg));
  }

  const rollingByName = new Map<string, number | null>();
  const rollingFor = (key: string): number | null => {
    if (!rollingByName.has(key)) {
      const rows = sessions.flatMap((s) =>
        s.is_primer ? [] : (s.exercises ?? []).filter((e) => e.name.trim().toLowerCase() === key && !e.is_primer)
      );
      rollingByName.set(key, bestRollingOneRM(rows, settings.one_rm_formula));
    }
    return rollingByName.get(key) ?? null;
  };

  for (const ex of withPercent) {
    const key = ex.name.trim().toLowerCase();
    const oneRM = fixedByName.get(key) ?? rollingFor(key);
    if (oneRM == null) continue;
    ex.computed_targets = calculateSetTargets(oneRM, ex.set_percents ?? []);
  }
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

// Athlete's own note on one exercise (0040) — separate from the
// coach's prescription note (session_exercises.notes) and the
// athlete's session-level note (sessions.athlete_notes, 0033). Same
// defence-in-depth ownership check as updateAthleteSetLog above.
export async function updateAthleteExerciseNotes(
  sessionId: string,
  athleteId: string,
  exerciseId: string,
  notes: string
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
    .update({ athlete_exercise_notes: notes })
    .eq("id", exerciseId);
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

// Athlete-side completion taps on a Recovery session — checklist
// ticks, block done-flags, the whole-session "mark done" toggle for
// Quick Prescription. Same ownership-check shape as
// updateAthleteSessionNotes above. Deliberately takes the FULL
// recovery_config object (not a partial patch) — the caller merges
// client-side first, same as every other jsonb-blob round-trip in
// this codebase (hyrox_config, cardio_config).
export async function updateRecoveryConfig(
  sessionId: string,
  athleteId: string,
  recoveryConfig: RecoveryConfig
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

  const { error } = await supabase
    .from("sessions")
    .update({ recovery_config: recoveryConfig })
    .eq("id", sessionId);
  if (error) throw error;
}

// End-of-session feedback, only ever shown when the coach opted in
// via recovery_config.request_feedback. One row per session (upsert
// on session_id, same "natural key" upsert pattern as
// weekly_reflections' (athlete_id, week_start)).
export async function submitSessionFeedback(
  sessionId: string,
  athleteId: string,
  feedback: {
    completion: boolean | null;
    recovery_score: number | null;
    soreness: number | null;
    fatigue: number | null;
    pain_notes: string;
    notes: string;
  }
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

  const { error } = await supabase
    .from("session_feedback")
    .upsert({ session_id: sessionId, athlete_id: athleteId, ...feedback }, { onConflict: "session_id" });
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
      recovery_category: def.recovery_category,
      recovery_format: def.recovery_format,
      recovery_config: def.recovery_config,
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
      use_percent_1rm: e.use_percent_1rm ?? false,
      set_percents: e.set_percents ?? [],
      sort_order: i,
      log: Array.from({ length: e.sets ?? 3 }, () => ({ weight: "", done: false, reps: "" })),
    }));
    const { error: exErr } = await supabase.from("session_exercises").insert(exerciseRows);
    if (exErr) throw exErr;
  }

  return session.id;
}

// ------------------------------------------------------------
// Feed visibility settings (0047) — athlete-controlled, coach never
// sets or overrides these. athleteId here MUST come from a token
// lookup via getAthleteByShareToken, same rule as every other write
// in this file.
// ------------------------------------------------------------
export async function updateAthleteVisibilitySettings(
  athleteId: string,
  patch: { hide_pbs_from_feed?: boolean; feed_first_name_only?: boolean }
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("athletes").update(patch).eq("id", athleteId);
  if (error) throw error;
}
