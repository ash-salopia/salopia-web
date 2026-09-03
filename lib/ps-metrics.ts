// Multi-metric logging for Power/Speed exercises.
//
// A coach toggles which metrics an exercise tracks
// (PSExercise.tracked_metrics). The coach card, the athlete view and the
// reports all render / read one value per tracked metric:
//   - "set" metrics (load, reps) — one value for the whole set
//   - "rep" metrics (time, distance, height, …) — one value per rep
//
// Pure module (no "use client", no Supabase) so lib/report-calc.ts can
// import it. Values are stored as strings — an input box's raw text —
// same convention as SetLog / the cardio metric system.

export type PSQuality =
  | "acceleration" | "max_velocity" | "plyometric"
  | "cod" | "deceleration" | "";

// Legacy single-measurement selector (pre-0096). Kept for reading old
// session_exercises rows + old library entries.
export type MeasurementType =
  | "time_s" | "height_cm" | "distance_m" | "rsi" | "power_w" | "velocity_ms" | "none";

export type PSMetricKey =
  | "load" | "reps"
  | "time" | "distance" | "height" | "velocity" | "power" | "rsi" | "contact_time";

export interface PSMetricMeta {
  key: PSMetricKey;
  label: string;
  short: string;
  unit: string;
  placeholder: string;
  scope: "set" | "rep";
  lowerBetter: boolean;
}

export const PS_METRIC_ORDER: PSMetricKey[] = [
  "load", "reps", "time", "distance", "height", "velocity", "power", "rsi", "contact_time",
];

export const PS_METRIC_META: Record<PSMetricKey, PSMetricMeta> = {
  load:         { key: "load",         label: "Load",         short: "Load", unit: "kg",  placeholder: "40",   scope: "set", lowerBetter: false },
  reps:         { key: "reps",         label: "Reps",         short: "Reps", unit: "",    placeholder: "5",    scope: "set", lowerBetter: false },
  time:         { key: "time",         label: "Time",         short: "Time", unit: "s",   placeholder: "4.20", scope: "rep", lowerBetter: true },
  distance:     { key: "distance",     label: "Distance",     short: "Dist", unit: "m",   placeholder: "20",   scope: "rep", lowerBetter: false },
  height:       { key: "height",       label: "Height",       short: "Ht",   unit: "cm",  placeholder: "45",   scope: "rep", lowerBetter: false },
  velocity:     { key: "velocity",     label: "Velocity",     short: "Vel",  unit: "m/s", placeholder: "2.40", scope: "rep", lowerBetter: false },
  power:        { key: "power",        label: "Power",        short: "Pwr",  unit: "W",   placeholder: "800",  scope: "rep", lowerBetter: false },
  rsi:          { key: "rsi",          label: "RSI",          short: "RSI",  unit: "",    placeholder: "2.10", scope: "rep", lowerBetter: false },
  contact_time: { key: "contact_time", label: "Contact time", short: "GCT",  unit: "ms",  placeholder: "180",  scope: "rep", lowerBetter: true },
};

export const PS_SET_METRICS: PSMetricKey[] = PS_METRIC_ORDER.filter((k) => PS_METRIC_META[k].scope === "set");
export const PS_REP_METRICS: PSMetricKey[] = PS_METRIC_ORDER.filter((k) => PS_METRIC_META[k].scope === "rep");

export function isPSMetricKey(v: unknown): v is PSMetricKey {
  return typeof v === "string" && v in PS_METRIC_META;
}

// ── Log shape ────────────────────────────────────────────────────────────────

export interface PSSetLog {
  done: boolean;
  set_metrics: Partial<Record<PSMetricKey, string>>;   // load / reps
  rep_metrics: Partial<Record<PSMetricKey, string>>[]; // one entry per rep
  single_value: boolean;   // one rep_metrics entry applies to every rep
  rpe: string;
  pain: string;
  set_notes: string;
}

export interface PSExercise {
  id: string;
  name: string;
  order: string;
  quality: PSQuality;
  tracked_metrics: PSMetricKey[];
  completion_only: boolean;
  sets: number;
  reps: number;             // prescribed reps per set
  distance: string;         // prescribed distance e.g. "10m"
  rest: string;
  contacts: number | null;  // prescribed contacts (plyometric)
  surface: string;
  notes: string;
  log: PSSetLog[];
  sort_order: number;
}

// ── Quality defaults ─────────────────────────────────────────────────────────

export const QUALITY_META: Record<string, { label: string; color: string; icon: string; defaultMetrics: PSMetricKey[] }> = {
  acceleration:  { label: "Acceleration",  color: "#F59E0B", icon: "⚡", defaultMetrics: ["time"] },
  max_velocity:  { label: "Max Velocity",  color: "#EF4444", icon: "🏃", defaultMetrics: ["time"] },
  plyometric:    { label: "Plyometric",    color: "#8B5CF6", icon: "🦘", defaultMetrics: ["height", "contact_time"] },
  cod:           { label: "COD",           color: "#3B82F6", icon: "🔄", defaultMetrics: ["time"] },
  deceleration:  { label: "Deceleration",  color: "#10B981", icon: "🛑", defaultMetrics: ["time"] },
  "":            { label: "General",       color: "#6B7280", icon: "•",  defaultMetrics: [] },
};

