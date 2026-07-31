import { createClient } from "@/lib/supabase-browser";
import type { RecoveryCategory, RecoveryConfig, RecoveryFormat, RecoveryPreset, Session, SessionFeedback } from "@/types";

// ------------------------------------------------------------
// Sessions
// ------------------------------------------------------------

// The one fan-out point every Recovery creation path funnels through
// — a single athlete is just athleteIds.length === 1. Deliberately a
// single date (not a date range) for v1: Recovery's whole point on
// the fast end is a coach picking a target and a day in well under 30
// seconds, not configuring a multi-week schedule.
export async function createRecoverySession(params: {
  athleteIds: string[];
  date: string;
  name: string;
  category: RecoveryCategory | null;
  format: RecoveryFormat;
  config: RecoveryConfig;
}): Promise<Session[]> {
  const { athleteIds, date, name, category, format, config } = params;
  if (!athleteIds.length) throw new Error("Pick at least one athlete");

  const supabase = createClient();
  const rows = athleteIds.map((athleteId) => ({
    athlete_id: athleteId,
    type: "recovery" as const,
    date,
    name,
    recovery_category: category,
    recovery_format: format,
    recovery_config: config,
  }));

  const { data, error } = await supabase.from("sessions").insert(rows).select();
  if (error) throw error;
  return data ?? [];
}

export async function updateRecoverySessionConfig(
  sessionId: string,
  patch: { name?: string; recovery_category?: RecoveryCategory | null; recovery_format?: RecoveryFormat; recovery_config?: RecoveryConfig }
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("sessions").update(patch).eq("id", sessionId);
  if (error) throw error;
}

// ------------------------------------------------------------
// Presets — reusable single-session snippets, org-scoped. Applying
// one just copies category/format/config onto a session; since each
// session's recovery_config is its own row, later edits never touch
// the preset (nothing extra needed for that guarantee).
// ------------------------------------------------------------

// Strips athlete-side completion state before a config is saved as
// (or read from) a preset — a preset is a prescription, never a log.
export function stripCompletionState(config: RecoveryConfig): RecoveryConfig {
  return {
    ...config,
    blocks: config.blocks?.map((b) => {
      const { done, ...rest } = b as any;
      if (rest.type === "checklist") {
        rest.items = (rest.items ?? []).map((i: any) => {
          const { done: _d, ...itemRest } = i;
          return itemRest;
        });
      }
      if (rest.type === "feedback") delete rest.response;
      return rest;
    }),
    checklist_items: config.checklist_items?.map((i) => {
      const { done, ...rest } = i;
      return rest;
    }),
  };
}

export async function listRecoveryPresets(): Promise<RecoveryPreset[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("recovery_presets")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function saveRecoveryPreset(params: {
  name: string;
  category: RecoveryCategory | null;
  format: RecoveryFormat;
  config: RecoveryConfig;
}): Promise<RecoveryPreset> {
  const supabase = createClient();
  const { data: coach, error: coachErr } = await supabase.from("coaches").select("organisation_id").single();
  if (coachErr) throw coachErr;

  const { data, error } = await supabase
    .from("recovery_presets")
    .insert({
      organisation_id: coach.organisation_id,
      name: params.name,
      category: params.category,
      format: params.format,
      config: stripCompletionState(params.config),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRecoveryPreset(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("recovery_presets").delete().eq("id", id);
  if (error) throw error;
}

// ------------------------------------------------------------
// End-of-session feedback (coach-side read)
// ------------------------------------------------------------

export async function getSessionFeedback(sessionId: string): Promise<SessionFeedback | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("session_feedback")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
