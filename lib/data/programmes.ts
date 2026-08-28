import { createClient } from "@/lib/supabase-browser";
import { getMyOrganisationId } from "@/lib/data/athletes";
import { addDaysISO, daysBetween } from "@/lib/date-utils";
import type { Programme, ProgrammeSession, PrescribedExercise, Template, Session } from "@/types";

export async function listProgrammes(): Promise<Programme[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("programmes")
    .select("*, programme_sessions(*), programme_assignments(athlete_id)")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p) => ({
    ...p,
    sessions: (p.programme_sessions ?? []).sort(
      (a: ProgrammeSession, b: ProgrammeSession) => a.sort_order - b.sort_order
    ),
    assigned_to: (p.programme_assignments ?? []).map((a: { athlete_id: string }) => a.athlete_id),
  }));
}

export async function getProgramme(id: string): Promise<Programme | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("programmes")
    .select("*, programme_sessions(*), programme_assignments(athlete_id)")
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return {
    ...data,
    sessions: (data.programme_sessions ?? []).sort(
      (a: ProgrammeSession, b: ProgrammeSession) => a.sort_order - b.sort_order
    ),
    assigned_to: (data.programme_assignments ?? []).map((a: { athlete_id: string }) => a.athlete_id),
  };
}

export async function createProgramme(): Promise<Programme> {
  const supabase = createClient();
  const organisation_id = await getMyOrganisationId();
  const { data, error } = await supabase
    .from("programmes")
    .insert({ organisation_id, name: "New Programme", description: "" })
    .select()
    .single();
  if (error) throw error;
  return { ...data, sessions: [], assigned_to: [] };
}

