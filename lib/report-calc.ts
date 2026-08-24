// Pure data transforms for the Training Load Report — no Supabase
// imports here on purpose, so this same logic can run from both the
// browser (lib/data/reports.ts, RLS via the coach's session) and the
// AI summary API route (server-side, RLS via the coach's cookie),
// without either environment pulling in the other's client.
import type { Session } from "@/types";
import { METRIC_ORDER, parseMetricNumber, type MetricKey, type MetricValues } from "@/lib/cardio-metrics";

export interface ReportRow {
  date: string;
  sessName: string;
  sets: number;
  reps: number;
  avgWeight: number;
  maxWeight: number;
  ttl: number;
  eachSide: boolean;
}

export type ExerciseMap = Record<string, ReportRow[]>;

export interface ExerciseSummary {
  name: string;
  entries: ReportRow[];
  // First-vs-last comparison across the whole report range — same
  // number already shown inline per exercise, hoisted out here so
  // the Highlights and Load Progression sections can both use it
  // without recomputing.
  overallPct: number | null;
  weightPct: number | null;
}

export interface WeeklyPoint {
  weekStart: string; // Monday of that week, ISO date
  ttl: number; // average TTL across sessions logged that week
  sets: number; // average sets across sessions logged that week
  sessionCount: number;
}

export type WeeklyExerciseMap = Record<string, WeeklyPoint[]>;

export interface NoteEntry {
  date: string;
  source: "session" | "exercise";
  label: string; // session name or exercise name
  note: string;
}

// Post-session RPE (1-10, "how hard did that feel") logged by the
// athlete via SessionRPEBlock. Spans every non-recovery session type
// (strength/hyrox/cardio/power_speed), unlike the exercise-tonnage
// data above which is strength-only — so this is built directly from
// allSessions, not strSessions.
export interface RPEEntry {
  date: string;
  sessName: string;
  type: Session["type"];
  rpe: number;
}

export interface RPEWeeklyPoint {
  weekStart: string; // Monday of that week, ISO date
  avgRpe: number;
  sessionCount: number;
}

// Power/speed exercises have no structured numeric field (unlike
// strength's weight/reps) - a set's result lives in the free-text
// `time` or `reps` string (e.g. "1.68s", "2.31m", "42cm"), entered
// straight off the builder in HyroxCardioBuilder-style flows. This
// parses the leading number + unit off whichever field is filled in,
// so exercises can still get a trend line without a schema change.
export interface PowerSpeedRow {
  date: string;
  sessName: string;
  value: number; // best set that session (min for time-based, max otherwise)
  unit: string; // e.g. "s", "m", "cm", "" (unitless)
}

export interface PowerSpeedSummary {
  name: string;
  unit: string;
  direction: "lower" | "higher"; // which way is improvement
  entries: PowerSpeedRow[];
  overallPct: number | null; // first-vs-last, signed so positive always = improvement
}

export type PowerSpeedMap = Record<string, PowerSpeedRow[]>;

// Bar speed (m/s), only ever present on exercises the coach turned
// track_velocity on — most sessions in the range will have none, so
// this is entirely separate from the tonnage-based ExerciseMap above
// rather than bolted onto it, and the report section it feeds only
// renders when at least one exercise actually has entries.
export interface VelocityRow {
  date: string;
  sessName: string;
  avgVelocity: number;
  maxVelocity: number;
}
export type VelocityMap = Record<string, VelocityRow[]>;
export interface VelocitySummary {
  name: string;
  entries: VelocityRow[];
  overallPct: number | null; // higher velocity = better
}

