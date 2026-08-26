import { createClient } from "@/lib/supabase-browser";
import type { OneRMFormula, WeightUnit } from "@/lib/one-rm";
import { DEFAULT_CHECKIN_RULES, type CheckInRules } from "@/lib/checkin";

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
  hyrox_enabled: boolean;
  pb_enabled: boolean; // 0090 — org-wide default for Personal Bests tracking/display, per-athlete override on athletes.pb_enabled (same pattern as hyrox_enabled)
  report_frequency_weeks: ReportFrequency;
  reflection_enabled: boolean;
  reflection_metrics: ReflectionMetric[];
  reflection_good_prompt: string;
  reflection_better_prompt: string;
  reflection_how_prompt: string;
  recovery_alert_enabled: boolean;
  recovery_alert_threshold: 1 | 2 | 3; // low recovery-score feedback entries in the last 7 days needed to flag an athlete
  power_speed_benchmarks: PowerSpeedBenchmarkDef[];
}

export const DEFAULT_SETTINGS: OrgSettings = {
  one_rm_formula: "lander",
  one_rm_source: "rolling",
  weight_unit: "kg",
  checkin_enabled: true,
  checkin_rules: DEFAULT_CHECKIN_RULES,
  hyrox_enabled: true,
  pb_enabled: true,
  report_frequency_weeks: 4,
  reflection_enabled: true,
  reflection_metrics: DEFAULT_REFLECTION_METRICS,
  reflection_good_prompt: "What went well this week?",
  reflection_better_prompt: "What could have been better?",
  reflection_how_prompt: "How will you improve next week?",
  recovery_alert_enabled: true,
  recovery_alert_threshold: 2,
  power_speed_benchmarks: DEFAULT_POWER_SPEED_BENCHMARKS,
};

// ── Coach-side (uses authenticated client) ────────────────────────────────────

export async function getOrgSettings(): Promise<OrgSettings> {
  const supabase = createClient();
  const { data: coach } = await supabase
    .from("coaches")
    .select("organisation_id")
    .single();
  if (!coach) return DEFAULT_SETTINGS;

  const { data: org } = await supabase
    .from("organisations")
    .select("settings")
    .eq("id", coach.organisation_id)
    .single();

  return { ...DEFAULT_SETTINGS, ...(org?.settings ?? {}) };
}

export async function updateOrgSettings(patch: Partial<OrgSettings>): Promise<void> {
  const supabase = createClient();
  const { data: coach } = await supabase
    .from("coaches")
    .select("organisation_id")
    .single();
  if (!coach) throw new Error("No coach profile found");

  const { data: org } = await supabase
    .from("organisations")
    .select("settings")
    .eq("id", coach.organisation_id)
    .single();

  const merged = { ...DEFAULT_SETTINGS, ...(org?.settings ?? {}), ...patch };

  const { error } = await supabase
    .from("organisations")
    .update({ settings: merged })
    .eq("id", coach.organisation_id);

  if (error) throw error;
}

// Note: getOrgSettingsForAthlete (service role version) lives in
// lib/data/athlete-share-link.ts to avoid importing server-only
// packages into client components.
