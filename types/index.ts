// ============================================================
// Core data types, mirroring supabase/migrations/*.sql exactly.
// If you change a column there, update the matching type here.
// ============================================================

export type SessionType = "strength" | "hyrox" | "cardio" | "power_speed" | "recovery" | "sport";

// 0088 — return-to-play / availability status per athlete
export type RtpStatus = "available" | "modified" | "rehab" | "return_to_play" | "unavailable";

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
  max_hr: number | null; // 0086 — max heart rate (bpm), drives HR training zones
  resting_hr: number | null; // 0086 — resting HR (bpm); when set, HR zones use Karvonen / HR-reserve
  mas_kmh: number | null; // 0086 — Maximal Aerobic Speed (km/h), drives per-zone pace/speed targets
  avatar_url: string | null; // 0042
  hide_pbs_from_feed: boolean; // 0047 — athlete privacy pref, feed-only
  feed_first_name_only: boolean; // 0047 — athlete privacy pref, feed-only
  hyrox_enabled: boolean; // 0025 — per-athlete override of the org-level Hyrox toggle (lib/data/settings.ts); org setting still wins if it's off
  pb_enabled: boolean; // 0073 — per-athlete override of the org-level Personal Bests toggle (lib/data/settings.ts); org setting still wins if it's off. Distinct from hide_pbs_from_feed (0047), which only hides an already-tracked PB from the community feed — this instead turns detection/tracking off entirely.
  pb_hidden: string[]; // 0092 — lower-cased exercise names a coach has hidden from the PB list (covers PBs re-derived from logged sessions, which deleting a personal_bests row can't touch)
  challenges_enabled: boolean; // 0074 — per-athlete override of the org-level Challenges toggle (lib/data/settings.ts); org setting still wins if it's off
  squad_comparison_enabled: boolean; // 0075 — per-athlete override of the org-level "Compare to squad" report toggle (lib/data/settings.ts); org setting still wins if it's off
  rtp_status: RtpStatus; // 0088 — availability / return-to-play status; 'available' is the default for everyone
  rtp_note: string | null; // 0088 — coach/physio-only context for the current status (e.g. "L hamstring strain grade 2, running progression")
  rtp_athlete_note: string | null; // 0091 — athlete-facing "what you can / can't do" message, shown in their app
  rtp_since: string | null; // 0088 — YYYY-MM-DD the current status started
  monitor_wellness: boolean; // 0089 — force the pain/wellness check-in questions on even when rtp_status is 'available'
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
  is_bodyweight: boolean; // 0048 — default applied when this entry is loaded into a session
  each_side: boolean; // 0048 — default applied when this entry is loaded into a session
  use_percent_1rm: boolean; // 0048 — default applied when this entry is loaded into a session
  default_tracked_metrics: import("@/lib/cardio-metrics").MetricKey[]; // 0070 — Cardio/Hyrox only: default applied when this entry is loaded into a hyrox_config/cardio_config exercise
  equipment: import("@/lib/cardio-metrics").EquipmentType | null; // 0071 — Cardio/Hyrox only: restricts which metrics this exercise can track (see EQUIPMENT_META); null = unrestricted
  default_distance_unit: import("@/lib/cardio-metrics").DistanceUnit | null; // 0075 — Cardio/Hyrox only: starting unit for this exercise's distance box(es) when loaded into a session, e.g. an Erg defaults to metres, a Treadmill to km
  default_key_metrics: import("@/lib/cardio-metrics").MetricKey[]; // 0076 — Cardio/Hyrox only: up to 5 metrics shown by default (rest behind "More") when this entry is loaded into a session; independent of default_tracked_metrics
  default_measurement_type: string | null; // 0094 — Power/Speed only: pre-set per-rep measurement ("time_s"|"height_cm"|"distance_m"|"rsi"|"power_w"|"velocity_ms"|"none"), applied when this entry is loaded into a Power/Speed session; null = fall back to the movement quality's default
}

