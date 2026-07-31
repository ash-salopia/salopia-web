// ============================================================
// Core data types, mirroring supabase/migrations/*.sql exactly.
// If you change a column there, update the matching type here.
// ============================================================

export type SessionType = "strength" | "hyrox" | "cardio" | "power_speed" | "recovery";

export type HyroxType = "fixed" | "cycling" | "emom" | "interval" | "circuit";

// ------------------------------------------------------------
// Organisations & coaches
// ------------------------------------------------------------
export interface Organisation {
  id: string;
  name: string;
  plan: string;
  seat_limit: number | null;
  created_at: string;
}

export interface Coach {
  id: string; // matches auth.users.id
  organisation_id: string;
  name: string;
  role: "owner" | "coach";
  avatar_url: string | null; // 0042
  created_at: string;
}

// ------------------------------------------------------------
// Athletes
// ------------------------------------------------------------
export interface Athlete {
  id: string;
  organisation_id: string;
  name: string;
  group: string;
  share_token: string;
  archived: boolean;
  in_live_group: boolean;
  sex: "male" | "female" | null;
  date_of_birth: string | null; // YYYY-MM-DD
  bodyweight_kg: number | null; // 0028 — default for test sessions / IMTP relative strength
  avatar_url: string | null; // 0042
  created_at: string;
}

// ------------------------------------------------------------
// Exercise library
// ------------------------------------------------------------
export interface LibraryEntry {
  id: string;
  organisation_id: string;
  name: string;
  types: string[];
  video_url: string;
  sets: string;
  reps: string;
  time: string;
  rest: string;
  target_load: string;
  tempo: string;
  notes: string;
  created_at: string;
}

// ------------------------------------------------------------
// Per-set logged data, stored as JSONB on session_exercises.log
// ------------------------------------------------------------
export interface SetLog {
  weight: string;
  reps: string;
  done: boolean;
  time?: string; // 0041 — actual time achieved for a time-mode bodyweight set (e.g. a plank hold), separate from the prescribed ex.time
}

// ------------------------------------------------------------
// Exercises (within a session, a template def, or a programme session)
// ------------------------------------------------------------
export interface ExerciseBase {
  name: string;
  order: string;
  sets: number;
  reps: string;
  time: string;
  rest: string;
  target_load: string;
  tempo: string;
  each_side: boolean;
  notes: string;
  video_url: string;
  rpe?: number | null; // 0032 — prescribed RPE (1-10)
  percent_1rm?: number | null; // 0032 — DEPRECATED, one value for the whole exercise. Superseded by use_percent_1rm + set_percents (0045); kept only so old data still reads back.
  use_percent_1rm?: boolean; // 0045 — when true, set_percents[i] prescribes each set's own %1RM (a ramping scheme, e.g. 70/80/90%), rather than one uniform load for the exercise
  set_percents?: string[]; // 0045 — per-set %1RM prescriptions, index-aligned with `sets` (and, for a real session, with `log`)
  is_bodyweight?: boolean; // 0041 — coach-set: this exercise has no load, athlete logs reps or time only
}

export interface SessionExercise extends ExerciseBase {
  id: string;
  session_id: string;
  session_notes: string;
  progress: "" | "yes" | "no";
  progress_reminder: boolean;
  sort_order: number;
  log: SetLog[];
  created_at: string;
  alternative_names: string[]; // 0035 — coach-approved swap options for this exercise instance
  swapped_from: string | null; // 0035 — original prescribed name, set when the athlete swaps
  opted_out: boolean;          // 0035 — athlete skipped this exercise, no replacement
  athlete_exercise_notes: string; // 0040 — athlete's own note on this exercise, separate from the coach's `notes` and session-level athlete_notes
  // 0045 — not a DB column: per-set calculated %1RM targets (kg),
  // attached when sessions are fetched for the athlete app. Shown as
  // a greyed suggestion in the load box, never written to log[i].weight
  // until the athlete actually confirms it (types over it, or taps
  // done with the box still empty, which captures this value).
  computed_targets?: (number | null)[];
}

