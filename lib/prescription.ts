// One place that knows every field a coach can prescribe on an exercise,
// for copying exercises between a real session (session_exercises rows),
// a template def and a programme session (both JSONB snapshots).
//
// Before this, each copy path listed its own subset - loading a template
// or programme onto an athlete silently dropped RIR, bodyweight,
// completion-only, bar speed, pause and Power/Speed settings, and "Save
// as programme"/"Save as template" dropped RPE and %1RM too. Add a new
// prescription column here and every path picks it up.
//
// Pure (no Supabase import) so the service-role store code can use it.

import type { PrescribedExercise, SetLog } from "@/types";

// session_exercises columns a coach sets. Deliberately NOT the athlete's
// own data (log, progress, swapped_from, opted_out, athlete notes).
export const PRESCRIPTION_KEYS = [
  "name", "order", "sets", "reps", "time", "rest", "target_load", "tempo", "each_side", "notes", "video_url",
  "distance", "height", "contacts", "intensity_label", "rest_seconds", "complex_group", "complex_group_rest",
  "rpe", "percent_1rm", "alternative_names", "is_bodyweight", "use_percent_1rm", "set_percents", "is_primer",
  "completion_only", "track_velocity", "target_velocity", "track_pause", "target_pause",
  "ps_tracked_metrics", "count_contacts", "use_rir", "set_rir",
] as const;

// Home Programme-only fields (0058) - kept when copying between
// templates/programmes, never written to a real session.
const SNAPSHOT_ONLY_KEYS = ["equipment", "alternatives"] as const;

type Source = Record<string, unknown>;

function pick(src: Source, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = src[k];
    // Skip null/undefined so a NOT NULL column falls back to its default.
    if (v !== undefined && v !== null) out[k] = Array.isArray(v) ? [...v] : v;
  }
  return out;
}

/** Snapshot for a template def / programme session, with a fresh id. */
export function toPrescription(src: Source): PrescribedExercise {
  return {
    ...(pick(src, [...PRESCRIPTION_KEYS, ...SNAPSHOT_ONLY_KEYS]) as unknown as PrescribedExercise),
    id: crypto.randomUUID(),
  };
}

/** A session_exercises insert row from a snapshot (or another session's exercise). */
export function toExerciseRow(src: Source, sessionId: string, sortOrder: number): Record<string, unknown> {
  const sets = typeof src.sets === "number" && src.sets > 0 ? src.sets : 3;
  return {
    name: "",
    order: "",
    reps: "",
    time: "",
    rest: "",
    target_load: "",
    tempo: "2-0-2",
    each_side: false,
    notes: "",
    video_url: "",
    ...pick(src, PRESCRIPTION_KEYS),
    sets,
    session_id: sessionId,
    sort_order: sortOrder,
    log: Array.from({ length: sets }, () => ({ weight: "", done: false, reps: "" })) as SetLog[],
  };
}
