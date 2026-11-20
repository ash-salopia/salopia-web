import { toExerciseRow, toPrescription } from "@/lib/prescription";
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

export async function createProgramme(opts: { name?: string; weeks?: number } = {}): Promise<Programme> {
  const supabase = createClient();
  const organisation_id = await getMyOrganisationId();
  const row = { organisation_id, name: opts.name?.trim() || "New Programme", description: "" };
  let { data, error } = await supabase
    .from("programmes")
    .insert({ ...row, ...(opts.weeks ? { weeks: opts.weeks } : {}) })
    .select()
    .single();
  // 0132 not run yet - create it without a set length.
  if (error && opts.weeks && /weeks/.test(error.message)) {
    ({ data, error } = await supabase.from("programmes").insert(row).select().single());
  }
  if (error) throw error;
  return { ...data, sessions: [], assigned_to: [] };
}

export async function updateProgramme(
  id: string,
  patch: Partial<Pick<Programme, "name" | "description" | "weeks">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("programmes").update(patch).eq("id", id);
  if (error && "weeks" in patch && /weeks/.test(error.message)) {
    throw new Error("Changing the number of weeks needs the latest database update (0132) - ask your admin to run it.");
  }
  if (error) throw error;
}

export async function deleteProgramme(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("programmes").delete().eq("id", id);
  if (error) {
    // 0124: store listings and athletes' programme libraries keep their
    // programme (on delete restrict) so buyers never lose what they paid for.
    if (error.code === "23503") {
      throw new Error("This programme is listed in your Online Store or owned by athletes who bought it, so it can't be deleted. Hide or remove it from the store instead.");
    }
    throw error;
  }
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
    exercises: (s.exercises ?? []).map((e) => toPrescription(e as unknown as Record<string, unknown>)),
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
  spacingDays?: number,
  // Week-grid programmes (0132): day_offset 0 is Monday of week 1, so
  // startDate is that Monday and every session keeps its own weekday -
  // even when week 1 starts later than Monday.
  fromWeekStart = false
): { session: ProgrammeSession; date: string }[] {
  const ordered = [...sessions].sort((a, b) => a.day_offset - b.day_offset || a.sort_order - b.sort_order);
  if (spacingDays != null) {
    return ordered.map((session, i) => ({ session, date: addDaysISO(startDate, i * spacingDays) }));
  }
  if (fromWeekStart) {
    return ordered.map((session) => ({ session, date: addDaysISO(startDate, session.day_offset) }));
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
  patch: Partial<Pick<ProgrammeSession, "name" | "type" | "exercises" | "hyrox_type" | "hyrox_config" | "cardio_type" | "cardio_config" | "recovery_category" | "recovery_format" | "recovery_config" | "notes" | "day_offset" | "sort_order">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("programme_sessions").update(patch).eq("id", id);
  if (error) throw error;
}

// ── Programme builder (0132) - bulk writes for the week grid ──────────────

/** Inserts many sessions at once (adding a template across weeks, copying weeks). */
export async function insertProgrammeSessions(
  programmeId: string,
  drafts: Omit<ProgrammeSession, "id" | "programme_id">[]
): Promise<ProgrammeSession[]> {
  if (!drafts.length) return [];
  const supabase = createClient();
  const out: ProgrammeSession[] = [];
  // Chunked so a 52-week copy stays well under request size limits.
  for (let i = 0; i < drafts.length; i += 200) {
    const { data, error } = await supabase
      .from("programme_sessions")
      .insert(drafts.slice(i, i + 200).map((d) => ({ ...d, programme_id: programmeId })))
      .select();
    if (error) throw error;
    out.push(...((data ?? []) as ProgrammeSession[]));
  }
  return out;
}

/** Saves whole sessions back (progression rules, bulk edits). */
export async function saveProgrammeSessions(sessions: ProgrammeSession[]): Promise<void> {
  if (!sessions.length) return;
  const supabase = createClient();
  for (let i = 0; i < sessions.length; i += 200) {
    const { error } = await supabase.from("programme_sessions").upsert(sessions.slice(i, i + 200), { onConflict: "id" });
    if (error) throw error;
  }
}

export async function deleteProgrammeSessions(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const supabase = createClient();
  const { error } = await supabase.from("programme_sessions").delete().in("id", ids);
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
    const exerciseRows = exercises.map((e, i) => toExerciseRow(e as unknown as Record<string, unknown>, session.id, i));
    const { error: exErr } = await supabase.from("session_exercises").insert(exerciseRows);
    if (exErr) throw exErr;
  }
}

// Loads many programme sessions onto an athlete's calendar in two
// requests (all sessions, then all their exercises) instead of two per
// session - a 12-week block is ~50 sessions. If the exercises fail to
// save, the sessions just created are removed again, so a failed load
// never leaves an athlete with half a programme.
export async function loadProgrammeSessionsForAthlete(
  rows: { session: ProgrammeSession; date: string }[],
  athleteId: string
): Promise<number> {
  if (!rows.length) return 0;
  const supabase = createClient();
  const created: string[] = [];
  try {
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { data, error } = await supabase
        .from("sessions")
        .insert(
          chunk.map(({ session: p, date }) => ({
            athlete_id: athleteId,
            name: p.name,
            date,
            type: p.type,
            hyrox_type: p.hyrox_type,
            hyrox_config: p.hyrox_config,
            cardio_type: p.cardio_type,
            cardio_config: p.cardio_config,
            recovery_category: p.recovery_category,
            recovery_format: p.recovery_format,
            recovery_config: p.recovery_config,
            session_notes: p.notes ?? "",
            // No source_session_id - see loadProgrammeSessionForAthlete.
          }))
        )
        .select("id");
      if (error) throw error;
      const ids = (data ?? []).map((d: { id: string }) => d.id);
      if (ids.length !== chunk.length) throw new Error("Some sessions didn't save - please try again.");
      created.push(...ids);
      const exerciseRows = chunk.flatMap(({ session: p }, j) =>
        ((p.exercises ?? []) as PrescribedExercise[]).map((e, k) => toExerciseRow(e as unknown as Record<string, unknown>, ids[j], k))
      );
      for (let k = 0; k < exerciseRows.length; k += 500) {
        const { error: exErr } = await supabase.from("session_exercises").insert(exerciseRows.slice(k, k + 500));
        if (exErr) throw exErr;
      }
    }
    return created.length;
  } catch (e) {
    if (created.length) await supabase.from("sessions").delete().in("id", created);
    throw e;
  }
}