// A lighter-weight exercise shape used inside templates/programmes,
// where there's no live per-set log yet (it gets created fresh when
// the exercise is actually loaded onto a real dated session).
export interface PrescribedExercise extends ExerciseBase {
  id: string;
}

// ------------------------------------------------------------
// Hyrox / Cardio config shapes (stored as JSONB)
// ------------------------------------------------------------
export interface HyroxFixedConfig {
  steps: { exercise: string; target: string; actual: string }[];
}
export interface HyroxCyclingConfig {
  exercises: { exercise: string; reps: string }[];
  workSec: number;
  restSec: number;
  rounds: number;
  cycles: number;
  cyclRestSec: number;
}
export interface HyroxEMOMConfig {
  mins: number;
  slots: { minute: string; exercise: string; reps: string }[];
}
export interface HyroxIntervalConfig {
  exercise: string;
  load: string;
  sets: number;
  workSec: number;
  restSec: number;
  results: string[];
}
export interface HyroxCircuitConfig {
  isAmrap: boolean;
  rounds: number;
  timeCap: number;
  restSec: number;
  exercises: { exercise: string; reps: string }[];
  roundsDone: boolean[];
  amrapResult: string;
}
export type HyroxConfig =
  | HyroxFixedConfig
  | HyroxCyclingConfig
  | HyroxEMOMConfig
  | HyroxIntervalConfig
  | HyroxCircuitConfig
  | Record<string, never>;

export interface CardioConfig {
  // Mirrors the prototype's CardioConfig shape — kept loose/JSONB since
  // it's read and written as one unit, same reasoning as hyrox_config.
  [key: string]: unknown;
}

// ------------------------------------------------------------
// Recovery config shape (stored as JSONB in recovery_config).
// Deliberately one column for prescription AND athlete-side
// completion state, same reasoning as hyrox_config/HyroxCircuitConfig
// (which already mixes roundsDone/amrapResult in with the rest).
// ------------------------------------------------------------
export type RecoveryFormat = "quick" | "guided" | "checklist";

export type RecoveryCategory =
  | "mobility"
  | "soft_tissue" // foam rolling / soft-tissue work
  | "active_recovery"
  | "breathing_relaxation"
  | "sleep"
  | "nutrition_hydration"
  | "sauna_cold_exposure"
  | "post_event"
  | "travel"
  | "rest_day"
  | "rehab_prehab"
  | "custom";

export type RecoveryIntensity = "very_low" | "low" | "moderate" | "high";

export type RecoveryBlockType = "instruction" | "exercise" | "timed" | "checklist" | "media" | "feedback";

export interface RecoveryChecklistItem {
  id: string;
  label: string;
  category: string; // free text, e.g. "Hydration", "Sleep" — not the same enum as RecoveryCategory (a checklist can mix several)
  target?: string; // e.g. "2L", "8hrs", "10 min walk"
  done?: boolean; // athlete-side completion state
}

export interface RecoveryBlockBase {
  id: string;
  type: RecoveryBlockType;
  title?: string;
  done?: boolean; // athlete-side completion state, all block types except checklist (which tracks per-item)
}
export interface RecoveryInstructionBlock extends RecoveryBlockBase {
  type: "instruction";
  body: string;
}
export interface RecoveryExerciseBlock extends RecoveryBlockBase {
  type: "exercise";
  name: string;
  video_url: string;
  duration_or_reps: string; // free text, e.g. "10 reps" or "30s" — deliberately not split into separate sets/reps/time fields the way strength is, since a recovery drill's prescription doesn't need that structure
  sets: number;
  side: "both" | "left" | "right" | "n/a";
  rest: string;
  notes: string; // coach notes
  equipment: string;
  required: boolean; // vs optional
}
export interface RecoveryTimedBlock extends RecoveryBlockBase {
  type: "timed";
  duration_seconds: number;
  instructions: string;
}
export interface RecoveryChecklistBlock extends RecoveryBlockBase {
  type: "checklist";
  items: RecoveryChecklistItem[];
}
export interface RecoveryMediaBlock extends RecoveryBlockBase {
  type: "media";
  media_url: string;
  caption: string;
}
export interface RecoveryFeedbackBlock extends RecoveryBlockBase {
  type: "feedback";
  prompt: string;
}
export type RecoveryBlock =
  | RecoveryInstructionBlock
  | RecoveryExerciseBlock
  | RecoveryTimedBlock
  | RecoveryChecklistBlock
  | RecoveryMediaBlock
  | RecoveryFeedbackBlock;

