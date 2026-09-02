import { createClient } from "@/lib/supabase-browser";
import type { OneRMFormula, WeightUnit } from "@/lib/one-rm";
import { DEFAULT_CHECKIN_RULES, type CheckInRules } from "@/lib/checkin";
import { DEFAULT_ZONE_MODEL, type ZoneModel } from "@/lib/training-zones";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReportFrequency = 4 | 8 | 12 | "monthly";

export interface ReflectionScoreOption {
  score: number;
  label: string;
  meaning: string;
}

export interface ReflectionMetric {
  key: string;
  label: string;
  scores?: ReflectionScoreOption[]; // if omitted, uses generic 1–5
}

// Definitions for the Power/Speed Benchmark Dashboard
// (athletes/[id]/power-speed) - was a hardcoded array there, moved
// here so coaches can add their own (a swim time, a sport-specific
// agility test) instead of only the seeded athletics-style set.
// exerciseNames is matched case-insensitively as a substring against
// logged exercise names, same as the dashboard's original matching.
export interface PowerSpeedBenchmarkDef {
  key: string;
  label: string;
  unit: string;
  lowerIsBetter: boolean;
  exerciseNames: string[];
  icon: string;
  greenThreshold: number | null;
  amberThreshold: number | null;
}

export const DEFAULT_POWER_SPEED_BENCHMARKS: PowerSpeedBenchmarkDef[] = [
  {
    key: "10m", label: "10m Sprint", unit: "s", lowerIsBetter: true, icon: "⚡",
    exerciseNames: ["acceleration sprint", "10m sprint", "10m"],
    greenThreshold: 1.80, amberThreshold: 1.95,
  },
  {
    key: "20m", label: "20m Sprint", unit: "s", lowerIsBetter: true, icon: "🏃",
    exerciseNames: ["20m sprint", "flying sprint", "20m"],
    greenThreshold: 2.80, amberThreshold: 3.00,
  },
  {
    key: "flying10", label: "Flying 10m", unit: "s", lowerIsBetter: true, icon: "💨",
    exerciseNames: ["flying 10m", "flying 10", "flying sprint"],
    greenThreshold: 1.05, amberThreshold: 1.15,
  },
  {
    key: "cmj", label: "CMJ Height", unit: "cm", lowerIsBetter: false, icon: "🦘",
    exerciseNames: ["countermovement jump", "cmj", "countermovement jump (cmj)"],
    greenThreshold: 45, amberThreshold: 35,
  },
  {
    key: "dj_rsi", label: "Drop Jump RSI", unit: "", lowerIsBetter: false, icon: "📉",
    exerciseNames: ["drop jump", "depth jump"],
    greenThreshold: 1.8, amberThreshold: 1.2,
  },
  {
    key: "broad", label: "Broad Jump", unit: "m", lowerIsBetter: false, icon: "📏",
    exerciseNames: ["broad jump", "standing broad jump", "standing long jump"],
    greenThreshold: 2.5, amberThreshold: 2.2,
  },
  {
    key: "505", label: "505 Test", unit: "s", lowerIsBetter: true, icon: "🔄",
    exerciseNames: ["505", "505 test", "pro agility"],
    greenThreshold: 2.3, amberThreshold: 2.6,
  },
];

export const DEFAULT_REFLECTION_METRICS: ReflectionMetric[] = [
  {
    key: "intent",
    label: "Intent & effort",
    scores: [
      { score: 5, label: "Pushed hard",        meaning: "Chased high-quality outputs, strong intent, competitive reps" },
      { score: 4, label: "Solid intent",        meaning: "Good effort, mostly purposeful" },
      { score: 3, label: "Cruised / maintained",meaning: "Did the work, but not much intent to push" },
      { score: 2, label: "Under-cooked",        meaning: "Low intent, avoided hard efforts" },
      { score: 1, label: "Slacked off",         meaning: "Poor effort, distracted, lazy week" },
    ],
  },
  {
    key: "consistency",
    label: "Consistency / adherence",
    scores: [
      { score: 5, label: "Completed everything", meaning: "All planned sessions and reps completed" },
      { score: 4, label: "Mostly completed",     meaning: "Minor reductions" },
      { score: 3, label: "Partially completed",  meaning: "Missed some work" },
      { score: 2, label: "Poor consistency",     meaning: "Missed major parts" },
      { score: 1, label: "Not enough data",      meaning: "Barely trained or did not log" },
    ],
  },
  {
    key: "load",
    label: "Training load",
    scores: [
      { score: 5, label: "Too light",             meaning: "Load was too light this week" },
      { score: 4, label: "Slightly under",        meaning: "Load was slightly under capability" },
      { score: 3, label: "Ideal",                 meaning: "Load was ideal" },
      { score: 2, label: "Slightly high",         meaning: "Load was slightly high" },
      { score: 1, label: "Too high",              meaning: "Load was too high this week" },
    ],
  },
  {
    key: "recovery",
    label: "Recovery & readiness",
    scores: [
      { score: 5, label: "Fresh",     meaning: "Felt great, recovered well" },
      { score: 4, label: "Good",      meaning: "Minor fatigue" },
      { score: 3, label: "Okay",      meaning: "Manageable soreness" },
      { score: 2, label: "Poor",      meaning: "Fatigue affected output" },
      { score: 1, label: "Not ready", meaning: "Pain, poor sleep, illness, high fatigue" },
    ],
  },
  {
    key: "stress",
    label: "Stress / Life Load",
    scores: [
      { score: 5, label: "Very high", meaning: "Very high stress this week" },
      { score: 4, label: "High",      meaning: "High stress" },
      { score: 3, label: "Moderate",  meaning: "Moderate stress" },
      { score: 2, label: "Some",      meaning: "Some stress" },
      { score: 1, label: "Low",       meaning: "Low stress — felt in control" },
    ],
  },
];

