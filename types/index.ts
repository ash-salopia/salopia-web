// ============================================================
// Core data types, mirroring supabase/migrations/*.sql exactly.
// If you change a column there, update the matching type here.
// ============================================================

export type SessionType = "strength" | "hyrox" | "cardio" | "power_speed";

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
  percent_1rm?: number | null; // 0032 — prescribed load as a % of 1RM
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
  // 0038 — not a DB column: computed server-side from percent_1rm + the
  // athlete's current 1RM (fixed or rolling, per org settings), attached
  // when sessions are fetched for the athlete app. null = %1RM prescribed
  // but no 1RM data exists yet for this exercise.
  computed_target_kg?: number | null;
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
