// Pure data transforms for the Squad Report - ranks a group's athletes
// against each other, given each athlete's already-computed ReportData
// (same shape the single-athlete report and bulk PDF export use, via
// lib/data/reports.ts's generateReport). No Supabase imports, same
// reasoning as report-calc.ts/strength-report-calc.ts: this only
// aggregates numbers those modules already produced.
//
// Every board is capped to Top 5 (per spec) via topN().
//
// Two boards per metric:
//  - "Standing": absolute value right now - summed tonnage for TTL (a
//    true cumulative load metric). e1RM has no squad-wide "standing"
//    of its own here - comparing each athlete's own best lift, whatever
//    exercise that happens to be, isn't a real comparison (a coach
//    asking "who's strongest" means one named lift, e.g. Back Squat).
//    That's computeExerciseBoard below, driven by the coach's exercise
//    search, not this function.
//  - "Most improved": each athlete's single best-progressed exercise
//    (their own topProgressed[0], already computed by
//    computeReport/computeStrengthReport) - not an average across all
//    their exercises, so one standout lift can't get diluted by
//    exercises they've barely touched, and it mirrors the "Top
//    progressed" highlight already shown on the individual report.
//
// Completion boards use ReportData.completionPct (report-calc.ts) - %
// of prescribed sets marked done across coach-assigned sessions in
// range. "To watch" is the same list read ascending, not a different
// computation - a coach at 0% (assigned sessions, nothing logged) is
// exactly who that board exists to surface, so it isn't excluded the
// way a "no data at all" athlete is from the other boards.
//
// The exercise-specific board (computeExerciseBoard) is a separate
// entry point, not part of computeSquadReport's output, since it needs
// a coach-chosen exercise name picked interactively after the squad
// report has already loaded - see availableExercises().
import type { ReportData } from "@/lib/data/reports";
import { METRIC_META, type MetricKey } from "@/lib/cardio-metrics";

const TOP_N = 5;
function topN<T>(rows: T[]): T[] {
  return rows.slice(0, TOP_N);
}

export interface SquadStandingRow {
  athleteId: string;
  athleteName: string;
  value: number; // kg (or ×BW if bodyweightRelative, for e1RM)
  exerciseName?: string; // e1RM standing only - which lift produced the value
  exerciseCount: number; // exercises with logged data in range
}

export interface SquadImprovedRow {
  athleteId: string;
  athleteName: string;
  exerciseName: string;
  pct: number;
}

export interface SquadCompletionRow {
  athleteId: string;
  athleteName: string;
  pct: number;
  completedSessions: number;
  totalSessions: number;
}

// 0088 — completion across every session type, not just strength. This
// board (and the matrix's Completion column) previously read
// ReportData.completionPct directly, which only ever counts strength
// SetLog entries (report-calc.ts's collectCompletion) - a Hyrox/Cardio-
// focused squad always showed "no data" here even though the
// individual report's own "Sessions Logged & Completion" section
// (0080) has counted those types correctly for a while. Sums sessions
// logged vs prescribed across all 4 types via the same per-type stats
// that section already computes.
function combinedCompletion(data: ReportData): { pct: number | null; completed: number; total: number } {
  const stats = Object.values(data.sessionTypeStats);
  const completed = stats.reduce((sum, s) => sum + s.completedCount, 0);
  const total = stats.reduce((sum, s) => sum + s.prescribedCount, 0);
  return { pct: total > 0 ? Math.round((completed / total) * 1000) / 10 : null, completed, total };
}

export interface SquadReport {
  ttlStanding: SquadStandingRow[];
  ttlImproved: SquadImprovedRow[];
  e1rmImproved: SquadImprovedRow[];
  completionTop: SquadCompletionRow[];
  completionWatch: SquadCompletionRow[];
}

export interface SquadAthleteInput {
  athleteId: string;
  athleteName: string;
  data: ReportData;
}

