import { createClient } from "@/lib/supabase-browser";
import { getMyOrganisationId } from "@/lib/data/athletes";
import { datesInRange, dayOfWeekUTC } from "@/lib/date-utils";
import type { Template, TemplateDef, PrescribedExercise, Session, SessionType } from "@/types";

export async function listTemplates(): Promise<Template[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("templates")
    .select("*, template_defs(*)")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((t) => ({
    ...t,
    defs: (t.template_defs ?? []).sort((a: TemplateDef, b: TemplateDef) => a.sort_order - b.sort_order),
  }));
}

export async function getTemplate(id: string): Promise<Template | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("templates")
    .select("*, template_defs(*)")
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return {
    ...data,
    defs: (data.template_defs ?? []).sort((a: TemplateDef, b: TemplateDef) => a.sort_order - b.sort_order),
  };
}

export async function createTemplate(): Promise<Template> {
  const supabase = createClient();
  const organisation_id = await getMyOrganisationId();

  const { data: template, error: tError } = await supabase
    .from("templates")
    .insert({ organisation_id, name: "New template" })
    .select()
    .single();
  if (tError) throw tError;

  const { data: def, error: dError } = await supabase
    .from("template_defs")
    .insert({ template_id: template.id, name: "Session 1", type: "strength", exercises: [] })
    .select()
    .single();
  if (dError) throw dError;

  return { ...template, defs: [def] };
}

export async function updateTemplate(id: string, patch: { name: string }): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("templates").update(patch).eq("id", id);
  if (error) throw error;
}

// ------------------------------------------------------------
// Home Programmes (0058) — publish/unpublish a template as a public,
// no-login link at /g/<share_code>. The org's subscription status is
// checked live in the public route itself (lib/data/home-programme-
// public.ts), not stored here, so revoking a link never needs an
// unpublish action on every template if a coach's billing lapses.
// ------------------------------------------------------------

const SHARE_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I — avoids misreads on a printed handout
function generateShareCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += SHARE_CODE_ALPHABET[Math.floor(Math.random() * SHARE_CODE_ALPHABET.length)];
  }
  return code;
}

// Retries on the (astronomically unlikely) chance of a collision with
// an existing code — unique constraint on templates.share_code makes
// that safe to detect via the insert's own error rather than a
// separate existence check.
export async function publishTemplate(id: string, expiresInDays: number | null): Promise<{ share_code: string; share_expires_at: string | null }> {
  const supabase = createClient();
  const share_expires_at = expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString() : null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const share_code = generateShareCode();
    const { error } = await supabase.from("templates").update({ share_code, share_expires_at }).eq("id", id);
    if (!error) return { share_code, share_expires_at };
    if (!error.message.includes("duplicate")) throw error;
  }
  throw new Error("Could not generate a unique share code — try again.");
}

export async function unpublishTemplate(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("templates").update({ share_code: null, share_expires_at: null }).eq("id", id);
  if (error) throw error;
}

export async function deleteTemplate(id: string): Promise<void> {
  const supabase = createClient();
  // template_defs cascade-delete with the template.
  const { error } = await supabase.from("templates").delete().eq("id", id);
  if (error) throw error;
}

