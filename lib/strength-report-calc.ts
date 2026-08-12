// Pure data transforms for the Strength (e1RM) report — mirrors
// lib/report-calc.ts's shape (session -> exercise map -> weekly
// aggregation -> summaries -> highlights) but computes an estimated
// 1RM per session instead of tonnage. No Supabase imports here on
// purpose, same reasoning as report-calc.ts: this runs from both the
// browser (lib/data/reports.ts) and the AI summary API route
// (server-side), without either pulling in the other's client.
//
// report-calc.ts itself is left untouched — this is a parallel,
// independent module so the existing TTL report's output can never
// regress from this work.
import type { Session } from "@/types";
import { estimateOneRM, type OneRMFormula } from "@/lib/one-rm";

export interface StrengthRow {
  date: string;
  sessName: string;
  sets: number;
  reps: number; // reps of the winning (best-e1RM) set
  weight: number; // weight of the winning set
  e1rm: number;
  lowConfidence: boolean; // winning set's reps exceeded the configured cap
  eachSide: boolean;
}

export type StrengthExerciseMap = Record<string, StrengthRow[]>;

export interface StrengthExerciseSummary {
  name: string;
  entries: StrengthRow[];
  overallPct: number | null; // e1RM % change, first session vs latest
}

export interface StrengthWeeklyPoint {
  weekStart: string; // Monday of that week, ISO date
  // Peak (not average) e1RM among sessions logged that week — unlike
  // tonnage, an estimated 1RM isn't meaningful to average across
  // sessions; the week's peak is the best indicator of that week's
  // strength level.
  e1rm: number;
  sets: number; // average sets across sessions logged that week
  sessionCount: number;
}

export type StrengthWeeklyMap = Record<string, StrengthWeeklyPoint[]>;

export interface ComputedStrengthReport {
  exMap: StrengthExerciseMap;
  exerciseSummaries: StrengthExerciseSummary[]; // alphabetical
  weeklyExMap: StrengthWeeklyMap;
  topProgressed: StrengthExerciseSummary[]; // up to 3, biggest positive overallPct
  toReview: StrengthExerciseSummary[]; // up to 3, smallest/most negative overallPct
}

function weekStartISO(dateISO: string): string {
  const d = new Date(dateISO + "T12:00:00Z");
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
}

function buildWeeklyMap(exMap: StrengthExerciseMap): StrengthWeeklyMap {
  const weekly: StrengthWeeklyMap = {};
  for (const [name, rows] of Object.entries(exMap)) {
    const byWeek = new Map<string, StrengthRow[]>();
    for (const r of rows) {
      const wk = weekStartISO(r.date);
      if (!byWeek.has(wk)) byWeek.set(wk, []);
      byWeek.get(wk)!.push(r);
    }
    weekly[name] = Array.from(byWeek.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([weekStart, rs]) => ({
        weekStart,
        e1rm: Math.max(...rs.map((r) => r.e1rm)),
        sets: Math.round(rs.reduce((s, r) => s + r.sets, 0) / rs.length),
        sessionCount: rs.length,
      }));
  }
  return weekly;
}

function summarize(exMap: StrengthExerciseMap): StrengthExerciseSummary[] {
  return Object.entries(exMap)
    .map(([name, entries]) => {
      const first = entries[0];
      const last = entries[entries.length - 1];
      const overallPct =
        entries.length >= 2 && first.e1rm > 0 ? ((last.e1rm - first.e1rm) / first.e1rm) * 100 : null;
      return { name, entries, overallPct };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Best estimated 1RM among a session's completed sets for one
// exercise, keeping the winning set's own weight/reps for display and
// for the low-confidence check — bestEstimatedOneRM() in lib/one-rm.ts
// only returns the number, not which set produced it.
function winningSet(
  log: Array<{ weight: string; reps: string; done: boolean }>,
  prescribedReps: number,
  formula: OneRMFormula
): { weight: number; reps: number; e1rm: number } | null {
  let best: { weight: number; reps: number; e1rm: number } | null = null;
  for (const set of log) {
    if (!set.done) continue;
    const w = parseFloat(set.weight);
    if (isNaN(w) || w <= 0) continue;
    const r = parseInt(set.reps) || prescribedReps || 1;
    const est = estimateOneRM(w, r, formula);
    if (est !== null && (best === null || est > best.e1rm)) {
      best = { weight: w, reps: r, e1rm: est };
    }
  }
  return best;
}

export function computeStrengthReport(
  allSessions: Session[],
  formula: OneRMFormula,
  lowConfidenceCap: number = 12
): ComputedStrengthReport {
  // Same session/exercise filtering as computeReport() in
  // report-calc.ts, kept independent rather than shared/imported so
  // neither report can regress the other.
  const strSessions = allSessions
    .filter((s) => s.type === "strength")
    .filter((s) => (s.exercises ?? []).some((e) => (e.log ?? []).some((l) => parseFloat(l.weight) > 0)));

  const exMap: StrengthExerciseMap = {};

  for (const sess of strSessions) {
    if (sess.is_primer) continue;
    for (const ex of sess.exercises ?? []) {
      if (!ex.name || ex.is_primer) continue;
      const prescribedReps = parseInt(ex.reps) || 0;
      const win = winningSet(ex.log ?? [], prescribedReps, formula);
      if (!win) continue;

      const sets = (ex.log ?? []).filter((s) => parseFloat(s.weight) > 0).length;

      if (!exMap[ex.name]) exMap[ex.name] = [];
      exMap[ex.name].push({
        date: sess.date,
        sessName: sess.name,
        sets,
        reps: win.reps,
        weight: win.weight,
        e1rm: win.e1rm,
        lowConfidence: win.reps > lowConfidenceCap,
        eachSide: !!ex.each_side,
      });
    }
  }

  const exerciseSummaries = summarize(exMap);
  const withTrend = exerciseSummaries.filter((e) => e.overallPct != null);
  const topProgressed = [...withTrend].sort((a, b) => (b.overallPct ?? 0) - (a.overallPct ?? 0)).slice(0, 3);
  const toReview = [...withTrend].sort((a, b) => (a.overallPct ?? 0) - (b.overallPct ?? 0)).slice(0, 3);

  return {
    exMap,
    exerciseSummaries,
    weeklyExMap: buildWeeklyMap(exMap),
    topProgressed,
    toReview,
  };
}