export interface RecoveryConfig {
  // "Quick Prescription" fields — also shown as header info for the
  // guided/checklist formats regardless, so a coach can add a short
  // instruction/duration/intensity even on top of a detailed routine.
  instructions?: string;
  duration_minutes?: number | null;
  intensity?: RecoveryIntensity | null;
  media_url?: string;
  request_feedback?: boolean; // whether to prompt the athlete for end-of-session feedback
  custom_category_label?: string; // shown when recovery_category === "custom"
  // Guided Recovery Routine
  blocks?: RecoveryBlock[];
  // Recovery Checklist
  checklist_items?: RecoveryChecklistItem[];
}

// ------------------------------------------------------------
// Sessions (real, dated sessions on an athlete's calendar)
// ------------------------------------------------------------
export interface Session {
  id: string;
  athlete_id: string;
  name: string;
  date: string; // YYYY-MM-DD
  type: SessionType;
  hyrox_type: HyroxType | null;
  hyrox_config: HyroxConfig | null;
  cardio_type: string | null;
  cardio_config: CardioConfig | null;
  created_at: string;
  updated_at: string;
  session_notes: string | null;
  athlete_notes: string | null; // 0033 — athlete's own note on the session, separate from the coach's session_notes
  athlete_notes_acknowledged: boolean; // 0036 — coach has dismissed this note off the dashboard
  source_session_id: string | null; // 0029 — links copies back to their original for future-update propagation
  rpe: number | null;              // 0031 — post-session RPE (1-10) logged by athlete
  rpe_logged_at: string | null;
  session_source: "programme" | "library"; // 0034 — 'library' = athlete-started informal session, excluded from calendar + Training Load Report
  recovery_category: RecoveryCategory | null; // 0046
  recovery_format: RecoveryFormat | null; // 0046
  recovery_config: RecoveryConfig; // 0046
  exercises?: SessionExercise[];
}

// ------------------------------------------------------------
// Templates (Template Library)
// ------------------------------------------------------------
export interface Template {
  id: string;
  organisation_id: string;
  name: string;
  created_at: string;
  defs?: TemplateDef[];
}

export interface TemplateDef {
  id: string;
  template_id: string;
  name: string;
  type: SessionType;
  days: number[]; // 0=Sun..6=Sat
  exercises: PrescribedExercise[]; // stored as JSONB directly on this row
  hyrox_type: HyroxType | null;
  hyrox_config: HyroxConfig | null;
  cardio_type: string | null;
  cardio_config: CardioConfig | null;
  recovery_category: RecoveryCategory | null; // 0046
  recovery_format: RecoveryFormat | null; // 0046
  recovery_config: RecoveryConfig; // 0046
  sort_order: number;
  created_at: string;
}

// 0034 — Session Library: a coach grants an athlete access to a
// template, which they can then browse and log informally via their
// own "Library" tab, separate from their assigned programme.
export interface AthleteTemplateAccess {
  id: string;
  athlete_id: string;
  template_id: string;
  organisation_id: string;
  granted_by: string; // coaches.id
  granted_at: string;
}

// 0038 — coach-set fixed 1RM per athlete + exercise, used to compute
// %1RM targets when the org's one_rm_source setting is "fixed".
export interface AthleteOneRM {
  id: string;
  athlete_id: string;
  exercise_name: string;
  one_rm_kg: number;
  updated_at: string;
}

// ------------------------------------------------------------
// Programmes (Prog Library)
// ------------------------------------------------------------
export interface Programme {
  id: string;
  organisation_id: string;
  name: string;
  description: string;
  created_at: string;
  sessions?: ProgrammeSession[];
  assigned_to?: string[]; // athlete ids, derived from programme_assignments
}