export function computeSquadReport(
  athletes: SquadAthleteInput[],
  {
    includeTtl,
    includeE1rm,
    includeCompletion,
    bodyweightRelative,
  }: { includeTtl: boolean; includeE1rm: boolean; includeCompletion: boolean; bodyweightRelative: boolean }
): SquadReport {
  const ttlStanding: SquadStandingRow[] = [];
  const ttlImproved: SquadImprovedRow[] = [];
  const e1rmImproved: SquadImprovedRow[] = [];
  const completion: SquadCompletionRow[] = [];

  for (const { athleteId, athleteName, data } of athletes) {
    if (includeTtl) {
      const exNames = Object.keys(data.exMap);
      if (exNames.length > 0) {
        const total = exNames.reduce((sum, name) => sum + data.exMap[name].reduce((s, row) => s + row.ttl, 0), 0);
        ttlStanding.push({ athleteId, athleteName, value: total, exerciseCount: exNames.length });
      }
      const top = data.topProgressed[0];
      if (top) ttlImproved.push({ athleteId, athleteName, exerciseName: top.name, pct: top.overallPct ?? 0 });
    }

    if (includeE1rm) {
      const top = data.strength.topProgressed[0];
      if (top) e1rmImproved.push({ athleteId, athleteName, exerciseName: top.name, pct: top.overallPct ?? 0 });
    }

    if (includeCompletion) {
      const c = combinedCompletion(data);
      if (c.pct != null) completion.push({ athleteId, athleteName, pct: c.pct, completedSessions: c.completed, totalSessions: c.total });
    }
  }

  ttlStanding.sort((a, b) => b.value - a.value);
  ttlImproved.sort((a, b) => b.pct - a.pct);
  e1rmImproved.sort((a, b) => b.pct - a.pct);
  const completionTop = [...completion].sort((a, b) => b.pct - a.pct);
  const completionWatch = [...completion].sort((a, b) => a.pct - b.pct);

  return {
    ttlStanding: topN(ttlStanding),
    ttlImproved: topN(ttlImproved),
    e1rmImproved: topN(e1rmImproved),
    completionTop: topN(completionTop),
    completionWatch: topN(completionWatch),
  };
}

