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
  | "distance" | "duration" | "avg_hr" | "max_hr" | "pace" | "speed" | "watts" | "cadence" | "incline" | "load" | "calories" | "rounds" | "reps";

export interface MetricMeta {
  key: MetricKey;
  label: string;
  unit: string;
  placeholder: string;
}

export const METRIC_ORDER: MetricKey[] = [
  "distance", "duration", "pace", "speed", "incline", "watts", "cadence", "avg_hr", "max_hr", "calories", "load", "rounds", "reps",
];

export const METRIC_META: Record<MetricKey, MetricMeta> = {
  distance: { key: "distance", label: "Distance", unit: "km", placeholder: "5" },
  duration: { key: "duration", label: "Duration", unit: "min", placeholder: "20" },
  pace:     { key: "pace",     label: "Pace",     unit: "min/km", placeholder: "4.30" },
  speed:    { key: "speed",    label: "Speed",    unit: "km/h", placeholder: "14" },
  incline:  { key: "incline",  label: "Incline",  unit: "%", placeholder: "2" },
  watts:    { key: "watts",    label: "Watts",    unit: "W", placeholder: "220" },
  cadence:  { key: "cadence",  label: "Cadence",  unit: "/min", placeholder: "24" },
  avg_hr:   { key: "avg_hr",   label: "Avg HR",   unit: "bpm", placeholder: "155" },
  max_hr:   { key: "max_hr",   label: "Max HR",   unit: "bpm", placeholder: "178" },
  calories: { key: "calories", label: "Calories", unit: "kcal", placeholder: "320" },
  load:     { key: "load",     label: "Load",     unit: "kg", placeholder: "40" },
  rounds:   { key: "rounds",   label: "Rounds",   unit: "", placeholder: "6" },
  reps:     { key: "reps",     label: "Reps",     unit: "", placeholder: "45" },
};

// Equipment types a Cardio/Hyrox library exercise can be tagged with -
// restricts which metrics are selectable for it (both on the library
// entry's own default and on the per-session exercise instance), so a
// Treadmill exercise only ever offers speed/incline-type readouts and
// an Erg only offers pace/watts/cadence-type ones, rather than the full
// 12-metric list on every exercise regardless of what it's measuring.
export type EquipmentType = "erg" | "bike" | "treadmill" | "bodyweight" | "weighted" | "other";

export interface EquipmentMeta {
  key: EquipmentType;
  label: string;
  metrics: MetricKey[];
}

export const EQUIPMENT_ORDER: EquipmentType[] = ["erg", "bike", "treadmill", "bodyweight", "weighted", "other"];

export const EQUIPMENT_META: Record<EquipmentType, EquipmentMeta> = {
  erg:        { key: "erg",        label: "Erg (Row / Ski / Bike Erg)", metrics: ["distance", "duration", "pace", "watts", "cadence", "avg_hr", "max_hr", "calories"] },
  bike:       { key: "bike",       label: "Bike (Assault / Echo / Spin)", metrics: ["distance", "duration", "watts", "cadence", "avg_hr", "max_hr", "calories"] },
  treadmill:  { key: "treadmill",  label: "Treadmill", metrics: ["distance", "duration", "speed", "incline", "avg_hr", "max_hr", "calories"] },
  bodyweight: { key: "bodyweight", label: "Bodyweight / Reps", metrics: ["reps", "rounds", "duration", "avg_hr", "max_hr", "calories"] },
  // Loaded movements with no machine readout - Sled Push/Pull, Sandbag
  // Lunges, Farmers Carry - reps/rounds like Bodyweight, plus the load
  // actually carried/pushed, and distance for carries/pushes measured
  // by ground covered rather than reps (e.g. a 40m Farmers Carry).
  weighted:   { key: "weighted",   label: "Weighted / Loaded (Sled, Sandbag, Farmers Carry)", metrics: ["distance", "load", "reps", "rounds", "duration", "avg_hr", "max_hr", "calories"] },
  other:      { key: "other",      label: "Other (unrestricted)", metrics: METRIC_ORDER },
};

