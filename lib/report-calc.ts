// Pure data transforms for the Training Load Report — no Supabase
// imports here on purpose, so this same logic can run from both the
// browser (lib/data/reports.ts, RLS via the coach's session) and the
// AI summary API route (server-side, RLS via the coach's cookie),
// without either environment pulling in the other's client.
import type { Session } from "@/types";
import { METRIC_ORDER, METRIC_META, parseMetricNumber, distanceToKm, type MetricKey, type MetricValues } from "@/lib/cardio-metrics";
import { estimateOneRMFromPoint } from "@/lib/velocity-profile";

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

// sRPE training load (0078) — cardio/hyrox equivalent of strength's TTL:
// session RPE × estimated session duration, so intensity and volume
// combine into one "how much work was actually asked for" number.
export interface TrainingLoadEntry {
  date: string;
  sessName: string;
  value: number; // rpe × duration(min), rounded
}
export interface TrainingLoadWeeklyPoint {
  weekStart: string;
  totalLoad: number; // summed, not averaged — represents total weekly work
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

// VBT-estimated 1RM (0078) — a sibling to collectVelocity above, but
// only produces a value for exercises with a saved
// athlete_velocity_profiles calibration (by exercise name); everything
// else is left alone, so an uncalibrated exercise still only ever
// shows the raw m/s trend, never an invented number. Re-anchors the
// profile's calibrated slope through each individual logged
// (weight, velocity) point — see lib/velocity-profile.ts's
// estimateOneRMFromPoint for why this is what lets the estimate trend
// from ordinary training data rather than staying static between
// calibration sessions — and takes the best (highest) estimate per
// session, same "one row per session" shape as every other report
// collector here.
export interface VelocityOneRMRow {
  date: string;
  sessName: string;
  estimatedOneRM: number;
}
export type VelocityOneRMMap = Record<string, VelocityOneRMRow[]>;
export interface VelocityOneRMSummary {
  name: string;
  entries: VelocityOneRMRow[];
  overallPct: number | null;
}
export interface VelocityProfileInput {
  exercise_name: string;
  slope: number;
  mvt: number;
}

function collectVelocityOneRM(
  strengthSessions: Session[],
  profiles: VelocityProfileInput[]
): { exMap: VelocityOneRMMap; summaries: VelocityOneRMSummary[] } {
  const exMap: VelocityOneRMMap = {};
  if (!profiles.length) return { exMap, summaries: [] };
  const profileByName = new Map(profiles.map((p) => [p.exercise_name.trim().toLowerCase(), p]));

  for (const sess of strengthSessions) {
    if (sess.is_primer) continue;
    for (const ex of sess.exercises ?? []) {
      if (!ex.name || ex.is_primer || !(ex as any).track_velocity) continue;
      const profile = profileByName.get(ex.name.trim().toLowerCase());
      if (!profile) continue;

      const estimates: number[] = [];
      for (const s of ex.log ?? []) {
        const weight = parseFloat((s as any).weight);
        const velocity = parseFloat((s as any).velocity);
        if (!isFinite(weight) || !isFinite(velocity)) continue;
        const est = estimateOneRMFromPoint(profile.slope, profile.mvt, weight, velocity);
        if (est != null) estimates.push(est);
      }
      if (!estimates.length) continue;

      if (!exMap[ex.name]) exMap[ex.name] = [];
      exMap[ex.name].push({ date: sess.date, sessName: sess.name, estimatedOneRM: Math.max(...estimates) });
    }
  }

  const summaries: VelocityOneRMSummary[] = Object.entries(exMap)
    .map(([name, entries]) => {
      const first = entries[0];
      const last = entries[entries.length - 1];
      const overallPct =
        entries.length >= 2 && first.estimatedOneRM !== 0
          ? ((last.estimatedOneRM - first.estimatedOneRM) / Math.abs(first.estimatedOneRM)) * 100
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
  // Which report toggle this belongs to ("Hyrox metric trends" vs
  // "Cardio metric trends") - the two are picked independently now
  // since Hyrox can be disabled per athlete/org (0077).
  sessionType: "hyrox" | "cardio";
  // What this trend line is actually of - a named exercise (Row, Wall
  // Balls) for Hyrox sub-types, the modality (Run, Bike Erg) for Cardio
  // sub-types, or the sub-type's own label (e.g. "Cycling Intervals")
  // for whole-session totals with no single exercise identity. Without
  // this, every sub-type's distance/avg_hr/etc got flattened into one
  // combined line - a Row split sitting in the same trend as an 8km LSD
  // run (0076).
  group: string;
  entries: CardioMetricRow[];
  overallPct: number | null;
}

const SUM_METRICS: MetricKey[] = ["distance", "calories", "duration", "rounds", "reps"];
// Load (Weighted/Loaded equipment) is a "how heavy" value like max_hr,
// not an accumulating one - summing kg carried across sets/rounds isn't
// meaningful, the best single load is (0073).
const MAX_METRICS: MetricKey[] = ["max_hr", "load"];

// Same sub-type labels HyroxCardioLog shows - duplicated rather than
// imported since that's a "use client" component and this module is
// deliberately client/server-agnostic (see file header).
const HYROX_GROUP_LABEL: Record<string, string> = {
  fixed: "Fixed Workout", cycling: "Cycling Intervals", emom: "EMOM",
  interval: "Intervals", circuit: "Circuit / AMRAP",
};
const CARDIO_GROUP_LABEL: Record<string, string> = {
  continuous: "Continuous / LSD", threshold: "Threshold / Tempo",
  cardioIntervals: "Intervals / VO2max", overUnder: "Over-Unders",
};

interface GroupedMetricEntry {
  group: string;
  values: MetricValues;
}

// Normalises every hyrox/cardio sub-type's differently-shaped config
// (single object, array, or nested in steps[]/blocks[]) down to a flat
// list of {group, values} entries, so the aggregation below doesn't
// need to know which of the 9 sub-types it's looking at - it just
// groups whatever comes back.
function extractMetricEntries(session: Session): GroupedMetricEntry[] {
  const isHyrox = session.type === "hyrox";
  const subType = (isHyrox ? session.hyrox_type : (session as any).cardio_type) as string;
  const cfg: any = (isHyrox ? session.hyrox_config : (session as any).cardio_config) ?? {};
  const sessionLabel = isHyrox ? (HYROX_GROUP_LABEL[subType] ?? "Hybrid") : (CARDIO_GROUP_LABEL[subType] ?? "Cardio");

  // fixed/cycling/circuit: each exercise's own result(s) (e.g. Row: 560m,
  // grouped under "Row") plus the one whole-session result (e.g. avg HR,
  // calories, grouped under the sub-type label since it isn't any one
  // exercise) - see per-exercise tracked_metrics in HyroxCardioBuilder
  // (0070). An exercise's own metrics is one object for Fixed/AMRAP
  // Circuit, or one object per round/cycle for Cycling/rounds-mode
  // Circuit (0071/0072). Cycling's `record_levels` (session-level: which
  // of round/cycle actually got recorded) decides which array to read -
  // prefer round-level (the finer-grained true total) when both are on,
  // so ticking both doesn't double-count the same work into the sum.
  if (isHyrox && (subType === "fixed" || subType === "cycling" || subType === "circuit")) {
    const items = subType === "fixed" ? (cfg.steps ?? []) : (cfg.exercises ?? []);
    const levels: string[] = cfg.record_levels ?? ["round"];
    const exerciseEntries: GroupedMetricEntry[] = items.flatMap((it: any) => {
      const group = it.exercise || sessionLabel;
      let values: MetricValues[];
      if (levels.includes("round") && Array.isArray(it.metrics)) values = it.metrics;
      else if (levels.includes("cycle") && Array.isArray(it.cycleMetrics)) values = it.cycleMetrics;
      else if (!Array.isArray(it.metrics)) values = it.metrics ? [it.metrics] : [];
      else values = [];
      return values.map((v) => ({ group, values: v }));
    });
    return [...exerciseEntries, { group: sessionLabel, values: cfg.metrics ?? {} }];
  }
  if (!isHyrox && subType === "threshold") {
    const sessionModality = cfg.modality || sessionLabel;
    // A block's own Activity override (0076) gets its own group, e.g. a
    // bike warm-up block reports separately from a running main set.
    return (cfg.blocks ?? []).map((b: any) => ({ group: b.modality || sessionModality, values: b.metrics ?? {} }));
  }
  if (isHyrox && subType === "interval") {
    const group = cfg.exercise || sessionLabel;
    return ((cfg.metrics ?? []) as MetricValues[]).map((v) => ({ group, values: v }));
  }
  if (!isHyrox && (subType === "cardioIntervals" || subType === "overUnder")) {
    const group = cfg.modality || sessionLabel;
    return ((cfg.metrics ?? []) as MetricValues[]).map((v) => ({ group, values: v }));
  }
  if (!isHyrox && subType === "continuous") {
    const group = cfg.modality || sessionLabel;
    return cfg.metrics ? [{ group, values: cfg.metrics }] : [];
  }
  // emom — no per-exercise identity to group by, session total only
  return cfg.metrics ? [{ group: sessionLabel, values: cfg.metrics }] : [];
}

function collectCardioMetrics(sessions: Session[]): { exMap: CardioMetricMap; summaries: CardioMetricSummary[] } {
  const exMap: CardioMetricMap = {};
  // One row per (metric, sessionType, subType, group) per session, e.g.
  // "distance"+hyrox+"Row" and "distance"+cardio+"Run" from the same
  // range end up as separate trend lines instead of one combined
  // "distance" number - sessionType is included (not just group) since
  // a Hyrox exercise and a Cardio modality could otherwise share a name
  // (e.g. both called "Run") and wrongly merge (0076/0077). subType is
  // included too (0084) - the same exercise name can appear in more
  // than one Hyrox/Cardio sub-type (e.g. "Row" as a Fixed-Workout time
  // trial vs. as 40-second Cycling-Interval reps), and those are
  // different protocols with incomparable numbers; merging them
  // produced a misleading combined trend line and % change. The
  // display label only gets the sub-type suffix when it actually adds
  // information - a whole-session total's group is already the
  // sub-type's own label, so it doesn't need "(Cycling Intervals)"
  // appended to itself.
  const byKeyAndGroup = new Map<MetricKey, Map<string, CardioMetricSummary>>();

  for (const sess of sessions) {
    if (sess.is_primer) continue;
    const sessionType = sess.type as "hyrox" | "cardio";
    const subType = ((sessionType === "hyrox" ? sess.hyrox_type : (sess as any).cardio_type) as string) ?? "";
    const sessionLabel = sessionType === "hyrox" ? (HYROX_GROUP_LABEL[subType] ?? "Hybrid") : (CARDIO_GROUP_LABEL[subType] ?? "Cardio");
    const entries = extractMetricEntries(sess);
    if (!entries.length) continue;
    for (const key of METRIC_ORDER) {
      const valuesByGroup = new Map<string, number[]>();
      for (const e of entries) {
        // Distance can be logged in m/km/mi per entry (an interval box
        // in metres alongside a session-level box in km) - normalise to
        // km using each entry's own distance_unit before combining,
        // rather than summing raw numbers across different units (0074).
        const v = key === "distance"
          ? distanceToKm(e.values.distance, e.values.distance_unit)
          : parseMetricNumber(e.values[key]);
        if (v == null) continue;
        if (!valuesByGroup.has(e.group)) valuesByGroup.set(e.group, []);
        valuesByGroup.get(e.group)!.push(v);
      }
      if (!valuesByGroup.size) continue;
      for (const [group, values] of valuesByGroup) {
        const value = SUM_METRICS.includes(key)
          ? values.reduce((a, b) => a + b, 0)
          : MAX_METRICS.includes(key)
          ? Math.max(...values)
          : values.reduce((a, b) => a + b, 0) / values.length;
        const row = { date: sess.date, sessName: sess.name, value };

        if (!exMap[key]) exMap[key] = [];
        exMap[key]!.push(row);

        if (!byKeyAndGroup.has(key)) byKeyAndGroup.set(key, new Map());
        const groups = byKeyAndGroup.get(key)!;
        const groupKey = `${sessionType}::${subType}::${group}`;
        const displayGroup = group === sessionLabel ? group : `${group} (${sessionLabel})`;
        if (!groups.has(groupKey)) groups.set(groupKey, { key, sessionType, group: displayGroup, entries: [], overallPct: null });
        groups.get(groupKey)!.entries.push(row);
      }
    }
  }

  const summaries: CardioMetricSummary[] = [];
  for (const [, groups] of byKeyAndGroup) {
    for (const summary of groups.values()) {
      const { entries } = summary;
      const first = entries[0];
      const last = entries[entries.length - 1];
      summary.overallPct =
        entries.length >= 2 && first.value !== 0
          ? ((last.value - first.value) / Math.abs(first.value)) * 100
          : null;
      summaries.push(summary);
    }
  }
  summaries.sort((a, b) => METRIC_ORDER.indexOf(a.key) - METRIC_ORDER.indexOf(b.key) || a.group.localeCompare(b.group));

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
  trainingLoadEntries: TrainingLoadEntry[]; // chronological, hyrox/cardio only (0078)
  trainingLoadWeekly: TrainingLoadWeeklyPoint[]; // chronological
  // Session-completion, for the Squad Report's completion boards - % of
  // prescribed sets marked done across every coach-assigned ("programme"
  // source, not athlete-started "library") session in range. Null (not
  // 0) when there's nothing to judge, so a squad board can tell "hasn't
  // trained at all in this range" apart from "trained but skipped sets".
  completionPct: number | null;
  completedSets: number;
  totalSets: number;
  sessionTypeStats: Record<string, SessionTypeStats>; // 0080 — per-type session counts + completion, keyed by type
  velocityExMap: VelocityMap;
  velocitySummaries: VelocitySummary[]; // alphabetical, empty when no exercise in range tracked bar speed
  velocityOneRMExMap: VelocityOneRMMap;
  velocityOneRMSummaries: VelocityOneRMSummary[]; // alphabetical, empty when no exercise has a saved velocity profile (0078)
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

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(n) ? n : null;
}

// Estimates a hyrox/cardio session's total length, preferring what the
// athlete actually logged over a guess from the PRESCRIPTION. If
// "Duration" is one of the session's tracked metrics and the athlete
// filled it in, that real figure wins outright - it reflects what
// actually happened (a session that overran, or one with no reliable
// structural formula at all, like Fixed and Circuit in Rounds mode).
// Only when nothing was logged do we fall back to the structural
// estimate (work/rest/rounds/etc.), which mirrors the exact formulas
// already used for each builder's own structure preview/timer - and for
// Fixed/Circuit-Rounds specifically, there is no structural formula, so
// those two return null unless a duration was actually logged.
function estimateSessionDurationMinutes(session: Session): number | null {
  if (session.type === "hyrox") {
    const subType = session.hyrox_type;
    const cfg: any = session.hyrox_config ?? {};
    const logged = numOrNull(cfg.metrics?.duration);
    if (logged != null && logged > 0) return logged;
    if (subType === "emom") return numOrNull(cfg.mins);
    if (subType === "interval") {
      const workSec = numOrNull(cfg.workSec) ?? 120, restSec = numOrNull(cfg.restSec) ?? 90, sets = numOrNull(cfg.sets) ?? 6;
      return ((workSec + restSec) * sets) / 60;
    }
    if (subType === "cycling") {
      const exN = (cfg.exercises ?? []).length || 1;
      const workSec = numOrNull(cfg.workSec) ?? 40, restSec = numOrNull(cfg.restSec) ?? 20;
      const rounds = numOrNull(cfg.rounds) ?? 2, cycles = numOrNull(cfg.cycles) ?? 3, cyclRestSec = numOrNull(cfg.cyclRestSec) ?? 120;
      return (exN * (workSec + restSec) * rounds * cycles + (cycles - 1) * cyclRestSec) / 60;
    }
    if (subType === "circuit" && cfg.isAmrap && cfg.timeCap != null) return (numOrNull(cfg.timeCap) ?? 0) / 60;
    return null; // fixed, circuit (rounds mode) — no reliable structural estimate
  }
  if (session.type === "cardio") {
    const subType = (session as any).cardio_type;
    const cfg: any = (session as any).cardio_config ?? {};
    const logged = numOrNull(cfg.metrics?.duration);
    if (logged != null && logged > 0) return logged;
    if (subType === "continuous") return numOrNull(cfg.duration);
    if (subType === "threshold") {
      const total = (cfg.blocks ?? []).reduce((sum: number, b: any) => sum + (numOrNull(b.duration) ?? 0) * (numOrNull(b.repeat) ?? 1), 0);
      return total || null;
    }
    if (subType === "cardioIntervals") {
      const workDur = numOrNull(cfg.workDur) ?? 180, restDur = numOrNull(cfg.restDur) ?? 90, reps = numOrNull(cfg.reps) ?? 6;
      return ((workDur + restDur) * reps) / 60;
    }
    if (subType === "overUnder") {
      const underDur = numOrNull(cfg.underDur) ?? 180, overDur = numOrNull(cfg.overDur) ?? 120;
      const sets = numOrNull(cfg.sets) ?? 3, reps = numOrNull(cfg.reps) ?? 6, restBetweenSetsMin = numOrNull(cfg.restDur) ?? 5;
      return ((underDur + overDur) * reps * sets) / 60 + restBetweenSetsMin * Math.max(0, sets - 1);
    }
  }
  return null;
}

// sRPE training load (Foster's method: session RPE × session duration
// in minutes) - the cardio/hyrox equivalent of strength's Total
// Training Load, using RPE (already logged) and a structural duration
// estimate (above) rather than requiring anything extra to be tracked.
// Weekly total (not average) - training load is meant to represent how
// much work was asked for in a week, not a per-session intensity.
function collectTrainingLoad(sessions: Session[]): { entries: TrainingLoadEntry[]; weekly: TrainingLoadWeeklyPoint[] } {
  const entries: TrainingLoadEntry[] = [];
  for (const s of sessions) {
    if (s.is_primer || s.rpe == null) continue;
    const minutes = estimateSessionDurationMinutes(s);
    if (minutes == null || minutes <= 0) continue;
    entries.push({ date: s.date, sessName: s.name, value: Math.round(s.rpe * minutes) });
  }
  entries.sort((a, b) => (a.date < b.date ? -1 : 1));

  const byWeek = new Map<string, number[]>();
  for (const e of entries) {
    const wk = weekStartISO(e.date);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk)!.push(e.value);
  }
  const weekly = Array.from(byWeek.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([weekStart, values]) => ({
      weekStart,
      totalLoad: values.reduce((a, b) => a + b, 0),
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

// ------------------------------------------------------------
// Per-type session counts + completion (0080) - "how many sessions did
// I actually assign vs. how many did the athlete engage with", broken
// out by type since a coach might assign 5 Strength + 2 Hyrox sessions
// and wants to know those separately, not blended into one number like
// collectCompletion's set-level %. "Engaged with" is session-level, not
// set-level: any set ticked done for Strength/Power-Speed, or an RPE /
// any logged metric value for Hyrox/Cardio (which have no discrete
// "sets" to count).
// ------------------------------------------------------------
export interface SessionTypeStats {
  type: "strength" | "power_speed" | "cardio" | "hyrox";
  loggedCount: number; // sessions of this type in range, any source
  prescribedCount: number; // session_source === "programme" — what the coach actually assigned
  completedCount: number; // of prescribedCount, how many the athlete engaged with
  completionPct: number | null; // null when nothing was prescribed, not 0
}

function sessionHasCompletion(s: Session): boolean {
  if (s.type === "strength" || s.type === "power_speed") {
    return (s.exercises ?? []).some((ex) => !ex.is_primer && (ex.log ?? []).some((l) => l.done));
  }
  if (s.type === "hyrox" || s.type === "cardio") {
    if (s.rpe != null) return true;
    // Reuses the same config-flattening extractMetricEntries already
    // uses for trend lines - any non-empty logged value anywhere in the
    // session (a step, an exercise, a round, the session-level box)
    // counts as engagement, without needing to know which of the 9
    // sub-types it's looking at.
    return extractMetricEntries(s).some((e) =>
      Object.entries(e.values).some(([k, v]) => k !== "distance_unit" && typeof v === "string" && v.trim() !== "")
    );
  }
  return false;
}

function collectSessionTypeStats(allSessions: Session[]): Record<string, SessionTypeStats> {
  const types: SessionTypeStats["type"][] = ["strength", "power_speed", "cardio", "hyrox"];
  const stats: Record<string, SessionTypeStats> = {};
  for (const type of types) {
    const sessions = allSessions.filter((s) => s.type === type && !s.is_primer);
    const prescribed = sessions.filter((s) => s.session_source === "programme");
    const completed = prescribed.filter(sessionHasCompletion);
    stats[type] = {
      type,
      loggedCount: sessions.length,
      prescribedCount: prescribed.length,
      completedCount: completed.length,
      completionPct: prescribed.length > 0 ? Math.round((completed.length / prescribed.length) * 1000) / 10 : null,
    };
  }
  return stats;
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
export function computeReport(allSessions: Session[], velocityProfiles: VelocityProfileInput[] = []): ComputedReport {
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
  const { entries: trainingLoadEntries, weekly: trainingLoadWeekly } = collectTrainingLoad([
    ...hyroxSessions,
    ...cardioSessions,
  ]);
  const { completionPct, completedSets, totalSets } = collectCompletion(allSessions);
  const sessionTypeStats = collectSessionTypeStats(allSessions);
  const { exMap: powerSpeedExMap, summaries: powerSpeedSummaries } = collectPowerSpeed(powerSpeedSessions);
  // Bar speed can be tracked on any strength exercise regardless of
  // whether it also has loggable weight (e.g. a bodyweight jump
  // squat), so this runs against every strength session directly
  // rather than reusing strSessions' weight>0 filter above.
  const strengthTypeSessions = allSessions.filter((s) => s.type === "strength");
  const { exMap: velocityExMap, summaries: velocitySummaries } = collectVelocity(strengthTypeSessions);
  const { exMap: velocityOneRMExMap, summaries: velocityOneRMSummaries } = collectVelocityOneRM(
    strengthTypeSessions,
    velocityProfiles
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
    trainingLoadEntries,
    trainingLoadWeekly,
    completionPct,
    completedSets,
    totalSets,
    sessionTypeStats,
    velocityExMap,
    velocitySummaries,
    velocityOneRMExMap,
    velocityOneRMSummaries,
    cardioMetricExMap,
    cardioMetricSummaries,
  };
}

// ------------------------------------------------------------
// Repeated-session comparison (0079) - a coach re-programming the same
// benchmark workout wants results side by side across attempts.
// Grouped by exact name match (case/whitespace-insensitive) within the
// same athlete + session type + sub-type, rather than by
// source_session_id (only covers sessions literally copied via "copy
// to dates"/"update future occurrences") - a session reloaded from a
// template gets no link back to it at all (see the source_session_id
// note in CLAUDE.md), and a coach rebuilding the same workout from
// scratch has no link either. Name is the one signal that survives
// every path a repeat can come from.
// ------------------------------------------------------------
export interface RepeatSessionGroup {
  name: string;
  type: Session["type"];
  subType: string | null;
  sessions: { id: string; date: string }[]; // chronological
}

export function findRepeatedSessionGroups(sessions: Session[]): RepeatSessionGroup[] {
  const byKey = new Map<string, RepeatSessionGroup>();
  for (const s of sessions) {
    if (s.is_primer) continue;
    const name = (s.name ?? "").trim();
    if (!name) continue;
    const subType = s.type === "hyrox" ? s.hyrox_type : s.type === "cardio" ? (s as any).cardio_type : null;
    const key = `${s.type}::${subType ?? ""}::${name.toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, { name, type: s.type, subType: subType ?? null, sessions: [] });
    byKey.get(key)!.sessions.push({ id: s.id, date: s.date });
  }
  const groups = [...byKey.values()].filter((g) => g.sessions.length >= 2);
  for (const g of groups) g.sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  groups.sort((a, b) => b.sessions.length - a.sessions.length || a.name.localeCompare(b.name));
  return groups;
}

export interface SessionCompareCell {
  sessionId: string;
  date: string;
  value: number;
  display?: string; // pre-formatted text when the raw number alone isn't the full picture (e.g. "80kg × 5")
}
export interface SessionCompareRow {
  group: string; // exercise/modality name (hyrox/cardio), or the exercise name (strength)
  label: string; // metric label with unit, e.g. "Distance (km)" or "Max weight (kg)"
}
export interface SessionCompareRowWithCells extends SessionCompareRow {
  cells: SessionCompareCell[];
}
export interface SessionCompareResult {
  name: string;
  type: Session["type"];
  sessions: { id: string; date: string }[]; // chronological, the comparison's columns
  rows: SessionCompareRowWithCells[];
}

// Builds the comparison table for one repeat group - pass it exactly
// the sessions in that group (RepeatSessionGroup.sessions ids), not the
// athlete's whole history.
export function compareSessionGroup(groupSessions: Session[]): SessionCompareResult {
  const sorted = [...groupSessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const sessionsMeta = sorted.map((s) => ({ id: s.id, date: s.date }));
  const name = sorted[0]?.name ?? "";
  const type = sorted[0]?.type ?? "strength";

  if (type === "hyrox" || type === "cardio") {
    // Reuses the exact same per-exercise/modality grouping and
    // unit-normalising aggregation the Training Load Report's trend
    // lines use (0076) - scoped to just this small set of sessions
    // instead of the athlete's whole range, so date collisions (the
    // only risk of matching a row back to a session by date rather
    // than a carried id) would need two same-named sessions on the
    // exact same date, which can't happen for one athlete in practice.
    const { summaries } = collectCardioMetrics(sorted);
    const dateToId = new Map(sorted.map((s) => [s.date, s.id]));
    const rows: SessionCompareRowWithCells[] = summaries.map((sum) => ({
      group: sum.group,
      label: `${METRIC_META[sum.key].label}${METRIC_META[sum.key].unit ? ` (${METRIC_META[sum.key].unit})` : ""}`,
      cells: sum.entries.map((e) => ({ sessionId: dateToId.get(e.date) ?? "", date: e.date, value: e.value })),
    }));
    return { name, type, sessions: sessionsMeta, rows };
  }

  // Strength/Power-Speed - same tonnage/max-weight logic as the main
  // exMap build above (each-side doubling, per-set logged reps over
  // the exercise's prescribed reps), just scoped to this group and
  // split into two rows per exercise instead of one.
  const maxRows = new Map<string, SessionCompareRowWithCells>();
  const ttlRows = new Map<string, SessionCompareRowWithCells>();
  for (const s of sorted) {
    for (const ex of s.exercises ?? []) {
      if (!ex.name || ex.is_primer) continue;
      const done = (ex.log ?? []).filter((l) => parseFloat(l.weight) > 0);
      if (!done.length) continue;
      const prescribedReps = parseInt(ex.reps) || 0;
      const perSetReps = done.map((l) => parseInt(l.reps) || prescribedReps);
      const weights = done.map((l) => parseFloat(l.weight));
      const sideMultiplier = ex.each_side ? 2 : 1;
      const ttl = done.reduce((sum, l, i) => sum + (parseFloat(l.weight) || 0) * (perSetReps[i] || 0), 0) * sideMultiplier;
      const maxWeight = Math.max(...weights);
      const bestSetIdx = weights.indexOf(maxWeight);

      if (!maxRows.has(ex.name)) maxRows.set(ex.name, { group: ex.name, label: "Best set", cells: [] });
      maxRows.get(ex.name)!.cells.push({
        sessionId: s.id, date: s.date, value: maxWeight,
        display: `${maxWeight}kg × ${perSetReps[bestSetIdx] || "?"}`,
      });

      if (!ttlRows.has(ex.name)) ttlRows.set(ex.name, { group: ex.name, label: "Total Training Load (kg)", cells: [] });
      ttlRows.get(ex.name)!.cells.push({ sessionId: s.id, date: s.date, value: Math.round(ttl) });
    }
  }
  // Interleave so each exercise's two rows sit together rather than all
  // "Best set" rows then all "TTL" rows.
  const rows: SessionCompareRowWithCells[] = [];
  for (const name of maxRows.keys()) {
    rows.push(maxRows.get(name)!);
    if (ttlRows.has(name)) rows.push(ttlRows.get(name)!);
  }
  return { name, type, sessions: sessionsMeta, rows };
}
