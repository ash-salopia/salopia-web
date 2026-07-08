import { createClient } from "@/lib/supabase-browser";
import { todayISO, addDaysISO } from "@/lib/date-utils";
import type { Session, SessionExercise, SessionType, SetLog } from "@/types";

// ------------------------------------------------------------
// Reading
// ------------------------------------------------------------

export async function listAllSessionDates(): Promise<{ athlete_id: string; date: string }[]> {
  const supabase = createClient();
  // Only the columns the dashboard's expiry calculation actually
  // needs - athlete_id and date - rather than fetching every
  // session's full exercise list, which the dashboard never reads.
  const { data, error } = await supabase.from("sessions").select("athlete_id, date");
  if (error) throw error;
  return data ?? [];
}

export async function listSessionsForAthlete(athleteId: string): Promise<Session[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select("*, session_exercises(*)")
    .eq("athlete_id", athleteId)
    .order("date", { ascending: true });
  if (error) throw error;
  // Supabase returns the joined rows under the relation name —
  // normalise to the `exercises` field our types/UI expect.
  return (data ?? []).map((s) => ({
    ...s,
    exercises: (s.session_exercises ?? []).sort(
      (a: SessionExercise, b: SessionExercise) => a.sort_order - b.sort_order
    ),
  }));
}

// Same as listSessionsForAthlete but for several athletes in one
// query — used by the Live Group view, which needs every starred
// athlete's sessions (with exercises, for the tappable set dots) at
// once rather than fetching one athlete at a time.
export async function listSessionsForAthletes(athleteIds: string[]): Promise<Session[]> {
  if (!athleteIds.length) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select("*, session_exercises(*)")
    .in("athlete_id", athleteIds)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((s) => ({
    ...s,
    exercises: (s.session_exercises ?? []).sort(
      (a: SessionExercise, b: SessionExercise) => a.sort_order - b.sort_order
    ),
  }));
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select("*, session_exercises(*)")
    .eq("id", sessionId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null; // no rows
    throw error;
  }
  return {
    ...data,
    exercises: (data.session_exercises ?? []).sort(
      (a: SessionExercise, b: SessionExercise) => a.sort_order - b.sort_order
    ),
  };
}

// ------------------------------------------------------------
// Creating
// ------------------------------------------------------------

export interface NewExerciseInput {
  name: string;
  order?: string;
  sets?: number;
  reps?: string;
  time?: string;
  rest?: string;
  target_load?: string;
  tempo?: string;
  each_side?: boolean;
  notes?: string;
  video_url?: string;
}

// Mirrors the prototype's newExercise() defaults exactly.
function exerciseDefaults(over: NewExerciseInput) {
  const sets = over.sets ?? 3;
  return {
    name: over.name ?? "",
    order: over.order ?? "",
    sets,
    reps: over.reps ?? "8",
    time: over.time ?? "",
    rest: over.rest ?? "",
    target_load: over.target_load ?? "",
    tempo: over.tempo ?? "2-0-2",
    each_side: over.each_side ?? false,
    notes: over.notes ?? "",
    video_url: over.video_url ?? "",
    session_notes: "",
    progress: "" as const,
    progress_reminder: false,
    log: Array.from({ length: sets }, () => ({ weight: "", done: false, reps: "" })) as SetLog[],
  };
}

export async function createSession(
  athleteId: string,
  type: SessionType,
  date: string,
  name: string,
  exercises: NewExerciseInput[]
): Promise<Session> {
  const supabase = createClient();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({ athlete_id: athleteId, type, date, name })
    .select()
    .single();
  if (sessionError) throw sessionError;

  const rows = (exercises.length ? exercises : [{ name: "" }]).map((e, i) => ({
    session_id: session.id,
    ...exerciseDefaults(e),
    sort_order: i,
  }));

  const { data: insertedExercises, error: exError } = await supabase
    .from("session_exercises")
    .insert(rows)
    .select();
  if (exError) throw exError;

  return { ...session, exercises: insertedExercises };
}