// 0038 — where %1RM targets get their 1RM value from:
// "rolling" = estimated from the athlete's logged history (default),
// "fixed"   = coach-set values in athlete_one_rms (falls back to
//             rolling per-exercise when no fixed value is set yet).
export type OneRMSource = "rolling" | "fixed";

export interface OrgSettings {
  one_rm_formula: OneRMFormula;
  one_rm_source: OneRMSource;
  weight_unit: WeightUnit;
  checkin_enabled: boolean;
  checkin_rules: CheckInRules;
  lock_until_checkin: boolean; // 0079 — athletes can't log sets on today's programmed session until they've completed today's check-in
  hyrox_enabled: boolean;
  pb_enabled: boolean; // 0090 — org-wide default for Personal Bests tracking/display, per-athlete override on athletes.pb_enabled (same pattern as hyrox_enabled)
  challenges_enabled: boolean; // 0074 — org-wide default for the Challenges feature, per-athlete override on athletes.challenges_enabled (same pattern as hyrox_enabled/pb_enabled)
  squad_comparison_enabled: boolean; // 0075 — org-wide default for the "Compare to squad" report option, per-athlete override on athletes.squad_comparison_enabled (same pattern as hyrox_enabled/pb_enabled/challenges_enabled)
  report_frequency_weeks: ReportFrequency;
  reflection_enabled: boolean;
  reflection_metrics: ReflectionMetric[];
  reflection_good_prompt: string;
  reflection_better_prompt: string;
  reflection_how_prompt: string;
  recovery_alert_enabled: boolean;
  recovery_alert_threshold: 1 | 2 | 3; // low recovery-score feedback entries in the last 7 days needed to flag an athlete
  power_speed_benchmarks: PowerSpeedBenchmarkDef[];
  aerobic_zones_enabled: boolean; // 0086 — MAS / heart-rate training zones feature (profile section, zone picker, athlete zone table)
  zone_model: ZoneModel; // 0086 — 5-zone HR/MAS model for conditioning prescription
  // 0088 — training-load / return-to-play monitoring. Master toggle + per-element
  // tick-boxes. Master off (default) = an S&C-only coach sees zero change anywhere.
  load_monitoring_enabled: boolean;
  load_monitoring: LoadMonitoringToggles;
  load_spike_pct: number; // flag a weekly load this many % above the 4-week average
  acwr_low: number; // ACWR sweet-spot floor (below = possible detraining)
  acwr_high: number; // ACWR sweet-spot ceiling (above = injury risk climbs)
  // Community leaderboards — age-banded, sex-split rankings for testing
  // metrics + coach-picked strength lifts. Off by default.
  leaderboards_enabled: boolean;
  leaderboards: LeaderboardSettings;
}

// One picked strength lift + whether it gets a relative (÷BW) board, an
// absolute (kg) board, or both.
export interface LeaderboardStrengthExercise {
  name: string; // matched case-insensitively against PBs
  relative: boolean;
  absolute: boolean;
}

export interface LeaderboardSettings {
  strength_exercises: LeaderboardStrengthExercise[];
  // Which testing metrics get a board. null = every eligible metric (the
  // legacy default, and what a fresh org gets); an array = only those metric ids.
  test_metrics: string[] | null;
}

export const DEFAULT_LEADERBOARDS: LeaderboardSettings = {
  strength_exercises: [],
  test_metrics: null,
};