export async function updateProgramme(
  id: string,
  patch: Partial<Pick<Programme, "name" | "description">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("programmes").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteProgramme(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("programmes").delete().eq("id", id);
  if (error) throw error;
}

// Converts a Template Library entry into a new Programme — each
// template def becomes a programme session, exercises snapshotted at
// save time (a programme session is a fixed copy, not a live link
// back to the template — matching the prototype's
// saveTemplateToProgLib, which deliberately copies rather than
// references, so editing the template later doesn't retroactively
// change a programme already built from it).
export async function createProgrammeFromTemplate(template: Template): Promise<Programme> {
  const supabase = createClient();
  const organisation_id = await getMyOrganisationId();

  const { data: programme, error: pError } = await supabase
    .from("programmes")
    .insert({ organisation_id, name: template.name, description: "" })
    .select()
    .single();
  if (pError) throw pError;

  const sessionRows = (template.defs ?? []).map((def, i) => ({
    programme_id: programme.id,
    name: def.name,
    type: def.type,
    exercises: def.exercises ?? [],
    hyrox_type: def.hyrox_type,
    hyrox_config: def.hyrox_config,
    cardio_type: def.cardio_type,
    cardio_config: def.cardio_config,
    recovery_category: def.recovery_category,
    recovery_format: def.recovery_format,
    recovery_config: def.recovery_config,
    notes: def.notes ?? "",
    sort_order: i,
    // Templates carry a days[]-weekday-repeat concept, not real dates, so
    // there's no rest-day pattern to preserve here - one day per def.
    day_offset: i,
  }));

  let sessions: ProgrammeSession[] = [];
  if (sessionRows.length) {
    const { data, error: sError } = await supabase
      .from("programme_sessions")
      .insert(sessionRows)
      .select();
    if (sError) throw sError;
    sessions = data;
  }

  return { ...programme, sessions, assigned_to: [] };
}

// ------------------------------------------------------------
// Save a date range of an athlete's real, already-built sessions as a
// reusable Programme — the "Save as Programme" entry point in the
// athlete session builder, alongside createProgrammeFromTemplate
// above. Sessions become programme_sessions in chronological order
// (same-day sessions keep their calendar sort_order); a programme has
// no weekday-repeat concept, unlike Templates, so ordering is all it
// needs to preserve.
// ------------------------------------------------------------
export async function createProgrammeFromSessions(sessions: Session[], name: string): Promise<Programme> {
  const supabase = createClient();
  const organisation_id = await getMyOrganisationId();

  const { data: programme, error: pError } = await supabase
    .from("programmes")
    .insert({ organisation_id, name, description: "" })
    .select()
    .single();
  if (pError) throw pError;

  const ordered = [...sessions].sort((a, b) =>
    a.date === b.date ? a.sort_order - b.sort_order : a.date < b.date ? -1 : 1
  );
  const rangeStart = ordered[0]?.date;

  const sessionRows = ordered.map((s, i) => ({
    programme_id: programme.id,
    name: s.name,
    type: s.type,
    exercises: (s.exercises ?? []).map((e): PrescribedExercise => ({
      id: crypto.randomUUID(),
      name: e.name,
      order: e.order,
      sets: e.sets,
      reps: e.reps,
      time: e.time,
      rest: e.rest,
      target_load: e.target_load,
      tempo: e.tempo,
      each_side: e.each_side,
      notes: e.notes,
      video_url: e.video_url,
    })),
    hyrox_type: s.hyrox_type,
    hyrox_config: s.hyrox_config,
    cardio_type: s.cardio_type,
    cardio_config: s.cardio_config,
    recovery_category: s.recovery_category,
    recovery_format: s.recovery_format,
    recovery_config: s.recovery_config,
    notes: s.session_notes ?? "",
    sort_order: i,
    day_offset: rangeStart ? daysBetween(rangeStart, s.date) : i,
  }));

  let progSessions: ProgrammeSession[] = [];
  if (sessionRows.length) {
    const { data, error: sError } = await supabase
      .from("programme_sessions")
      .insert(sessionRows)
      .select();
    if (sError) throw sError;
    progSessions = data;
  }

  return { ...programme, sessions: progSessions, assigned_to: [] };
}

// Computes which calendar date each session lands on when a programme is
// loaded starting at `startDate`. By default this reproduces the exact
// day pattern the programme was saved with (day_offset), including rest
// days - e.g. a session saved as day_offset 3 lands 3 days after
// startDate, whatever gap that leaves for the sessions either side of it.
// Offsets are normalised to the earliest one in `sessions` so that
// whichever session comes first (even if some earlier ones were left
// unchecked before calling this) always lands exactly on startDate.
// Passing `spacingDays` overrides this and instead spaces every session
// evenly by that many days - for a coach who explicitly wants a
// different cadence than the one it was originally trained on.
export function scheduleProgrammeSessions(
  sessions: ProgrammeSession[],
  startDate: string,
  spacingDays?: number
): { session: ProgrammeSession; date: string }[] {
  const ordered = [...sessions].sort((a, b) => a.day_offset - b.day_offset);
  if (spacingDays != null) {
    return ordered.map((session, i) => ({ session, date: addDaysISO(startDate, i * spacingDays) }));
  }
  const minOffset = ordered.length ? ordered[0].day_offset : 0;
  return ordered.map((session) => ({
    session,
    date: addDaysISO(startDate, session.day_offset - minOffset),
  }));
}

export async function addProgrammeSession(programmeId: string, sortOrder: number): Promise<ProgrammeSession> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("programme_sessions")
    .insert({
      programme_id: programmeId,
      name: `Session ${sortOrder + 1}`,
      type: "strength",
      exercises: [],
      sort_order: sortOrder,
      day_offset: sortOrder,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProgrammeSession(
  id: string,
  patch: Partial<Pick<ProgrammeSession, "name" | "type" | "exercises" | "hyrox_type" | "hyrox_config" | "cardio_type" | "cardio_config" | "recovery_category" | "recovery_format" | "recovery_config">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("programme_sessions").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteProgrammeSession(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("programme_sessions").delete().eq("id", id);
  if (error) throw error;
}

// Re-inserts a full ProgrammeSession snapshot verbatim (same id, every
// field intact including its exercises JSONB) - the undo path for
// deleteProgrammeSession. The row is fully self-contained (a flat
// table, no other table has a foreign key into it), so this is a
// complete restore with no follow-up cleanup needed.
export async function restoreProgrammeSession(session: ProgrammeSession): Promise<ProgrammeSession> {
  const supabase = createClient();
  const { data, error } = await supabase.from("programme_sessions").insert(session).select().single();
  if (error) throw error;
  return data;
}

// Imports every def from an existing Template into an already-existing
// Programme, appended after its current sessions - the counterpart to
// createProgrammeFromTemplate above, for when the programme isn't brand
// new. Same snapshot-copy semantics: no live link back to the template.
export async function addTemplateDefsToProgramme(
  programmeId: string,
  template: Template,
  sortOrderStart: number
): Promise<ProgrammeSession[]> {
  const defs = template.defs ?? [];
  if (!defs.length) return [];

  const supabase = createClient();
  const sessionRows = defs.map((def, i) => ({
    programme_id: programmeId,
    name: def.name,
    type: def.type,
    exercises: def.exercises ?? [],
    hyrox_type: def.hyrox_type,
    hyrox_config: def.hyrox_config,
    cardio_type: def.cardio_type,
    cardio_config: def.cardio_config,
    recovery_category: def.recovery_category,
    recovery_format: def.recovery_format,
    recovery_config: def.recovery_config,
    notes: def.notes ?? "",
    sort_order: sortOrderStart + i,
    day_offset: sortOrderStart + i,
  }));

  const { data, error } = await supabase.from("programme_sessions").insert(sessionRows).select();
  if (error) throw error;
  return data;
}

// ------------------------------------------------------------
// Assignment — labelling which athletes a programme is meant for.
// Does NOT put anything on an athlete's calendar by itself (see
// loadProgrammeSessionForAthlete below for that) — matches the
// prototype's deliberate distinction between "assigned" (a label)
// and "loaded" (a real, dated session created from it).
// ------------------------------------------------------------
export async function assignProgrammeToAthlete(programmeId: string, athleteId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("programme_assignments")
    .insert({ programme_id: programmeId, athlete_id: athleteId });
  // Unique constraint violation (already assigned) is fine to ignore
  // silently rather than surfacing as an error — the end state the
  // caller wants ("this athlete is assigned") is already true.
  if (error && error.code !== "23505") throw error;
}

export async function unassignProgrammeFromAthlete(programmeId: string, athleteId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("programme_assignments")
    .delete()
    .eq("programme_id", programmeId)
    .eq("athlete_id", athleteId);
  if (error) throw error;
}

// Loads ONE specific session from within a programme onto an
// athlete's calendar as a real, dated session — this is the actual
// "put it in front of the athlete" action, separate from assignment.
export async function loadProgrammeSessionForAthlete(
  programmeSession: ProgrammeSession,
  athleteId: string,
  date: string
): Promise<void> {
  const supabase = createClient();
  const { data: session, error: sessErr } = await supabase
    .from("sessions")
    .insert({
      athlete_id: athleteId,
      name: programmeSession.name,
      date,
      type: programmeSession.type,
      hyrox_type: programmeSession.hyrox_type,
      hyrox_config: programmeSession.hyrox_config,
      cardio_type: programmeSession.cardio_type,
      cardio_config: programmeSession.cardio_config,
      recovery_category: programmeSession.recovery_category,
      recovery_format: programmeSession.recovery_format,
      recovery_config: programmeSession.recovery_config,
      session_notes: programmeSession.notes ?? "",
      // source_session_id is a self-referencing FK into sessions(id) -
      // programmeSession.id is a programme_sessions row, a different
      // table/id-space entirely, so it can never satisfy that FK. Left
      // unset here, matching loadTemplateForAthlete's same precedent:
      // programme/template-loaded sessions don't support "update future
      // occurrences" propagation (only copySessionToDates/copySessionsRange
      // do, since those genuinely copy from a real prior sessions row).
    })
    .select()
    .single();
  if (sessErr) throw sessErr;

  const exercises = (programmeSession.exercises ?? []) as PrescribedExercise[];
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
}