// ------------------------------------------------------------
// Updating
// ------------------------------------------------------------

export async function addExercisesToSession(
  sessionId: string,
  exercises: NewExerciseInput[]
): Promise<SessionExercise[]> {
  const supabase = createClient();

  // Find current max sort_order
  const { data: existing } = await supabase
    .from("session_exercises")
    .select("sort_order")
    .eq("session_id", sessionId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const startOrder = ((existing?.[0] as any)?.sort_order ?? -1) + 1;

  const rows = exercises.map((e, i) => ({
    session_id: sessionId,
    ...exerciseDefaults(e),
    sort_order: startOrder + i,
  }));

  const { data, error } = await supabase
    .from("session_exercises")
    .insert(rows)
    .select();
  if (error) throw error;
  return data ?? [];
}

export async function updateSession(
  sessionId: string,
  patch: Partial<Pick<Session, "name" | "date" | "type" | "hyrox_type" | "hyrox_config" | "cardio_type" | "cardio_config">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("sessions").update(patch).eq("id", sessionId);
  if (error) throw error;
}

export async function updateExercise(
  exerciseId: string,
  patch: Partial<SessionExercise>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("session_exercises").update(patch).eq("id", exerciseId);
  if (error) throw error;
}

export async function deleteExercise(exerciseId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("session_exercises").delete().eq("id", exerciseId);
  if (error) throw error;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const supabase = createClient();
  // session_exercises cascade-delete with the session.
  const { error } = await supabase.from("sessions").delete().eq("id", sessionId);
  if (error) throw error;
}

// ------------------------------------------------------------
// Copy sessions / delete range
// ------------------------------------------------------------
// Ported from the prototype's copySessions/deleteRange. Copy takes
// every session for an athlete within a date range and duplicates it
// `weeks` times, each copy landing exactly 7×k days later than the
// original — e.g. copying a Mon/Wed/Fri week forward 3 times
// recreates that same week's structure for the next 3 weeks.
export interface CopySessionsResult {
  sourceCount: number;
  createdCount: number;
}

export async function copySessionsRange(
  athleteId: string,
  start: string,
  end: string,
  weeks: number
): Promise<CopySessionsResult> {
  const sourceSessions = await listSessionsForAthlete(athleteId);
  const src = sourceSessions.filter((s) => s.date >= start && s.date <= end);
  if (!src.length) return { sourceCount: 0, createdCount: 0 };

  const supabase = createClient();
  const newSessionRows = src.flatMap((s) =>
    Array.from({ length: weeks }, (_, k) => ({
      athlete_id: athleteId,
      name: s.name,
      date: addDaysISO(s.date, 7 * (k + 1)),
      type: s.type,
      hyrox_type: s.hyrox_type,
      hyrox_config: s.hyrox_config,
      cardio_type: s.cardio_type,
      cardio_config: s.cardio_config,
      // Track the original session so the coach can propagate exercise
      // changes to all future copies. Carry forward existing source if
      // these source sessions were themselves copies.
      source_session_id: s.source_session_id ?? s.id,
      _sourceSessionId: s.id,
    }))
  );

  // Insert sessions in one batch, then map the returned rows back to
  // their source by array position (Supabase preserves insert order).
  const rowsForInsert = newSessionRows.map(({ _sourceSessionId, ...rest }) => rest);
  const { data: createdSessions, error: sessErr } = await supabase
    .from("sessions")
    .insert(rowsForInsert)
    .select();
  if (sessErr) throw sessErr;

  const exerciseRows = createdSessions.flatMap((sess, i) => {
    const sourceId = newSessionRows[i]._sourceSessionId;
    const sourceSession = src.find((s) => s.id === sourceId);
    return (sourceSession?.exercises ?? []).map((e, sortIdx) => ({
      session_id: sess.id,
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
      sort_order: sortIdx,
      // Copying resets the log (no logged weights carried over) —
      // matches the prototype's copyExercise(e, true), which keeps
      // the progress flag but clears actual logged data since this
      // is a fresh, not-yet-trained session.
      log: Array.from({ length: e.sets ?? 3 }, () => ({ weight: "", done: false, reps: "" })),
    }));
  });

  if (exerciseRows.length) {
    const { error: exErr } = await supabase.from("session_exercises").insert(exerciseRows);
    if (exErr) throw exErr;
  }

  return { sourceCount: src.length, createdCount: createdSessions.length };
}

export async function deleteSessionsRange(athleteId: string, start: string, end: string): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sessions")
    .delete()
    .eq("athlete_id", athleteId)
    .gte("date", start)
    .lte("date", end)
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

// ------------------------------------------------------------
// Apply to future sessions
// ------------------------------------------------------------
// Ported from the prototype's applyToFutureSessions. With a real
// database this is actually simpler than the React-state version we
// had to debug carefully there (see build history — React 18 batches
// setState calls, which caused a counting bug we had to work around).
// Here it's a straightforward two-step: count matches, then update them.
export async function applyToFutureSessions(
  athleteId: string,
  exerciseName: string,
  fromDate: string,
  patch: Partial<Pick<SessionExercise, "sets" | "reps" | "time" | "rest" | "target_load" | "tempo" | "each_side">>
): Promise<number> {
  const supabase = createClient();
  const targetName = exerciseName.trim().toLowerCase();

  // Find every future session for this athlete, then the matching
  // exercise rows within them, in one query using a join.
  const { data: matches, error: findError } = await supabase
    .from("session_exercises")
    .select("id, sessions!inner(athlete_id, date)")
    .eq("sessions.athlete_id", athleteId)
    .gt("sessions.date", fromDate)
    .ilike("name", targetName);
  if (findError) throw findError;
  if (!matches || matches.length === 0) return 0;

  const ids = matches.map((m) => m.id);
  const { error: updateError } = await supabase
    .from("session_exercises")
    .update(patch)
    .in("id", ids);
  if (updateError) throw updateError;

  return ids.length;
}

// ------------------------------------------------------------
// Propagate all exercise changes to future copies of a session
// ------------------------------------------------------------
// Used by the "Update future occurrences" feature on the session
// editor. Finds future sessions that share the same source as the
// current session, then syncs exercises:
//   ADD  — exercises in source not yet in target
//   UPDATE — prescription fields (sets/reps/etc.) for matching exercises
//            leaving any logged weight/reps data untouched
//   DELETE — exercises in target but not source, only if no sets logged

export type PropagateScope = "all" | "same_day";

export async function propagateFutureOccurrences(
  session: Session,        // current (already-saved) session
  scope: PropagateScope
): Promise<number> {
  const supabase = createClient();
  const sourceId = session.source_session_id ?? session.id;
  const sessionDayOfWeek = new Date(session.date + "T12:00:00Z").getDay();

  // Find future sessions that share this source
  const { data: futures, error: findErr } = await supabase
    .from("sessions")
    .select("id, date, session_exercises(*)")
    .eq("source_session_id", sourceId)
    .gt("date", session.date)
    .order("date", { ascending: true });
  if (findErr) throw findErr;
  if (!futures || futures.length === 0) return 0;

  const targets = scope === "same_day"
    ? futures.filter((s: any) => new Date(s.date + "T12:00:00Z").getDay() === sessionDayOfWeek)
    : futures;

  if (!targets.length) return 0;

  const sourceExercises = (session.exercises ?? []) as SessionExercise[];

  for (const target of targets) {
    const targetExercises: any[] = target.session_exercises ?? [];
    const targetByName = new Map(targetExercises.map((e: any) => [e.name.toLowerCase().trim(), e]));
    const sourceByName = new Map(sourceExercises.map((e) => [e.name.toLowerCase().trim(), e]));

    // ADD: in source, not in target
    const toAdd = sourceExercises.filter((e) => !targetByName.has(e.name.toLowerCase().trim()));
    if (toAdd.length) {
      const maxSort = targetExercises.length
        ? Math.max(...targetExercises.map((e: any) => e.sort_order ?? 0))
        : -1;
      const rows = toAdd.map((e, i) => ({
        session_id: target.id,
        name: e.name,
        order: e.order ?? "",
        sets: e.sets ?? 3,
        reps: e.reps ?? "",
        time: e.time ?? "",
        rest: e.rest ?? "",
        target_load: e.target_load ?? "",
        tempo: e.tempo ?? "",
        each_side: e.each_side ?? false,
        notes: e.notes ?? "",
        video_url: e.video_url ?? "",
        sort_order: maxSort + i + 1,
        log: Array.from({ length: e.sets ?? 3 }, () => ({ weight: "", done: false, reps: "" })),
      }));
      const { error } = await supabase.from("session_exercises").insert(rows);
      if (error) throw error;
    }

    // UPDATE: in both — update prescription, leave log alone
    for (const [nameLower, targetEx] of targetByName) {
      const sourceEx = sourceByName.get(nameLower);
      if (!sourceEx) continue;
      const { error } = await supabase.from("session_exercises").update({
        sets: sourceEx.sets,
        reps: sourceEx.reps,
        time: sourceEx.time,
        rest: sourceEx.rest,
        target_load: sourceEx.target_load,
        tempo: sourceEx.tempo,
        each_side: sourceEx.each_side,
        notes: sourceEx.notes,
        video_url: sourceEx.video_url,
        order: sourceEx.order,
        sort_order: sourceEx.sort_order,
      }).eq("id", targetEx.id);
      if (error) throw error;
    }

    // DELETE: in target but not source — only if no sets have been logged
    const toDelete = targetExercises.filter((e: any) => !sourceByName.has(e.name.toLowerCase().trim()));
    for (const ex of toDelete) {
      const hasLog = (ex.log ?? []).some((s: any) => s.done || (s.weight && s.weight !== ""));
      if (hasLog) continue; // never delete a set the athlete has already logged
      const { error } = await supabase.from("session_exercises").delete().eq("id", ex.id);
      if (error) throw error;
    }
  }

  return targets.length;
}

// ------------------------------------------------------------
// Set logging (athlete ticking off a set during a session)
// ------------------------------------------------------------

export async function updateExerciseLog(exerciseId: string, log: SetLog[]): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("session_exercises").update({ log }).eq("id", exerciseId);
  if (error) throw error;
}

