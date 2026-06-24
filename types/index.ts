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
  session_notes: string | null; // Free text block: warm-up, coaching cues, protocols
  // Populated by a join when fetching a session with its exercises
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
  green_threshold: number;
  amber_threshold: number;
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
export type RagStatus = "red" | "amber" | "green";