// ------------------------------------------------------------
// Per-set logged data, stored as JSONB on session_exercises.log
// ------------------------------------------------------------
export interface SetLog {
  weight: string;
  reps: string;
  done: boolean;
  time?: string; // 0041 — actual time achieved for a time-mode bodyweight set (e.g. a plank hold), separate from the prescribed ex.time
  velocity?: string; // bar speed (m/s) actually achieved on this set — only shown/entered when the exercise has track_velocity on
  pause?: string; // 0090 — pause/hold in seconds held on this set — only shown/entered when the exercise has track_pause on
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
  completion_only?: boolean; // coach-set: nothing to track for this exercise (e.g. a mobility drill) — hides weight/reps/time entirely, logging is just a done tick per set
  track_velocity?: boolean; // coach-set: show a bar speed (m/s) box per set, in addition to whatever else this exercise logs
  target_velocity?: string; // prescribed target bar speed (m/s), shown alongside the logged velocity — only meaningful when track_velocity is on
  track_pause?: boolean; // 0090 — coach-set: show a "pause (s)" box per set, for paused-tempo lifts. Feeds the "Best:" progression signal
  target_pause?: string; // 0090 — prescribed pause/hold in seconds, shown alongside the logged pause — only meaningful when track_pause is on
  // 0058 — Home Programmes only (see templates.share_code). `equipment`
  // tags what this prescription needs (e.g. "Dumbbells", "" = none/
  // bodyweight); `alternatives` are coach-authored equipment swaps the
  // public /g/<code> view offers instead when a viewer picks equipment
  // that doesn't match. Unused/ignored everywhere else (real sessions,
  // programmes) — never surfaced in the athlete-link app.
  equipment?: string;
  alternatives?: ExerciseAlternative[];
}