// ------------------------------------------------------------
// Live Group support
// ------------------------------------------------------------

// Picks which of an athlete's sessions to show in a compact view
// (Live Group) where there's only room for one at a time: today's
// session if one exists, otherwise the soonest upcoming one,
// otherwise the most recent past one. Ported from the prototype's
// pickActiveSession.
export function pickActiveSession(sessions: Session[], athleteId: string): Session | null {
  const list = sessions.filter((s) => s.athlete_id === athleteId);
  if (!list.length) return null;
  const today = todayISO();
  const todays = list.find((s) => s.date === today);
  if (todays) return todays;
  const future = list.filter((s) => s.date > today).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (future.length) return future[0];
  return [...list].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

// Toggles one set's done flag directly, given the exercise's current
// log — used by the Live Group view for quick tap-to-complete
// without opening the full session editor.
export async function toggleSetDone(exerciseId: string, setIndex: number, log: SetLog[]): Promise<SetLog[]> {
  const newLog = log.map((s, i) => (i === setIndex ? { ...s, done: !s.done } : s));
  await updateExerciseLog(exerciseId, newLog);
  return newLog;
}

// Returns per-athlete session + completion data for a given date range.
// Used by the dashboard "this week" panels.
export async function getWeekCompletionData(
  weekStart: string,
  weekEnd: string
): Promise<{ athlete_id: string; date: string; doneSets: number; totalSets: number }[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select("athlete_id, date, session_exercises(log)")
    .gte("date", weekStart)
    .lte("date", weekEnd);
  if (error) throw error;

  return (data ?? []).map((session: any) => {
    let doneSets = 0;
    let totalSets = 0;
    for (const ex of session.session_exercises ?? []) {
      const log: Array<{ done: boolean }> = ex.log ?? [];
      totalSets += log.length;
      doneSets += log.filter((s) => s.done).length;
    }
    return { athlete_id: session.athlete_id, date: session.date, doneSets, totalSets };
  });
}

// ── Reorder sessions within a day ────────────────────────────────────────────

export async function reorderSessionsOnDay(
  athleteId: string,
  date: string,
  orderedIds: string[]   // session IDs in desired order
): Promise<void> {
  const supabase = createClient();
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase
        .from("sessions")
        .update({ sort_order: i })
        .eq("id", id)
        .eq("athlete_id", athleteId)
        .eq("date", date)
    )
  );
}