export interface ProgrammeSession {
  id: string;
  programme_id: string;
  name: string;
  type: SessionType;
  exercises: PrescribedExercise[]; // snapshot, stored as JSONB directly here
  hyrox_type: HyroxType | null;
  hyrox_config: HyroxConfig | null;
  cardio_type: string | null;
  cardio_config: CardioConfig | null;
  recovery_category: RecoveryCategory | null; // 0046
  recovery_format: RecoveryFormat | null; // 0046
  recovery_config: RecoveryConfig; // 0046
  sort_order: number;
}

export interface ProgrammeAssignment {
  programme_id: string;
  athlete_id: string;
  assigned_at: string;
}

// ------------------------------------------------------------
// Testing system (youth athlete physical testing — see migration
// 0005_testing_system.sql for the full design rationale, ported
// from the proven Python/ReportLab tool's data model)
// ------------------------------------------------------------
export interface TestBattery {
  id: string;
  organisation_id: string;
  name: string;
  description: string;
  created_at: string;
  metrics?: TestMetric[]; // via test_battery_metrics join
}

export interface TestMetric {
  id: string;
  organisation_id: string;
  name: string;
  unit: string;
  better_direction: "higher" | "lower";
  requires_bodyweight: boolean;
  is_bilateral: boolean;
  screening_only: boolean; // e.g. Single Leg CMJ — never rated, asymmetry screen only
  what_it_measures: string;
  why_it_matters: string;
  commentary_excellent: string;
  commentary_good: string;
  commentary_average: string;
  commentary_needs_work: string;
  notes: string;
  created_at: string;
}

export interface TestBatteryMetric {
  test_battery_id: string;
  test_metric_id: string;
  sort_order: number;
}

export interface TestBenchmark {
  id: string;
  test_metric_id: string;
  benchmark_type: "elite_youth" | "general_population";
  sex: "male" | "female" | null;
  age_min: number | null;
  age_max: number | null;
  // 4-tier model: a result worse than average_threshold is "needs_work" by
  // elimination — there is no separate needs_work_threshold to set.
  average_threshold: number;
  good_threshold: number;
  excellent_threshold: number;
  created_at: string;
}

export interface TestSession {
  id: string;
  athlete_id: string;
  test_battery_id: string | null;
  date: string; // YYYY-MM-DD
  bodyweight_kg: number | null;
  notes: string;
  created_at: string;
  results?: TestResult[];
}

export interface TestResult {
  id: string;
  test_session_id: string;
  test_metric_id: string;
  side: "left" | "right" | null;
  trial_number: number;
  value: number;
  created_at: string;
}

export interface Report {
  id: string;
  athlete_id: string;
  report_type: "testing" | "training_load";
  range_start: string | null;
  range_end: string | null;
  generated_at: string;
}

// RAG status derived from comparing a value against a TestBenchmark.
// Not a database type — computed client-side / server-side at read time.
// 4-tier (not 3) — matches the original tool's "Exceptional collapses into
// Excellent" decision: there is no 5th tier, both scales share these 4.
export type RagStatus = "excellent" | "good" | "average" | "needs_work";

// ------------------------------------------------------------
// Recovery presets & end-of-session feedback (0046)
// ------------------------------------------------------------

// A reusable, org-scoped Recovery session snippet — deliberately not
// built on templates/template_defs (see 0046 migration comment).
// Applying a preset just copies category/format/config onto a new or
// existing session; editing that session afterward never touches the
// preset, since each session's recovery_config is its own row.
export interface RecoveryPreset {
  id: string;
  organisation_id: string;
  name: string;
  category: RecoveryCategory | null;
  format: RecoveryFormat;
  config: RecoveryConfig;
  created_at: string;
}

// End-of-session athlete feedback, one row per session, only ever
// created when the coach opted in via recovery_config.request_feedback.
export interface SessionFeedback {
  id: string;
  session_id: string;
  athlete_id: string;
  completion: boolean | null;
  recovery_score: number | null; // 1-5
  soreness: number | null; // 1-5
  fatigue: number | null; // 1-5
  pain_notes: string;
  notes: string;
  created_at: string;
}