// Tolerates the old shape (string[] + org-level show_relative/show_absolute)
// so settings stored before the per-exercise change still load.
function normaliseLeaderboards(raw: unknown): LeaderboardSettings {
  const r = (raw ?? {}) as { strength_exercises?: unknown; show_relative?: boolean; show_absolute?: boolean; test_metrics?: unknown };
  const rel = r.show_relative !== false;
  const abs = r.show_absolute !== false;
  const list = Array.isArray(r.strength_exercises) ? r.strength_exercises : [];
  return {
    strength_exercises: list.map((e) =>
      typeof e === "string"
        ? { name: e, relative: rel, absolute: abs }
        : { name: String((e as LeaderboardStrengthExercise).name ?? ""), relative: (e as LeaderboardStrengthExercise).relative !== false, absolute: (e as LeaderboardStrengthExercise).absolute !== false }
    ).filter((e) => e.name),
    test_metrics: Array.isArray(r.test_metrics) ? r.test_metrics.map(String) : null,
  };
}

// 0088 — individually toggleable elements of the load-monitoring feature.
export interface LoadMonitoringToggles {
  acwr: boolean; // acute:chronic workload ratio chart + flag
  load_spike_alert: boolean; // weekly load-spike dashboard flag
  monotony_strain: boolean; // Foster monotony & strain
  rtp_status: boolean; // per-athlete availability status field + displays
  daily_wellness: boolean; // fatigue + stress questions on the daily check-in
  pain_tracking: boolean; // pain score (0-10) + location on the daily check-in
}

export const DEFAULT_LOAD_MONITORING: LoadMonitoringToggles = {
  acwr: true,
  load_spike_alert: true,
  monotony_strain: true,
  rtp_status: true,
  daily_wellness: true,
  pain_tracking: true,
};

export const DEFAULT_SETTINGS: OrgSettings = {
  one_rm_formula: "lander",
  one_rm_source: "rolling",
  weight_unit: "kg",
  checkin_enabled: true,
  checkin_rules: DEFAULT_CHECKIN_RULES,
  lock_until_checkin: false,
  hyrox_enabled: true,
  pb_enabled: true,
  challenges_enabled: true,
  squad_comparison_enabled: true,
  report_frequency_weeks: 4,
  reflection_enabled: true,
  reflection_metrics: DEFAULT_REFLECTION_METRICS,
  reflection_good_prompt: "What went well this week?",
  reflection_better_prompt: "What could have been better?",
  reflection_how_prompt: "How will you improve next week?",
  recovery_alert_enabled: true,
  recovery_alert_threshold: 2,
  power_speed_benchmarks: DEFAULT_POWER_SPEED_BENCHMARKS,
  aerobic_zones_enabled: true,
  zone_model: DEFAULT_ZONE_MODEL,
  load_monitoring_enabled: false,
  load_monitoring: DEFAULT_LOAD_MONITORING,
  load_spike_pct: 50,
  acwr_low: 0.8,
  acwr_high: 1.3,
  leaderboards_enabled: false,
  leaderboards: DEFAULT_LEADERBOARDS,
};

// Merge stored org settings over the defaults. A plain spread replaces nested
// objects wholesale, so load_monitoring (and any future nested object) needs an
// explicit deep merge or a stored value missing a later-added key reads as
// undefined. Used by all three settings readers.
export function mergeOrgSettings(stored: Partial<OrgSettings> | null | undefined): OrgSettings {
  const s = stored ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    load_monitoring: { ...DEFAULT_LOAD_MONITORING, ...(s.load_monitoring ?? {}) },
    leaderboards: normaliseLeaderboards(s.leaderboards),
  };
}

// ── Coach-side (uses authenticated client) ────────────────────────────────────

// Coaches RLS returns every colleague in the org, so a bare
// .from("coaches").single() breaks the moment an org has 2+ coaches —
// resolve auth.uid() first (same lesson as getMyOrganisationId,
// GroupChat, challenges, etc.).
async function myOrgId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: coach } = await supabase
    .from("coaches")
    .select("organisation_id")
    .eq("id", user.id)
    .single();
  return coach?.organisation_id ?? null;
}

export async function getOrgSettings(): Promise<OrgSettings> {
  const supabase = createClient();
  const orgId = await myOrgId(supabase);
  if (!orgId) return DEFAULT_SETTINGS;

  const { data: org } = await supabase
    .from("organisations")
    .select("settings")
    .eq("id", orgId)
    .single();

  return mergeOrgSettings(org?.settings);
}

export async function updateOrgSettings(patch: Partial<OrgSettings>): Promise<void> {
  const supabase = createClient();
  const orgId = await myOrgId(supabase);
  if (!orgId) throw new Error("No coach profile found");

  const { data: org } = await supabase
    .from("organisations")
    .select("settings")
    .eq("id", orgId)
    .single();

  const merged = mergeOrgSettings({ ...(org?.settings ?? {}), ...patch });

  const { error } = await supabase
    .from("organisations")
    .update({ settings: merged })
    .eq("id", orgId);

  if (error) throw error;
}

// Note: getOrgSettingsForAthlete (service role version) lives in
// lib/data/athlete-share-link.ts to avoid importing server-only
// packages into client components.