// ── Copy a single session to one or more dates ────────────────────────────────

export async function copySessionToDates(
  sessionId: string,
  athleteId: string,
  targetDates: string[]   // ISO date strings
): Promise<number> {
  const supabase = createClient();

  // Fetch source session with exercises
  const source = await getSession(sessionId);
  if (!source) throw new Error("Session not found");

  let created = 0;
  for (const date of targetDates) {
    // Create session
    const { data: newSession, error: sessErr } = await supabase
      .from("sessions")
      .insert({
        athlete_id: athleteId,
        name: source.name,
        date,
        type: source.type,
        hyrox_type: source.hyrox_type ?? null,
        hyrox_config: source.hyrox_config ?? null,
        cardio_type: source.cardio_type ?? null,
        cardio_config: source.cardio_config ?? null,
        session_notes: source.session_notes ?? null,
        // Track which session this was copied from so the coach can
        // propagate exercise changes to all future occurrences later.
        source_session_id: source.source_session_id ?? source.id,
      })
      .select()
      .single();
    if (sessErr) throw sessErr;

    // Copy exercises
    const exercises = source.exercises ?? [];
    if (exercises.length) {
      const exRows = exercises.map((e, i) => ({
        session_id: newSession.id,
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
        sort_order: i,
        distance: (e as any).distance ?? null,
        contacts: (e as any).contacts ?? null,
        intensity_label: (e as any).intensity_label ?? null,
        log: Array.from({ length: e.sets ?? 3 }, () => ({ weight: "", done: false, reps: "" })),
      }));
      const { error: exErr } = await supabase.from("session_exercises").insert(exRows);
      if (exErr) throw exErr;
    }
    created++;
  }
  return created;
}

