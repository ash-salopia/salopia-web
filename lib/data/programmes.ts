import { createClient } from "@/lib/supabase-browser";
import { getMyOrganisationId } from "@/lib/data/athletes";
import type { Programme, ProgrammeSession, PrescribedExercise, Template } from "@/types";

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
    sort_order: i,
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
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProgrammeSession(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("programme_sessions").delete().eq("id", id);
  if (error) throw error;
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
      // Store the programme session ID so the coach can propagate
      // exercise changes to all future occurrences of this session.
      source_session_id: programmeSession.id,
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
      sort_order: i,
      log: Array.from({ length: e.sets ?? 3 }, () => ({ weight: "", done: false, reps: "" })),
    }));
    const { error: exErr } = await supabase.from("session_exercises").insert(exerciseRows);
    if (exErr) throw exErr;
  }
}
