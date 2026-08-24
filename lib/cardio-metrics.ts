// Shared metric system for Hyrox/Cardio session tracking. One fixed
// set of trackable metrics, coach-toggled per session via
// tracked_metrics (which boxes actually show up), used identically by
// the coach builder (HyroxCardioBuilder), the athlete app, and Live
// Group so a squad cardio session logs the same clean, structured
// data everywhere rather than three different free-text conventions.
//
// Values are stored as strings (same convention as SetLog.weight/reps
// - an input box's raw text, not yet a parsed number) so a box can be
// legitimately empty without a stray "0". lib/report-calc.ts is
// responsible for parsing them into numbers for trend charts.

export type MetricKey =
  | "distance" | "duration" | "avg_hr" | "max_hr" | "pace" | "speed" | "calories" | "rounds" | "reps";

export interface MetricMeta {
  key: MetricKey;
  label: string;
  unit: string;
  placeholder: string;
}

export const METRIC_ORDER: MetricKey[] = [
  "distance", "duration", "pace", "speed", "avg_hr", "max_hr", "calories", "rounds", "reps",
];

export const METRIC_META: Record<MetricKey, MetricMeta> = {
  distance: { key: "distance", label: "Distance", unit: "km", placeholder: "5" },
  duration: { key: "duration", label: "Duration", unit: "min", placeholder: "20" },
  pace:     { key: "pace",     label: "Pace",     unit: "min/km", placeholder: "4.30" },
  speed:    { key: "speed",    label: "Speed",    unit: "km/h", placeholder: "14" },
  avg_hr:   { key: "avg_hr",   label: "Avg HR",   unit: "bpm", placeholder: "155" },
  max_hr:   { key: "max_hr",   label: "Max HR",   unit: "bpm", placeholder: "178" },
  calories: { key: "calories", label: "Calories", unit: "kcal", placeholder: "320" },
  rounds:   { key: "rounds",   label: "Rounds",   unit: "", placeholder: "6" },
  reps:     { key: "reps",     label: "Reps",     unit: "", placeholder: "45" },
};

// One logged result — every tracked metric is optional per entry, so
// a coach/athlete only fills in what they actually captured that day.
export type MetricValues = Partial<Record<MetricKey, string>>;

export function emptyMetricValues(): MetricValues {
  return {};
}

// Sensible starting toggle set per Hyrox/Cardio sub-type - a coach can
// still tick/untick freely afterwards, this just avoids every new
// session defaulting to zero boxes shown.
export const DEFAULT_TRACKED_METRICS: Record<string, MetricKey[]> = {
  fixed: ["duration"],
  cycling: ["distance", "avg_hr", "calories"],
  emom: ["rounds"],
  interval: ["duration", "avg_hr"],
  circuit: ["rounds", "reps"],
  continuous: ["distance", "duration", "pace", "avg_hr"],
  threshold: ["duration", "pace", "avg_hr"],
  cardioIntervals: ["duration", "pace", "avg_hr"],
  overUnder: ["duration", "pace", "avg_hr"],
};

export function parseMetricNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw);
  return isFinite(n) ? n : null;
}