// 0058 — one coach-authored equipment variant of a Home Programme
// exercise. Deliberately a small, separate shape rather than a nested
// ExerciseBase — a home-programme alternative only ever needs enough
// to display and re-prescribe, never the live-logging fields
// (rpe/percent_1rm/tempo/etc.) that only mean something for a real,
// trackable session.
export interface ExerciseAlternative {
  name: string;
  equipment: string;
  sets?: number;
  reps?: string;
  rest?: string;
  notes?: string;
  video_url?: string;
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
  is_primer?: boolean; // 0053 — coach-set: a deliberately lighter primer/activation effort, excluded from reports and the rolling %1RM estimate. Only on real dated sessions, not ExerciseBase, so it never gets prescribed ahead of time via templates/programmes
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
// tracked_metrics (MetricKey[], see lib/cardio-metrics.ts) lives on
// every Hyrox/Cardio config below - which metric boxes actually show
// up for logging, coach-toggled once per session and applied to every
// step/round/rep in it. Structured `metrics`/`metrics[]` replaced the
// old free-text actual/result/results[]/amrapResult fields (0070) -
// existing sessions saved before that keep their old string data
// untouched (never migrated), this only applies going forward.
export interface HyroxFixedConfig {
  steps: {
    exercise: string; target: string;
    metrics?: import("@/lib/cardio-metrics").MetricValues;
    tracked_metrics?: import("@/lib/cardio-metrics").MetricKey[]; // per-exercise override, defaults from LibraryEntry.default_tracked_metrics when picked from the library (0070)
    equipment?: import("@/lib/cardio-metrics").EquipmentType; // copied from LibraryEntry.equipment when picked - restricts tracked_metrics to that equipment's set (0071)
    default_distance_unit?: import("@/lib/cardio-metrics").DistanceUnit; // coach-set starting unit for this step's distance box (0074)
    key_metrics?: import("@/lib/cardio-metrics").MetricKey[]; // per-exercise override, defaults from LibraryEntry.default_key_metrics when picked from the library (0076)
  }[];
  metrics?: import("@/lib/cardio-metrics").MetricValues; // whole-session result (e.g. avg HR, calories), separate from each step's own metrics (0070)
  tracked_metrics?: import("@/lib/cardio-metrics").MetricKey[];
  default_distance_unit?: import("@/lib/cardio-metrics").DistanceUnit; // coach-set starting unit for the session-level distance box (0074)
}
export interface HyroxCyclingConfig {
  exercises: {
    exercise: string; reps: string;
    // Indexed by (cycle * rounds + round) - exercises cycle in order for
    // `rounds` reps, then the whole rounds block repeats for `cycles`
    // (separated by cyclRestSec), so a round's true position needs both -
    // e.g. with 2 rounds/cycle, metrics[0] = cycle 1 round 1, metrics[1]
    // = cycle 1 round 2, metrics[2] = cycle 2 round 1... Only populated
    // when "round" is in the session's `record_levels` below (0071/0072).
    metrics?: import("@/lib/cardio-metrics").MetricValues[];
    // Indexed by cycle - one rolled-up result per cycle instead of/as
    // well as per round, e.g. cycleMetrics[0] = Row's total across all
    // of cycle 1's rounds. Only populated when "cycle" is in
    // `record_levels` below (0071).
    cycleMetrics?: import("@/lib/cardio-metrics").MetricValues[];
    tracked_metrics?: import("@/lib/cardio-metrics").MetricKey[]; // per-exercise override, defaults from LibraryEntry.default_tracked_metrics when picked from the library (0070)
    equipment?: import("@/lib/cardio-metrics").EquipmentType; // copied from LibraryEntry.equipment when picked - restricts tracked_metrics to that equipment's set (0071)
    default_distance_unit?: import("@/lib/cardio-metrics").DistanceUnit; // coach-set starting unit for this exercise's distance box(es) (0074)
    key_metrics?: import("@/lib/cardio-metrics").MetricKey[]; // per-exercise override, defaults from LibraryEntry.default_key_metrics when picked from the library (0076)
  }[];
  workSec: number;
  restSec: number;
  rounds: number;
  cycles: number;
  cyclRestSec: number;
  metrics?: import("@/lib/cardio-metrics").MetricValues; // whole-session result (e.g. avg HR, calories) - "Session avg/total" (0071)
  tracked_metrics?: import("@/lib/cardio-metrics").MetricKey[];
  default_distance_unit?: import("@/lib/cardio-metrics").DistanceUnit; // coach-set starting unit for the session-level distance box (0074)
  // Which granularity(s) get recording boxes for every exercise in this
  // session - "Round/Cycle Data Tracking" in the builder, one tickbox
  // pair per session rather than per exercise. Defaults to ["round"]
  // when unset (0072).
  record_levels?: ("round" | "cycle")[];
}
export interface HyroxEMOMConfig {
  mins: number;
  slots: {
    minute: string; exercise: string; reps: string;
    equipment?: import("@/lib/cardio-metrics").EquipmentType; // copied from LibraryEntry.equipment when picked (0076)
    default_distance_unit?: import("@/lib/cardio-metrics").DistanceUnit; // (0076)
  }[];
  metrics?: import("@/lib/cardio-metrics").MetricValues;
  tracked_metrics?: import("@/lib/cardio-metrics").MetricKey[];
  default_distance_unit?: import("@/lib/cardio-metrics").DistanceUnit; // (0074)
}
export interface HyroxIntervalConfig {
  exercise: string;
  load: string;
  sets: number;
  workSec: number;
  restSec: number;
  metrics: import("@/lib/cardio-metrics").MetricValues[];
  // Single-exercise sub-type, so tracked_metrics (defaulted from
  // LibraryEntry.default_tracked_metrics when `exercise` is picked from the
  // library, 0070) already covers the whole config — no per-exercise nesting needed.
  tracked_metrics?: import("@/lib/cardio-metrics").MetricKey[];
  equipment?: import("@/lib/cardio-metrics").EquipmentType; // copied from LibraryEntry.equipment when picked (0071)
  default_distance_unit?: import("@/lib/cardio-metrics").DistanceUnit; // coach-set starting unit for each set's distance box (0074)
  key_metrics?: import("@/lib/cardio-metrics").MetricKey[]; // defaults from LibraryEntry.default_key_metrics when `exercise` is picked from the library (0076)
}
export interface HyroxCircuitConfig {
  isAmrap: boolean;
  rounds: number;
  timeCap: number;
  restSec: number;
  exercises: {
    exercise: string; reps: string;
    // Rounds mode: indexed by round, same convention as Cycling (0071).
    // AMRAP has no fixed round count, so it keeps one whole-AMRAP total
    // instead - e.g. Wall Balls: 17 reps total across the AMRAP. No
    // cycles concept here (unlike Cycling), so no cycleMetrics.
    metrics?: import("@/lib/cardio-metrics").MetricValues | import("@/lib/cardio-metrics").MetricValues[];
    tracked_metrics?: import("@/lib/cardio-metrics").MetricKey[]; // per-exercise override, defaults from LibraryEntry.default_tracked_metrics when picked from the library (0070)
    equipment?: import("@/lib/cardio-metrics").EquipmentType; // copied from LibraryEntry.equipment when picked - restricts tracked_metrics to that equipment's set (0071)
    default_distance_unit?: import("@/lib/cardio-metrics").DistanceUnit; // coach-set starting unit for this exercise's distance box(es) (0074)
    key_metrics?: import("@/lib/cardio-metrics").MetricKey[]; // per-exercise override, defaults from LibraryEntry.default_key_metrics when picked from the library (0076)
  }[];
  roundsDone: boolean[];
  metrics?: import("@/lib/cardio-metrics").MetricValues; // whole-session result (e.g. avg HR, calories) - "Session avg/total" (0071)
  tracked_metrics?: import("@/lib/cardio-metrics").MetricKey[];
  default_distance_unit?: import("@/lib/cardio-metrics").DistanceUnit; // coach-set starting unit for the session-level distance box (0074)
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
  // metrics/tracked_metrics (see comment above HyroxFixedConfig) apply
  // here too: continuous gets one whole-session `metrics`; threshold's
  // `blocks[]` and cardioIntervals/overUnder's per-rep entries each get
  // their own `metrics` object instead of the old free-text `result`.
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
  response?: string; // athlete-side completion state — their free-text answer to the prompt
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
  completed?: boolean; // whole-session completion flag — the only completion signal a Quick Prescription has (guided/checklist track completion per block/item instead, via each item's own `done`)
  // Guided Recovery Routine
  blocks?: RecoveryBlock[];
  // Recovery Checklist
  checklist_items?: RecoveryChecklistItem[];
}

// 0088 — Sport / Other sessions (cross-training, match play, court sports).
// The activity label lives in Session.name, actual duration in
// Session.duration_min, actual session-RPE in Session.rpe. sport_config only
// carries the coach's planned targets so they survive once the athlete logs
// their actuals over the top.
export interface SportConfig {
  planned?: { duration_min?: number | null; rpe?: number | null } | null;
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
  duration_min: number | null; // 0088 — actual session length in minutes; the missing half of Foster sRPE load. Nullable — falls back to estimateSessionDurationMinutes() for hyrox/cardio
  sport_config: SportConfig | null; // 0088 — only set on type === 'sport'
  session_source: "programme" | "library" | "athlete_logged"; // 0034/0088 — 'library' = athlete-started informal session (excluded from calendar + reports); 'athlete_logged' = athlete-added ad-hoc sport session (counts toward load, excluded from adherence)
  recovery_category: RecoveryCategory | null; // 0046
  recovery_format: RecoveryFormat | null; // 0046
  recovery_config: RecoveryConfig; // 0046
  sort_order: number; // 0049 — position among same-day sessions, set by the coach's drag-to-reorder
  is_primer?: boolean; // 0053 — coach-set: whole session is primer/activation (e.g. a pre-match wake-up), excluded from reports and the rolling %1RM estimate. Equivalent to flagging every exercise in it
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
  share_code: string | null; // 0058 — set = published as a public Home Programme at /g/<share_code>
  share_expires_at: string | null; // 0058 — optional coach-set expiry for that link
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
  notes: string; // 0055 — snapshot of the source session's session_notes
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

// 0078 — per-athlete, per-exercise load-velocity profile for
// VBT-estimated 1RM. Separate from AthleteOneRM above (a manual fixed
// value) - this is derived from a fitted regression over coach-entered
// test points, see lib/velocity-profile.ts for the actual formulas.
export interface AthleteVelocityProfile {
  id: string;
  athlete_id: string;
  exercise_name: string;
  mvt: number;
  calibration_points: { load: number; velocity: number }[];
  slope: number;
  intercept: number;
  updated_at: string;
}

// Daily readiness check-in — one row per athlete per day. See
// lib/checkin.ts for the question/scoring shape (CheckInAnswers).
export interface CheckIn {
  id: string;
  athlete_id: string;
  date: string;
  energy: number;
  sleep: number;
  soreness: number;
  volume: number;
  fatigue: number | null; // 0088 — 1-5, only asked when the daily-wellness tick-box is on
  stress: number | null; // 0088 — 1-5, only asked when the daily-wellness tick-box is on
  pain_score: number | null; // 0088 — 0-10, only asked when the pain-tracking tick-box is on
  pain_location: string | null; // 0088 — body area for pain_score
  wellness_notes: string | null; // 0088 — free-text note on the wellness/pain section
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
  recovery_category: RecoveryCategory | null; // 0046
  recovery_format: RecoveryFormat | null; // 0046
  recovery_config: RecoveryConfig; // 0046
  notes: string; // 0055 — snapshot of the source session's session_notes
  sort_order: number;
  day_offset: number; // 0056 — day number relative to the first session in the saved range (0-indexed), preserves rest-day gaps when loaded back onto a calendar
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
  group_test_session_id?: string | null; // 0080 — set when this session was created via Group Testing
}

// 0080 — a named parent for a squad-wide testing day. Thin wrapper:
// each athlete in it still has a normal TestSession row (linked back
// via group_test_session_id) holding the actual trials.
export interface GroupTestSession {
  id: string;
  organisation_id: string;
  name: string;
  test_battery_id: string | null;
  date: string; // YYYY-MM-DD
  created_at: string;
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

// 0077 — one shared thread per athlete, visible to every coach in the
// org (not private per coach) - same visibility model as everything
// else in this app (sessions/PBs/notes aren't locked to one coach).
export interface DirectMessage {
  id: string;
  organisation_id: string;
  athlete_id: string;
  sender_type: "coach" | "athlete";
  sender_id: string;
  sender_name: string;
  body: string;
  audio_path: string | null;
  audio_duration_seconds: number | null;
  created_at: string;
  edited_at?: string | null;
  acknowledged_at?: string | null; // 0084 — coach dismissed it off the Dashboard
}