function collectVelocity(strengthSessions: Session[]): { exMap: VelocityMap; summaries: VelocitySummary[] } {
  const exMap: VelocityMap = {};
  for (const sess of strengthSessions) {
    if (sess.is_primer) continue;
    for (const ex of sess.exercises ?? []) {
      if (!ex.name || ex.is_primer || !(ex as any).track_velocity) continue;
      const values = (ex.log ?? [])
        .map((s) => parseFloat((s as any).velocity))
        .filter((v) => isFinite(v));
      if (!values.length) continue;

      const avgVelocity = values.reduce((a, b) => a + b, 0) / values.length;
      if (!exMap[ex.name]) exMap[ex.name] = [];
      exMap[ex.name].push({ date: sess.date, sessName: sess.name, avgVelocity, maxVelocity: Math.max(...values) });
    }
  }

  const summaries: VelocitySummary[] = Object.entries(exMap)
    .map(([name, entries]) => {
      const first = entries[0];
      const last = entries[entries.length - 1];
      const overallPct =
        entries.length >= 2 && first.avgVelocity !== 0
          ? ((last.avgVelocity - first.avgVelocity) / Math.abs(first.avgVelocity)) * 100
          : null;
      return { name, entries, overallPct };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { exMap, summaries };
}

// ------------------------------------------------------------
// Hyrox/Cardio structured metrics (0070) — one row per metric (not
// per exercise, since a hyrox/cardio session's trackable unit is the
// session itself, not a named exercise). Accumulative metrics
// (distance/calories/duration/rounds/reps) sum across every logged
// entry in a session (e.g. every rep of a cardioIntervals session);
// rate/state metrics (pace/speed/avg_hr) average; max_hr takes the
// max. A session with nothing logged for a given metric contributes
// no data point for it at all, rather than a misleading zero.
// ------------------------------------------------------------
export interface CardioMetricRow {
  date: string;
  sessName: string;
  value: number;
}
export type CardioMetricMap = Partial<Record<MetricKey, CardioMetricRow[]>>;
export interface CardioMetricSummary {
  key: MetricKey;
  entries: CardioMetricRow[];
  overallPct: number | null;
}

const SUM_METRICS: MetricKey[] = ["distance", "calories", "duration", "rounds", "reps"];
const MAX_METRICS: MetricKey[] = ["max_hr"];

// Normalises every hyrox/cardio sub-type's differently-shaped config
// (single object, array, or nested in steps[]/blocks[]) down to a
// flat list of logged entries, so the aggregation below doesn't need
// to know which of the 9 sub-types it's looking at.
function extractMetricEntries(session: Session): MetricValues[] {
  const isHyrox = session.type === "hyrox";
  const subType = isHyrox ? session.hyrox_type : (session as any).cardio_type;
  const cfg: any = (isHyrox ? session.hyrox_config : (session as any).cardio_config) ?? {};
  if (isHyrox && subType === "fixed") return (cfg.steps ?? []).map((s: any) => s.metrics ?? {});
  if (!isHyrox && subType === "threshold") return (cfg.blocks ?? []).map((b: any) => b.metrics ?? {});
  if ((isHyrox && subType === "interval") || (!isHyrox && (subType === "cardioIntervals" || subType === "overUnder"))) {
    return cfg.metrics ?? [];
  }
  // cycling / emom / circuit / continuous — one whole-session result
  return cfg.metrics ? [cfg.metrics] : [];
}

function collectCardioMetrics(sessions: Session[]): { exMap: CardioMetricMap; summaries: CardioMetricSummary[] } {
  const exMap: CardioMetricMap = {};
  for (const sess of sessions) {
    if (sess.is_primer) continue;
    const entries = extractMetricEntries(sess);
    if (!entries.length) continue;
    for (const key of METRIC_ORDER) {
      const values = entries.map((e) => parseMetricNumber(e[key])).filter((v): v is number => v != null);
      if (!values.length) continue;
      const value = SUM_METRICS.includes(key)
        ? values.reduce((a, b) => a + b, 0)
        : MAX_METRICS.includes(key)
        ? Math.max(...values)
        : values.reduce((a, b) => a + b, 0) / values.length;
      if (!exMap[key]) exMap[key] = [];
      exMap[key]!.push({ date: sess.date, sessName: sess.name, value });
    }
  }

  const summaries: CardioMetricSummary[] = (Object.keys(exMap) as MetricKey[])
    .map((key) => {
      const entries = exMap[key]!;
      const first = entries[0];
      const last = entries[entries.length - 1];
      const overallPct =
        entries.length >= 2 && first.value !== 0
          ? ((last.value - first.value) / Math.abs(first.value)) * 100
          : null;
      return { key, entries, overallPct };
    })
    .sort((a, b) => METRIC_ORDER.indexOf(a.key) - METRIC_ORDER.indexOf(b.key));

  return { exMap, summaries };
}

export interface ComputedReport {
  exMap: ExerciseMap;
  exerciseSummaries: ExerciseSummary[]; // alphabetical, for the Load Progression summary table
  weeklyExMap: WeeklyExerciseMap;
  topProgressed: ExerciseSummary[]; // up to 3, biggest positive overallPct
  toReview: ExerciseSummary[]; // up to 3, smallest/most negative overallPct
  notes: NoteEntry[]; // most recent first
  hyroxSessions: Session[];
  cardioSessions: Session[];
  powerSpeedSessions: Session[];
  powerSpeedExMap: PowerSpeedMap;
  powerSpeedSummaries: PowerSpeedSummary[]; // alphabetical
  rpeEntries: RPEEntry[]; // chronological
  rpeWeekly: RPEWeeklyPoint[]; // chronological
  // Session-completion, for the Squad Report's completion boards - % of
  // prescribed sets marked done across every coach-assigned ("programme"
  // source, not athlete-started "library") session in range. Null (not
  // 0) when there's nothing to judge, so a squad board can tell "hasn't
  // trained at all in this range" apart from "trained but skipped sets".
  completionPct: number | null;
  completedSets: number;
  totalSets: number;
  velocityExMap: VelocityMap;
  velocitySummaries: VelocitySummary[]; // alphabetical, empty when no exercise in range tracked bar speed
  cardioMetricExMap: CardioMetricMap;
  cardioMetricSummaries: CardioMetricSummary[]; // metric-order, empty when no hyrox/cardio session in range logged anything
}

function weekStartISO(dateISO: string): string {
  const d = new Date(dateISO + "T12:00:00Z");
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
}

function buildWeeklyMap(exMap: ExerciseMap): WeeklyExerciseMap {
  const weekly: WeeklyExerciseMap = {};
  for (const [name, rows] of Object.entries(exMap)) {
    const byWeek = new Map<string, ReportRow[]>();
    for (const r of rows) {
      const wk = weekStartISO(r.date);
      if (!byWeek.has(wk)) byWeek.set(wk, []);
      byWeek.get(wk)!.push(r);
    }
    weekly[name] = Array.from(byWeek.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([weekStart, rs]) => ({
        weekStart,
        ttl: rs.reduce((s, r) => s + r.ttl, 0) / rs.length,
        sets: Math.round(rs.reduce((s, r) => s + r.sets, 0) / rs.length),
        sessionCount: rs.length,
      }));
  }
  return weekly;
}

function summarize(exMap: ExerciseMap): ExerciseSummary[] {
  return Object.entries(exMap)
    .map(([name, entries]) => {
      const first = entries[0];
      const last = entries[entries.length - 1];
      const overallPct =
        entries.length >= 2 && first.ttl > 0 ? ((last.ttl - first.ttl) / first.ttl) * 100 : null;
      const weightPct =
        entries.length >= 2 && first.maxWeight > 0
          ? ((last.maxWeight - first.maxWeight) / first.maxWeight) * 100
          : null;
      return { name, entries, overallPct, weightPct };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function collectRPE(allSessions: Session[]): { entries: RPEEntry[]; weekly: RPEWeeklyPoint[] } {
  const entries: RPEEntry[] = allSessions
    .filter((s) => s.type !== "recovery" && s.rpe != null && !s.is_primer)
    .map((s) => ({ date: s.date, sessName: s.name, type: s.type, rpe: s.rpe as number }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const byWeek = new Map<string, number[]>();
  for (const e of entries) {
    const wk = weekStartISO(e.date);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk)!.push(e.rpe);
  }
  const weekly = Array.from(byWeek.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([weekStart, values]) => ({
      weekStart,
      avgRpe: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
      sessionCount: values.length,
    }));

  return { entries, weekly };
}

function collectCompletion(allSessions: Session[]): { completionPct: number | null; completedSets: number; totalSets: number } {
  let completedSets = 0;
  let totalSets = 0;
  for (const s of allSessions) {
    // Only coach-assigned sessions count toward adherence - an
    // athlete-started "library" session was never assigned, so
    // completing (or not) has no bearing on whether they did what was
    // programmed for them.
    if (s.session_source !== "programme" || s.is_primer) continue;
    for (const ex of s.exercises ?? []) {
      if (ex.is_primer) continue;
      for (const set of ex.log ?? []) {
        totalSets++;
        if (set.done) completedSets++;
      }
    }
  }
  const completionPct = totalSets > 0 ? Math.round((completedSets / totalSets) * 1000) / 10 : null;
  return { completionPct, completedSets, totalSets };
}

// Power/speed logs don't use the generic {weight,reps,done,time} SetLog
// shape - PowerSpeedExerciseCard.tsx writes its own PSSetLog shape
// (rep_results: string[], rsi, etc.), and the exercise's measurement
// type (what those numbers actually mean) rides in the `tempo` column
// (see toPSExercise/handlePSExerciseChange in the session detail page -
// "measurement_type stored in tempo"). Mirrored here rather than
// imported since PSSetLog/MeasurementType live in a "use client"
// component file this Supabase-free module can't depend on.
const PS_UNIT: Record<string, string> = {
  time_s: "s", height_cm: "cm", distance_m: "m", rsi: "", power_w: "W", velocity_ms: "m/s", none: "",
};
function psLowerBetter(measurementType: string): boolean {
  return measurementType === "time_s";
}

function collectPowerSpeed(powerSpeedSessions: Session[]): { exMap: PowerSpeedMap; summaries: PowerSpeedSummary[] } {
  const exMap: PowerSpeedMap = {};
  for (const sess of powerSpeedSessions) {
    if (sess.is_primer) continue;
    for (const ex of sess.exercises ?? []) {
      if (!ex.name || ex.is_primer) continue;
      const measurementType = (ex as any).tempo || "time_s";
      if (measurementType === "none") continue;
      const unit = PS_UNIT[measurementType] ?? "";
      const lowerBetter = psLowerBetter(measurementType);

      const values: number[] = [];
      for (const set of (ex.log ?? []) as any[]) {
        if (!set?.done) continue;
        if (measurementType === "rsi") {
          const v = parseFloat(set.rsi);
          if (isFinite(v)) values.push(v);
          continue;
        }
        for (const raw of set.rep_results ?? []) {
          const v = parseFloat(raw);
          if (isFinite(v)) values.push(v);
        }
      }
      if (!values.length) continue;

      const best = lowerBetter ? Math.min(...values) : Math.max(...values);
      if (!exMap[ex.name]) exMap[ex.name] = [];
      exMap[ex.name].push({ date: sess.date, sessName: sess.name, value: best, unit });
    }
  }

  const summaries: PowerSpeedSummary[] = Object.entries(exMap)
    .map(([name, entries]) => {
      const unit = entries[0].unit;
      const direction: "lower" | "higher" = unit === "s" ? "lower" : "higher";
      const first = entries[0];
      const last = entries[entries.length - 1];
      const overallPct =
        entries.length >= 2 && first.value !== 0
          ? ((direction === "lower" ? first.value - last.value : last.value - first.value) / Math.abs(first.value)) * 100
          : null;
      return { name, unit, direction, entries, overallPct };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { exMap, summaries };
}

function collectNotes(allSessions: Session[]): NoteEntry[] {
  const notes: NoteEntry[] = [];
  for (const s of allSessions) {
    if (s.athlete_notes?.trim()) {
      notes.push({ date: s.date, source: "session", label: s.name, note: s.athlete_notes.trim() });
    }
    for (const ex of s.exercises ?? []) {
      if (ex.athlete_exercise_notes?.trim()) {
        notes.push({ date: s.date, source: "exercise", label: ex.name, note: ex.athlete_exercise_notes.trim() });
      }
    }
  }
  return notes.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Ported exactly from the prototype's debugged generateReport
// function — see the comments inline for why each piece works the
// way it does. Two real bugs were found and fixed during that build,
// both preserved here:
//
// 1. Tonnage must use each SET's own logged reps where the
//    athlete/coach changed it for that set, not just the exercise's
//    prescribed reps — otherwise a session where reps were adjusted
//    mid-workout reports the wrong tonnage entirely.
// 2. "Each side" exercises (logged weight is per hand, e.g. DB work)
//    must double their tonnage, matching the live in-session TTL
//    display, so the report and the session view never disagree on
//    the same logged data.
export function computeReport(allSessions: Session[]): ComputedReport {
  const strSessions = allSessions
    .filter((s) => s.type === "strength")
    .filter((s) => (s.exercises ?? []).some((e) => (e.log ?? []).some((l) => parseFloat(l.weight) > 0)));

  const exMap: ExerciseMap = {};

  for (const sess of strSessions) {
    if (sess.is_primer) continue;
    for (const ex of sess.exercises ?? []) {
      if (!ex.name || ex.is_primer) continue;
      const done = (ex.log ?? []).filter((s) => parseFloat(s.weight) > 0);
      if (!done.length) continue;

      const prescribedReps = parseInt(ex.reps) || 0;
      const perSetReps = done.map((s) => parseInt(s.reps) || prescribedReps);
      if (!perSetReps.some((r) => r > 0)) continue;

      const weights = done.map((s) => parseFloat(s.weight));
      const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
      const avgReps = Math.round(perSetReps.reduce((a, b) => a + b, 0) / perSetReps.length);
      const sideMultiplier = ex.each_side ? 2 : 1;
      const ttl =
        done.reduce((sum, s, i) => sum + (parseFloat(s.weight) || 0) * (perSetReps[i] || 0), 0) *
        sideMultiplier;

      if (!exMap[ex.name]) exMap[ex.name] = [];
      exMap[ex.name].push({
        date: sess.date,
        sessName: sess.name,
        sets: done.length,
        reps: avgReps,
        avgWeight: avg,
        maxWeight: Math.max(...weights),
        ttl,
        eachSide: !!ex.each_side,
      });
    }
  }

  const exerciseSummaries = summarize(exMap);
  const withTrend = exerciseSummaries.filter((e) => e.overallPct != null);
  const topProgressed = [...withTrend].sort((a, b) => (b.overallPct ?? 0) - (a.overallPct ?? 0)).slice(0, 3);
  const toReview = [...withTrend].sort((a, b) => (a.overallPct ?? 0) - (b.overallPct ?? 0)).slice(0, 3);

  const hyroxSessions = allSessions
    .filter((s) => s.type === "hyrox")
    .filter((s) => s.hyrox_config || (s.exercises ?? []).some((e) => (e.log ?? []).some((l) => l.done)));

  const cardioSessions = allSessions
    .filter((s) => s.type === "cardio")
    .filter((s) => (s as any).cardio_config);

  const powerSpeedSessions = allSessions
    .filter((s) => s.type === "power_speed")
    .filter((s) => (s.exercises ?? []).some((e) => (e.log ?? []).some((l) => l.done)));

  const { entries: rpeEntries, weekly: rpeWeekly } = collectRPE(allSessions);
  const { completionPct, completedSets, totalSets } = collectCompletion(allSessions);
  const { exMap: powerSpeedExMap, summaries: powerSpeedSummaries } = collectPowerSpeed(powerSpeedSessions);
  // Bar speed can be tracked on any strength exercise regardless of
  // whether it also has loggable weight (e.g. a bodyweight jump
  // squat), so this runs against every strength session directly
  // rather than reusing strSessions' weight>0 filter above.
  const { exMap: velocityExMap, summaries: velocitySummaries } = collectVelocity(
    allSessions.filter((s) => s.type === "strength")
  );
  const { exMap: cardioMetricExMap, summaries: cardioMetricSummaries } = collectCardioMetrics([
    ...hyroxSessions,
    ...cardioSessions,
  ]);

  return {
    exMap,
    exerciseSummaries,
    weeklyExMap: buildWeeklyMap(exMap),
    topProgressed,
    toReview,
    notes: collectNotes(allSessions),
    hyroxSessions,
    cardioSessions,
    powerSpeedSessions,
    powerSpeedExMap,
    powerSpeedSummaries,
    rpeEntries,
    rpeWeekly,
    completionPct,
    completedSets,
    totalSets,
    velocityExMap,
    velocitySummaries,
    cardioMetricExMap,
    cardioMetricSummaries,
  };
}