// Every exercise with e1RM data for at least one squad member -
// populates the exercise-specific board's search box. Computed from
// the same already-fetched ReportData, no extra query.
export function availableExercises(athletes: SquadAthleteInput[]): string[] {
  const names = new Set<string>();
  for (const { data } of athletes) {
    Object.keys(data.strength.exMap).forEach((n) => names.add(n));
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

// Top 5 current e1RM for one named exercise, squad-wide - e.g. "Back
// Squat e1RM standings". Case-insensitive exact match, since exercise
// names are free text entered per-athlete and a coach searching
// "back squat" shouldn't miss "Back squat" logged on another athlete.
export function computeExerciseBoard(
  athletes: SquadAthleteInput[],
  exerciseName: string,
  bodyweightRelative: boolean
): SquadStandingRow[] {
  const target = exerciseName.trim().toLowerCase();
  if (!target) return [];
  const rows: SquadStandingRow[] = [];
  for (const { athleteId, athleteName, data } of athletes) {
    const match = Object.keys(data.strength.exMap).find((n) => n.toLowerCase() === target);
    if (!match) continue;
    const entries = data.strength.exMap[match];
    const latest = entries[entries.length - 1].e1rm;
    const value = bodyweightRelative && data.bodyweightKg ? latest / data.bodyweightKg : latest;
    rows.push({ athleteId, athleteName, value, exerciseCount: 1 });
  }
  rows.sort((a, b) => b.value - a.value);
  return topN(rows);
}

// Union of power/speed exercise names logged anywhere in the squad,
// same "search + tick, one board per tick" UI as the e1RM boards above
// - mirrors availableExercises() but reads powerSpeedExMap instead of
// strength.exMap.
export function availablePowerSpeedExercises(athletes: SquadAthleteInput[]): string[] {
  const names = new Set<string>();
  for (const { data } of athletes) {
    Object.keys(data.powerSpeedExMap).forEach((n) => names.add(n));
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export interface SquadPowerSpeedBoard {
  rows: SquadStandingRow[];
  unit: string;
  direction: "lower" | "higher";
}

// "Current standing" for one named power/speed exercise, squad-wide -
// same latest-value convention as computeExerciseBoard's e1RM board
// (not best-ever), just sorted by direction since a lower time is the
// win for sprints/shuttles but a higher jump/throw is the win for
// plyometrics. unit/direction come from whichever athlete's data
// matched first - every athlete logging the same exercise name shares
// the same measurement type in practice (same builder, same field).
export function computePowerSpeedBoard(athletes: SquadAthleteInput[], exerciseName: string): SquadPowerSpeedBoard | null {
  const target = exerciseName.trim().toLowerCase();
  if (!target) return null;
  const rows: SquadStandingRow[] = [];
  let unit: string | null = null;
  let direction: "lower" | "higher" = "higher";
  for (const { athleteId, athleteName, data } of athletes) {
    const match = Object.keys(data.powerSpeedExMap).find((n) => n.toLowerCase() === target);
    if (!match) continue;
    const entries = data.powerSpeedExMap[match];
    const latest = entries[entries.length - 1];
    if (unit === null) {
      unit = latest.unit;
      direction = unit === "s" ? "lower" : "higher";
    }
    rows.push({ athleteId, athleteName, value: latest.value, exerciseCount: 1 });
  }
  if (!rows.length || unit === null) return null;
  rows.sort((a, b) => (direction === "lower" ? a.value - b.value : b.value - a.value));
  return { rows: topN(rows), unit, direction };
}

// 0089 — Cardio/Hyrox exercise board: same "coach picks one, squad gets
// ranked on it" pattern as the e1RM/Power-Speed boards above, but
// deliberately NOT a blanket "total cardio distance" or "total hyrox
// output" standing board - Row done as a Fixed-Workout time trial and
// Row done as 40s Cycling-Interval reps aren't the same protocol and
// summing across them the way TTL sums across exercises would produce
// the exact misleading number report-calc.ts's collectCardioMetrics
// grouping fix (0084) corrected for the individual report. Instead the
// coach picks one specific (session type, metric, exercise/modality)
// triple and only that gets ranked - reusing the already sub-type-
// disambiguated cardioMetricSummaries groups (0084) as the option list,
// so this can never reintroduce that bug.
export interface SquadCardioMetricOption {
  sessionType: "hyrox" | "cardio";
  key: MetricKey;
  group: string; // already carries the sub-type suffix where relevant, e.g. "Row (Cycling Intervals)"
}

// Union of every (sessionType, metric key, group) combo logged anywhere
// in the squad - populates the Cardio/Hyrox exercise board's picker.
export function availableCardioHyroxMetrics(athletes: SquadAthleteInput[]): SquadCardioMetricOption[] {
  const seen = new Map<string, SquadCardioMetricOption>();
  for (const { data } of athletes) {
    for (const m of data.cardioMetricSummaries) {
      const id = `${m.sessionType}::${m.key}::${m.group}`;
      if (!seen.has(id)) seen.set(id, { sessionType: m.sessionType, key: m.key, group: m.group });
    }
  }
  return Array.from(seen.values()).sort(
    (a, b) => a.sessionType.localeCompare(b.sessionType) || a.group.localeCompare(b.group) || a.key.localeCompare(b.key)
  );
}

// Stable, searchable id for one option - "hyrox::distance::Row (Cycling Intervals)".
export function cardioMetricOptionId(o: SquadCardioMetricOption): string {
  return `${o.sessionType}::${o.key}::${o.group}`;
}

// Lower is genuinely the win for these - pace/duration on a task means
// "finished faster", HR means "same output for less strain". Everything
// else (distance, watts, reps, rounds, calories, load...) defaults to
// higher-is-better.
const LOWER_IS_BETTER: MetricKey[] = ["duration", "pace", "avg_hr", "max_hr"];

export interface SquadCardioBoard {
  rows: SquadStandingRow[];
  unit: string;
  direction: "lower" | "higher";
}

// Current standing (latest logged value, not an average) for one exact
// (sessionType, key, group) triple, squad-wide. Exact match only -
// group names here are machine-generated, already-disambiguated labels
// (not coach-typed free text), so fuzzy matching would risk silently
// merging two different protocols back together.
export function computeCardioExerciseBoard(
  athletes: SquadAthleteInput[],
  option: SquadCardioMetricOption
): SquadCardioBoard | null {
  const rows: SquadStandingRow[] = [];
  for (const { athleteId, athleteName, data } of athletes) {
    const match = data.cardioMetricSummaries.find(
      (m) => m.sessionType === option.sessionType && m.key === option.key && m.group === option.group
    );
    if (!match || !match.entries.length) continue;
    const latest = match.entries[match.entries.length - 1];
    rows.push({ athleteId, athleteName, value: latest.value, exerciseCount: 1 });
  }
  if (!rows.length) return null;
  const direction: "lower" | "higher" = LOWER_IS_BETTER.includes(option.key) ? "lower" : "higher";
  rows.sort((a, b) => (direction === "lower" ? a.value - b.value : b.value - a.value));
  return { rows: topN(rows), unit: METRIC_META[option.key].unit, direction };
}

// One row per athlete, every ticked exercise as a value+%-change column
// pair - the "full squad" matrix view (landscape PDF pages), as
// opposed to the Top-5 leaderboards above. Deliberately NOT capped to
// Top 5 and NOT sorted by any single metric - alphabetical by name,
// since this is meant to be scanned as a squad register, not a
// ranking. No single "most improved" summary column (an earlier
// version had one per metric) - every ticked exercise gets its own
// %-change next to its value instead, since a single "best exercise"
// column collapsed away exactly the exercise-by-exercise comparison a
// coach actually wants here.
export interface SquadExerciseCell {
  value: number | null; // kg (TTL) or kg/×BW (e1RM) - null if this athlete has no data for this exercise
  pct: number | null; // % change first vs latest entry in range, null if <2 entries or no data
}

export interface SquadMatrixRow {
  athleteId: string;
  athleteName: string;
  ttlTotal: number | null; // kg, summed across every exercise - null = no strength data logged
  ttlByExercise: Record<string, SquadExerciseCell>; // one entry per requested exercise name
  e1rmByExercise: Record<string, SquadExerciseCell>; // one entry per requested exercise name
  completionPct: number | null;
}

function exerciseCell(
  entries: { ttl?: number; e1rm?: number }[] | undefined,
  metric: "ttl" | "e1rm",
  valueTransform: (v: number) => number
): SquadExerciseCell {
  if (!entries || entries.length === 0) return { value: null, pct: null };
  const values = entries.map((e) => e[metric] as number);
  const value =
    metric === "ttl"
      ? values.reduce((s, v) => s + v, 0) // TTL: total tonnage across the range
      : values[values.length - 1]; // e1RM: current (latest) value, not a sum
  const first = values[0];
  const last = values[values.length - 1];
  const pct = values.length >= 2 && first > 0 ? ((last - first) / first) * 100 : null;
  return { value: valueTransform(value), pct };
}

export function computeSquadMatrix(
  athletes: SquadAthleteInput[],
  exercises: string[],
  bodyweightRelative: boolean
): SquadMatrixRow[] {
  return [...athletes]
    .sort((a, b) => a.athleteName.localeCompare(b.athleteName))
    .map(({ athleteId, athleteName, data }) => {
      const exNames = Object.keys(data.exMap);
      const ttlTotal = exNames.length
        ? exNames.reduce((sum, name) => sum + data.exMap[name].reduce((s, row) => s + row.ttl, 0), 0)
        : null;

      const ttlByExercise: Record<string, SquadExerciseCell> = {};
      const e1rmByExercise: Record<string, SquadExerciseCell> = {};
      for (const name of exercises) {
        const ttlMatch = exNames.find((n) => n.toLowerCase() === name.toLowerCase());
        ttlByExercise[name] = exerciseCell(ttlMatch ? data.exMap[ttlMatch] : undefined, "ttl", (v) => v);

        const e1rmMatch = Object.keys(data.strength.exMap).find((n) => n.toLowerCase() === name.toLowerCase());
        e1rmByExercise[name] = exerciseCell(e1rmMatch ? data.strength.exMap[e1rmMatch] : undefined, "e1rm", (v) =>
          bodyweightRelative && data.bodyweightKg ? v / data.bodyweightKg : v
        );
      }

      return { athleteId, athleteName, ttlTotal, ttlByExercise, e1rmByExercise, completionPct: combinedCompletion(data).pct };
    });
}

// Splits an exercise list into "sheets" of at most 8 - shared
// pagination for the matrix TTL/e1RM pages and the per-athlete trend
// pages. limitTo8=true truncates to the first 8 (the "8 by default"
// checkbox); false paginates the full list, 8 per sheet, for the
// "include all" option. An empty input still yields one empty chunk
// so a caller can render a single sheet with just its non-exercise
// columns (e.g. Athlete + TTL Total) rather than skip the sheet.
export function chunkExercises(exercises: string[], limitTo8: boolean): string[][] {
  const list = limitTo8 ? exercises.slice(0, 8) : exercises;
  if (list.length === 0) return [[]];
  const chunks: string[][] = [];
  for (let i = 0; i < list.length; i += 8) chunks.push(list.slice(i, i + 8));
  return chunks;
}

// Compound-lift keyword heuristic, used only to bias exercise-trend
// auto-selection below - deliberately simple substring matching rather
// than a maintained exercise database, since exercise names are coach
// free text. A best-effort bias, not a guarantee of correctness for
// unusual naming.
const COMPOUND_KEYWORDS = [
  "squat", "deadlift", "bench", "overhead press", "shoulder press", "military press", "push press", "ohp",
  "row", "pull up", "pull-up", "pullup", "chin up", "chin-up", "chinup",
  "clean", "snatch", "jerk", "hip thrust", "lunge",
];
function isCompoundLift(name: string): boolean {
  const lower = name.toLowerCase();
  return COMPOUND_KEYWORDS.some((k) => lower.includes(k));
}

// Full ordered exercise list to trend-chart for one athlete in the
// Squad Report's "Exercise Trends" pages - capping/pagination is a
// separate concern, handled by chunkExercises above once the coach's
// "limit to 8 / include all" choice is known. Two modes:
//  - override.length > 0 (coach ticked specific exercises in the
//    search box, shared with the e1RM matrix columns): use exactly
//    those, filtered to whichever ones this athlete actually has
//    tonnage data for - same list charted for every athlete, but a
//    given athlete's grid may have fewer than the coach ticked.
//  - override empty: this athlete's OWN exercises ordered by tonnage,
//    with compound lifts (squat/deadlift/bench/row/pull-up/press/
//    olympic lifts) placed ahead of accessories at the same tonnage
//    tier - "prioritise compounds, then accessories" - rather than a
//    strict tonnage sort, which could otherwise bury a compound lift
//    behind whatever accessory happened to be heaviest.
export function computeAthleteTrendExercises(data: ReportData, override: string[]): string[] {
  const exNames = Object.keys(data.exMap);
  if (override.length > 0) {
    const byLowerName = new Map(exNames.map((n) => [n.toLowerCase(), n]));
    return override.map((n) => byLowerName.get(n.trim().toLowerCase())).filter((n): n is string => !!n);
  }

  const withTonnage = exNames.map((name) => ({
    name,
    tonnage: data.exMap[name].reduce((sum, row) => sum + row.ttl, 0),
    compound: isCompoundLift(name),
  }));
  const compounds = withTonnage.filter((e) => e.compound).sort((a, b) => b.tonnage - a.tonnage);
  const accessories = withTonnage.filter((e) => !e.compound).sort((a, b) => b.tonnage - a.tonnage);
  return [...compounds, ...accessories].map((e) => e.name);
}
