// Pure data transforms for the Training Load Report — no Supabase
// imports here on purpose, so this same logic can run from both the
// browser (lib/data/reports.ts, RLS via the coach's session) and the
// AI summary API route (server-side, RLS via the coach's cookie),
// without either environment pulling in the other's client.
import type { Session } from "@/types";

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
  };
}
