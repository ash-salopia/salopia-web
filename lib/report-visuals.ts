// Visual summary for the Training Report: headline numbers (with the
// previous period alongside for comparison), a day-by-day consistency
// calendar, weekly session counts by type and the PBs set in range.
// Pure and Supabase-free like report-calc.ts; generateReport fetches
// the inputs and attaches the result as ReportData.visual.

import type { Session } from "@/types";
import { sessionHasCompletion, weekStartISO } from "@/lib/report-calc";

export type VisualSessionType = "strength" | "power_speed" | "cardio" | "hyrox" | "other";
export type DayStatus = "done" | "partial" | "missed" | "upcoming" | "rest";

export interface ReportPB {
  exercise: string;
  date: string;
  kind: "weight" | "bw_reps" | "bw_time";
  weightKg: number | null;
  reps: number | null;
  timeSeconds: number | null;
}

export interface Headline {
  sessionsCompleted: number;
  sessionsAssigned: number; // coach-programmed sessions due by today
  completionPct: number | null; // sessions, not sets; null when nothing was assigned
  pbCount: number;
  avgRpe: number | null;
  totalTonnageKg: number;
}

export interface CalendarDay {
  date: string;
  status: DayStatus;
  sessions: number;
}

export interface WeeklySessions {
  weekStart: string;
  completed: Record<VisualSessionType, number>;
  missed: number;
  avgRpe: number | null;
}

export interface VisualSummary {
  headline: Headline;
  previous: Headline | null; // same-length period immediately before, when the range is bounded
  days: CalendarDay[]; // capped to the last CALENDAR_MAX_DAYS of the range
  weekly: WeeklySessions[];
  pbs: ReportPB[]; // newest first
}

const CALENDAR_MAX_DAYS = 26 * 7;

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Days between two ISO dates, inclusive. */
export function daySpan(start: string, end: string): number {
  return Math.round((Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) / 86400000) + 1;
}

/** The same-length window ending the day before `start`. */
export function previousRange(start: string, end: string): { start: string; end: string } {
  const len = daySpan(start, end);
  const prevEnd = addDays(start, -1);
  return { start: addDays(prevEnd, -(len - 1)), end: prevEnd };
}

// Sessions that count for consistency: real ones (not athlete-started
// Session Library sessions, not warm-up primers).
function countable(sessions: Session[]): Session[] {
  return sessions.filter((s) => s.session_source !== "library" && !s.is_primer && !!s.date);
}

// Engaged with at all. sessionHasCompletion covers the four tracked
// types; recovery/sport sessions count once anything was logged.
// An athlete-added session is done by definition.
function isDone(s: Session): boolean {
  if (s.session_source === "athlete_logged") return true;
  if (sessionHasCompletion(s)) return true;
  if (s.rpe != null || s.duration_min != null) return true;
  return (s.exercises ?? []).some((ex) => (ex.log ?? []).some((l) => l.done));
}

function typeOf(s: Session): VisualSessionType {
  return s.type === "strength" || s.type === "power_speed" || s.type === "cardio" || s.type === "hyrox" ? s.type : "other";
}

// Tonnage with the same rules as computeReport's TTL: weight × each
// set's own reps (falling back to the prescribed reps), doubled for
// each-side exercises, primers excluded.
function tonnage(sessions: Session[]): number {
  let total = 0;
  for (const s of sessions) {
    if (s.type !== "strength" || s.is_primer) continue;
    for (const ex of s.exercises ?? []) {
      if (ex.is_primer) continue;
      const prescribed = parseInt(ex.reps) || 0;
      let exTotal = 0;
      for (const set of ex.log ?? []) {
        const w = parseFloat(set.weight);
        if (!(w > 0)) continue;
        exTotal += w * (parseInt(set.reps) || prescribed);
      }
      total += exTotal * (ex.each_side ? 2 : 1);
    }
  }
  return Math.round(total);
}

export function computeHeadline(allSessions: Session[], pbCount: number, today: string): Headline {
  const sessions = countable(allSessions).filter((s) => s.date <= today);
  const assigned = sessions.filter((s) => s.session_source === "programme");
  const completed = sessions.filter(isDone);
  const rpes = sessions.map((s) => s.rpe).filter((r): r is number => r != null);
  return {
    sessionsCompleted: completed.length,
    sessionsAssigned: assigned.length,
    completionPct: assigned.length ? Math.round((assigned.filter(isDone).length / assigned.length) * 100) : null,
    pbCount,
    avgRpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null,
    totalTonnageKg: tonnage(sessions),
  };
}

export function computeVisualSummary(input: {
  sessions: Session[];
  rangeStart: string | null;
  rangeEnd: string | null;
  pbs: ReportPB[];
  previousSessions: Session[] | null;
  previousPbCount: number | null;
  today: string;
}): VisualSummary {
  const { sessions, pbs, today } = input;
  const real = countable(sessions);

  // Calendar span: the explicit range, else first→last session. Capped
  // so "All time" doesn't draw years of squares.
  const dates = real.map((s) => s.date).sort();
  let start = input.rangeStart ?? dates[0] ?? today;
  // Never past today: future programmed sessions aren't part of a
  // report on what happened.
  const end = input.rangeEnd && input.rangeEnd < today ? input.rangeEnd : today;
  if (daySpan(start, end) > CALENDAR_MAX_DAYS) start = addDays(end, -(CALENDAR_MAX_DAYS - 1));

  const byDate: Record<string, Session[]> = {};
  for (const s of real) (byDate[s.date] ??= []).push(s);

  const days: CalendarDay[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const list = byDate[d] ?? [];
    let status: DayStatus = "rest";
    if (list.length) {
      const done = list.filter(isDone).length;
      if (done === list.length) status = "done";
      else if (done > 0) status = "partial";
      else status = d > today ? "upcoming" : d === today ? "upcoming" : "missed";
    }
    days.push({ date: d, status, sessions: list.length });
  }

  const weeks: Record<string, WeeklySessions & { rpes: number[] }> = {};
  for (let d = weekStartISO(start); d <= end; d = addDays(d, 7)) {
    weeks[d] = { weekStart: d, completed: { strength: 0, power_speed: 0, cardio: 0, hyrox: 0, other: 0 }, missed: 0, avgRpe: null, rpes: [] };
  }
  for (const s of real) {
    if (s.date < start || s.date > end) continue;
    const w = weeks[weekStartISO(s.date)];
    if (!w) continue;
    if (isDone(s)) w.completed[typeOf(s)]++;
    else if (s.date < today && s.session_source === "programme") w.missed++;
    if (s.rpe != null) w.rpes.push(s.rpe);
  }
  const weekly = Object.values(weeks)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map(({ rpes, ...w }) => ({ ...w, avgRpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null }));

  return {
    headline: computeHeadline(sessions, pbs.length, today),
    previous: input.previousSessions ? computeHeadline(input.previousSessions, input.previousPbCount ?? 0, today) : null,
    days,
    weekly,
    pbs: [...pbs].sort((a, b) => b.date.localeCompare(a.date)),
  };
}