// ── Migration helpers ────────────────────────────────────────────────────────

export function migrateMeasurementType(mt: string | null | undefined): PSMetricKey[] {
  switch (mt) {
    case "time_s": return ["time"];
    case "height_cm": return ["height"];
    case "distance_m": return ["distance"];
    case "rsi": return ["rsi"];
    case "power_w": return ["power"];
    case "velocity_ms": return ["velocity"];
    case "none": return [];
    default: return [];
  }
}

// Resolve an exercise's tracked metrics from whatever's on the DB row:
// the new ps_tracked_metrics column, else the legacy measurement in
// `tempo`, else the quality default.
export function resolveTrackedMetrics(
  psTracked: unknown,
  legacyTempo: string | null | undefined,
  quality: string | null | undefined,
): PSMetricKey[] {
  if (Array.isArray(psTracked)) {
    const clean = psTracked.filter(isPSMetricKey);
    if (clean.length || psTracked.length === 0) return clean;
  }
  const fromLegacy = migrateMeasurementType(legacyTempo);
  if (fromLegacy.length) return fromLegacy;
  return QUALITY_META[quality ?? ""]?.defaultMetrics ?? [];
}

export function emptyPSSetLog(reps: number): PSSetLog {
  const n = Math.max(1, reps);
  return {
    done: false,
    set_metrics: {},
    rep_metrics: Array.from({ length: n }, () => ({})),
    single_value: false,
    rpe: "",
    pain: "",
    set_notes: "",
  };
}

export function buildPSLog(sets: number, reps: number): PSSetLog[] {
  return Array.from({ length: Math.max(1, sets) }, () => emptyPSSetLog(reps));
}

// Read any historical log shape into the current PSSetLog[]:
//   - current shape  (rep_metrics present) — kept, resized to `reps`
//   - legacy shape   (rep_results: string[] + set.rsi/contact_time) — converted,
//     with each rep_results value landing under the exercise's first tracked
//     rep-metric (or `time` if none).
export function normalizePSLog(rawLog: unknown, reps: number, tracked: PSMetricKey[]): PSSetLog[] {
  const n = Math.max(1, reps);
  const repMetric = tracked.find((k) => PS_METRIC_META[k].scope === "rep") ?? "time";
  if (!Array.isArray(rawLog) || rawLog.length === 0) return buildPSLog(1, reps);

  return rawLog.map((raw): PSSetLog => {
    const s = (raw ?? {}) as Record<string, unknown>;
    if (Array.isArray(s.rep_metrics)) {
      const rm = (s.rep_metrics as Partial<Record<PSMetricKey, string>>[])
        .slice(0, n)
        .map((r) => ({ ...(r ?? {}) }));
      while (rm.length < n) rm.push({});
      return {
        done: !!s.done,
        set_metrics: { ...((s.set_metrics as Partial<Record<PSMetricKey, string>>) ?? {}) },
        rep_metrics: rm,
        single_value: !!s.single_value,
        rpe: String(s.rpe ?? ""),
        pain: String(s.pain ?? ""),
        set_notes: String(s.set_notes ?? ""),
      };
    }
    // Legacy: rep_results: string[]
    const results = Array.isArray(s.rep_results) ? (s.rep_results as unknown[]).map((v) => String(v ?? "")) : [];
    const rm: Partial<Record<PSMetricKey, string>>[] = Array.from({ length: n }, (_, i) => {
      const entry: Partial<Record<PSMetricKey, string>> = {};
      if (results[i]) entry[repMetric] = results[i];
      if (s.rsi && tracked.includes("rsi")) entry.rsi = String(s.rsi);
      return entry;
    });
    const setMetrics: Partial<Record<PSMetricKey, string>> = {};
    if (s.contact_time && tracked.includes("contact_time")) {
      // legacy contact_time was per-set — spread onto rep 1
      rm[0].contact_time = String(s.contact_time);
    }
    return {
      done: !!s.done,
      set_metrics: setMetrics,
      rep_metrics: rm,
      single_value: !!s.single_value,
      rpe: String(s.rpe ?? ""),
      pain: String(s.pain ?? ""),
      set_notes: String(s.set_notes ?? ""),
    };
  });
}

// The best logged value for one metric across a set's reps (or its
// set-level value). Applies the metric's better-direction.
export function bestPSValue(set: PSSetLog, key: PSMetricKey): number | null {
  const meta = PS_METRIC_META[key];
  const vals: number[] = [];
  if (meta.scope === "set") {
    const v = parseFloat(set.set_metrics[key] ?? "");
    if (isFinite(v)) vals.push(v);
  } else {
    for (const rep of set.rep_metrics) {
      const v = parseFloat(rep[key] ?? "");
      if (isFinite(v)) vals.push(v);
    }
  }
  if (!vals.length) return null;
  return meta.lowerBetter ? Math.min(...vals) : Math.max(...vals);
}