// ── Generate repeat dates from a pattern ─────────────────────────────────────

export type RepeatPattern = "daily" | "mwf" | "tu_th" | "mtwthf" | "weekends" | "custom";

const DOW_MAP: Record<string, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0,
};

const PATTERN_DAYS: Record<RepeatPattern, number[]> = {
  daily:   [0, 1, 2, 3, 4, 5, 6],
  mwf:     [1, 3, 5],
  tu_th:   [2, 4],
  mtwthf:  [1, 2, 3, 4, 5],
  weekends:[0, 6],
  custom:  [],
};

export function generateRepeatDates(
  startDate: string,   // ISO — first date to consider (usually day after source)
  endDate: string,     // ISO — last date to include
  pattern: RepeatPattern,
  customDays?: number[] // 0=Sun..6=Sat, used when pattern=custom
): string[] {
  const days = pattern === "custom" ? (customDays ?? []) : PATTERN_DAYS[pattern];
  const dates: string[] = [];
  const cursor = new Date(startDate + "T12:00:00Z");
  const end = new Date(endDate + "T12:00:00Z");

  while (cursor <= end) {
    if (days.includes(cursor.getDay())) {
      // Use UTC date parts (consistent with T12:00:00Z construction above)
      const y = cursor.getUTCFullYear();
      const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
      const d = String(cursor.getUTCDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function endDateFromWeeks(startDate: string, weeks: number): string {
  const d = new Date(startDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7 - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