export async function addTemplateDef(templateId: string, sortOrder: number): Promise<TemplateDef> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("template_defs")
    .insert({
      template_id: templateId,
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

export async function updateTemplateDef(
  id: string,
  patch: Partial<Pick<TemplateDef, "name" | "type" | "days" | "exercises" | "hyrox_type" | "hyrox_config" | "cardio_type" | "cardio_config" | "recovery_category" | "recovery_format" | "recovery_config">>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("template_defs").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteTemplateDef(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("template_defs").delete().eq("id", id);
  if (error) throw error;
}

// ------------------------------------------------------------
// Save an existing real session as a reusable template — the
// "Save as Template" entry point, alongside building one from
// scratch via createTemplate above.
// ------------------------------------------------------------
export async function saveSessionAsTemplate(session: Session, templateName: string): Promise<Template> {
  const supabase = createClient();
  const organisation_id = await getMyOrganisationId();

  const { data: template, error: tError } = await supabase
    .from("templates")
    .insert({ organisation_id, name: templateName })
    .select()
    .single();
  if (tError) throw tError;

  const exercises: PrescribedExercise[] = (session.exercises ?? []).map((e) => ({
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
  }));

  const { data: def, error: dError } = await supabase
    .from("template_defs")
    .insert({
      template_id: template.id,
      name: session.name,
      type: session.type,
      exercises,
      hyrox_type: session.hyrox_type,
      hyrox_config: session.hyrox_config,
      cardio_type: session.cardio_type,
      cardio_config: session.cardio_config,
      recovery_category: session.recovery_category,
      recovery_format: session.recovery_format,
      recovery_config: session.recovery_config,
      notes: session.session_notes ?? "",
    })
    .select()
    .single();
  if (dError) throw dError;

  return { ...template, defs: [def] };
}

// ------------------------------------------------------------
// Load a template onto an athlete's calendar — generates real,
// dated sessions for every def in the template, repeated across
// every matching weekday within the date range. Ported from the
// prototype's loadTemplate/makeSessionFromDef, including the
// dedup-by-date+def safety check and the 90-session cap.
// ------------------------------------------------------------
export interface LoadTemplateResult {
  sessionsCreated: number;
}

export async function loadTemplateForAthlete(
  templateId: string,
  athleteId: string,
  start: string,
  end: string
): Promise<LoadTemplateResult> {
  const template = await getTemplate(templateId);
  if (!template) throw new Error("Template not found");

  const range = datesInRange(start, end);
  const seen = new Set<string>();
  interface PendingSession {
    date: string;
    name: string;
    type: SessionType;
    exercises: PrescribedExercise[];
    hyrox_type: string | null;
    hyrox_config: unknown;
    cardio_type: string | null;
    cardio_config: unknown;
    recovery_category: string | null;
    recovery_format: string | null;
    recovery_config: unknown;
    notes: string;
  }
  const pending: PendingSession[] = [];

  for (const def of template.defs ?? []) {
    const defDays = (def.days ?? []).map(Number);
    const dates = defDays.length ? range.filter((d) => defDays.includes(dayOfWeekUTC(d))) : [start];
    for (const date of dates) {
      const key = `${date}_${def.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pending.push({
        date,
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
      });
    }
  }

  if (!pending.length) throw new Error("No dates matched");
  if (pending.length > 90) {
    throw new Error(`Too many sessions (${pending.length}) — narrow the date range to max 13 weeks.`);
  }

  const supabase = createClient();
  const sessionRows = pending.map((p) => ({
    athlete_id: athleteId,
    name: p.name,
    date: p.date,
    type: p.type,
    hyrox_type: p.hyrox_type,
    hyrox_config: p.hyrox_config,
    cardio_type: p.cardio_type,
    cardio_config: p.cardio_config,
    recovery_category: p.recovery_category,
    recovery_format: p.recovery_format,
    recovery_config: p.recovery_config,
    session_notes: p.notes,
  }));
  const { data: createdSessions, error: sessErr } = await supabase
    .from("sessions")
    .insert(sessionRows)
    .select();
  if (sessErr) throw sessErr;

  const exerciseRows = createdSessions.flatMap((sess, i) =>
    pending[i].exercises.map((e, sortIdx) => ({
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
      rpe: e.rpe ?? null,
      percent_1rm: e.percent_1rm ?? null,
      use_percent_1rm: e.use_percent_1rm ?? false,
      set_percents: e.set_percents ?? [],
      sort_order: sortIdx,
      log: Array.from({ length: e.sets ?? 3 }, () => ({ weight: "", done: false, reps: "" })),
    }))
  );
  if (exerciseRows.length) {
    const { error: exErr } = await supabase.from("session_exercises").insert(exerciseRows);
    if (exErr) throw exErr;
  }

  return { sessionsCreated: createdSessions.length };
}