// Distance is logged in whatever unit actually makes sense for that
// particular box - an interval rep is naturally "500m", a continuous
// run is naturally "10km" or "6mi" - rather than forcing every distance
// box in the app to the same unit. Carried on the values object itself
// (not a separate prop threaded through every MetricBoxes call site)
// so it travels with the value it describes, same as the value itself.
export type DistanceUnit = "m" | "km" | "mi";
export const DISTANCE_UNIT_LABEL: Record<DistanceUnit, string> = { m: "m", km: "km", mi: "mi" };

// One logged result — every tracked metric is optional per entry, so
// a coach/athlete only fills in what they actually captured that day.
// `distance_unit` (default "km" when unset, matching this app's
// original distance-only-in-km convention) only applies to the
// `distance` entry alongside it.
export type MetricValues = Partial<Record<MetricKey, string>> & { distance_unit?: DistanceUnit };

// Converts a logged distance value to km, using its own distance_unit -
// so report-calc can sum/compare distances logged in different units
// within the same session (an interval box in meters alongside a
// session-level box in km) without the raw numbers colliding (0074).
export function distanceToKm(raw: string | undefined, unit: DistanceUnit | undefined): number | null {
  const n = raw ? parseFloat(raw) : NaN;
  if (!isFinite(n)) return null;
  if (unit === "m") return n / 1000;
  if (unit === "mi") return n * 1.60934;
  return n; // "km" or unset - unset preserves pre-0074 data, which was always km
}

export function emptyMetricValues(): MetricValues {
  return {};
}

// Sensible starting toggle set per Hyrox/Cardio sub-type - a coach can
// still tick/untick freely afterwards, this just avoids every new
// session defaulting to zero boxes shown.
export const DEFAULT_TRACKED_METRICS: Record<string, MetricKey[]> = {
  fixed: ["duration"],
  // distance/reps now live on each exercise (defaulted from its library
  // entry) rather than here — this session-level set is just for
  // whole-workout totals like avg HR/calories (0070).
  cycling: ["avg_hr", "calories"],
  emom: ["rounds"],
  interval: ["duration", "avg_hr"],
  circuit: ["rounds"],
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

// Resolves what metrics an exercise instance should track: an explicit
// per-instance override wins, else the picked library exercise's own
// default (coach-configured once in Settings → Library), else - if the
// entry has an equipment type but was never given explicit defaults
// (e.g. an older entry, or equipment was set without touching the
// metrics toggles) - every metric that equipment supports, so picking
// "Erg" on a library exercise is enough on its own to get its boxes
// showing up, not just to narrow what CAN be ticked. Falls back to a
// sensible default for the sub-type as a last resort. Used whenever a
// coach selects an exercise from LibraryAutocomplete in
// HyroxCardioBuilder (0070/0072).
export function resolveTrackedMetrics(
  existing: MetricKey[] | undefined,
  libraryEntry: { default_tracked_metrics?: MetricKey[]; equipment?: EquipmentType | null } | undefined,
  fallback: MetricKey[]
): MetricKey[] {
  if (existing) return existing;
  if (libraryEntry?.default_tracked_metrics?.length) return libraryEntry.default_tracked_metrics;
  if (libraryEntry?.equipment) return metricsForEquipment(libraryEntry.equipment);
  return fallback;
}

// Which metrics an exercise with this equipment is allowed to track -
// "other"/unset means unrestricted (today's full list), so an exercise
// with no equipment set keeps working exactly as before (0071).
export function metricsForEquipment(equipment: EquipmentType | undefined): MetricKey[] {
  return EQUIPMENT_META[equipment ?? "other"].metrics;
}

// Lower is genuinely the win for these - pace/duration on a task means
// "finished faster", HR means "same output for less strain". Everything
// else (distance, watts, reps, rounds, calories, load...) defaults to
// higher-is-better. Shared between the Squad Report's Cardio/Hyrox
// exercise board (lib/squad-report.ts) and the Challenges feature
// (lib/challenges.ts) rather than each keeping its own copy (0074).
export const LOWER_IS_BETTER_METRICS: MetricKey[] = ["duration", "pace", "avg_hr", "max_hr"];
