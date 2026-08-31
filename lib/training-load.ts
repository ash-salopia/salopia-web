// 0088 — Training-load / return-to-play monitoring.
//
// Pure, Supabase-free module (runs in the browser and in the AI route), same
// rules as lib/report-calc.ts. Turns athlete-logged session RPE + duration into
// Foster's sRPE load, then derives ACWR, weekly load spikes, and monotony /
// strain. One direction of import only — helpers come FROM report-calc, nothing
// here is imported back into it (loadMonitoring is attached in
// lib/data/reports.ts, not inside computeReport).

import type { Session, SessionType } from "@/types";
import { estimateSessionDurationMinutes, weekStartISO } from "@/lib/report-calc";

// Recovery is deliberately excluded (as it is from collectRPE). 'library'
// sessions never reach here — the report/dashboard queries filter them out.
export const LOAD_TYPES: SessionType[] = ["strength", "power_speed", "hyrox", "cardio", "sport"];

// Foster monotony above this reads as "too samey — add variation".
export const MONOTONY_HIGH = 2.0;

// ── Date helpers ──────────────────────────────────────────────────────────────

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T12:00:00Z").getTime();
  const db = new Date(b + "T12:00:00Z").getTime();
  return Math.round((db - da) / 86_400_000);
}

// ── Per-session load ──────────────────────────────────────────────────────────

// Real logged minutes win; for hyrox/cardio fall back to the structural
// estimate so those existing sessions still contribute. Everything else needs
// an actual duration or it contributes nothing.
export function sessionDurationMin(s: Session): number | null {
  if (s.duration_min != null && s.duration_min > 0) return s.duration_min;
  if (s.type === "hyrox" || s.type === "cardio") {
    const est = estimateSessionDurationMinutes(s);
    return est != null && est > 0 ? est : null;
  }
  return null;
}

export interface SessionLoad {
  date: string;
  sessName: string;
  type: SessionType;
  rpe: number;
  minutes: number;
  load: number; // Foster sRPE = rpe × minutes, rounded
}

export function sessionLoad(s: Session): SessionLoad | null {
  if (s.is_primer || s.rpe == null || !LOAD_TYPES.includes(s.type)) return null;
  const minutes = sessionDurationMin(s);
  if (minutes == null || minutes <= 0) return null;
  return { date: s.date, sessName: s.name, type: s.type, rpe: s.rpe, minutes, load: Math.round(s.rpe * minutes) };
}

// RPE'd load-type sessions dropped purely because no duration is known — shown
// as a footnote so a coach knows the load figure is incomplete, not zero.
export function countExcludedNoDuration(sessions: Session[]): number {
  let n = 0;
  for (const s of sessions) {
    if (s.is_primer || s.rpe == null || !LOAD_TYPES.includes(s.type)) continue;
    const minutes = sessionDurationMin(s);
    if (minutes == null || minutes <= 0) n++;
  }
  return n;
}

// ── Series ────────────────────────────────────────────────────────────────────

export interface DailyLoadPoint {
  date: string;
  load: number;
}

// Zero-filled across the whole range so rolling windows and SD are correct.
export function dailyLoads(sessions: Session[], rangeStart: string, rangeEnd: string): DailyLoadPoint[] {
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    const sl = sessionLoad(s);
    if (!sl || sl.date < rangeStart || sl.date > rangeEnd) continue;
    byDay.set(sl.date, (byDay.get(sl.date) ?? 0) + sl.load);
  }
  const span = daysBetween(rangeStart, rangeEnd);
  if (span < 0) return [];
  const out: DailyLoadPoint[] = [];
  for (let i = 0; i <= span; i++) {
    const date = addDaysISO(rangeStart, i);
    out.push({ date, load: byDay.get(date) ?? 0 });
  }
  return out;
}

export interface WeeklyLoadPoint {
  weekStart: string; // Monday ISO
  load: number; // summed
  sessionCount: number;
}

export function weeklyLoads(sessions: Session[]): WeeklyLoadPoint[] {
  const byWeek = new Map<string, { load: number; count: number }>();
  for (const s of sessions) {
    const sl = sessionLoad(s);
    if (!sl) continue;
    const wk = weekStartISO(sl.date);
    const cur = byWeek.get(wk) ?? { load: 0, count: 0 };
    cur.load += sl.load;
    cur.count += 1;
    byWeek.set(wk, cur);
  }
  return Array.from(byWeek.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([weekStart, v]) => ({ weekStart, load: v.load, sessionCount: v.count }));
}

// ── ACWR (coupled rolling ratio) ──────────────────────────────────────────────

export type AcwrBand = "detrain" | "sweet" | "spike";

export interface AcwrPoint {
  date: string;
  acute: number; // last 7 days' load
  chronic: number; // last 28 days' load, expressed as a weekly rate
  acwr: number | null; // acute ÷ chronic; null before 21 days of history or with no chronic load
  band: AcwrBand | null;
}

export function acwrSeries(daily: DailyLoadPoint[], opts: { low: number; high: number }): AcwrPoint[] {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return daily.map((d, i) => {
    const acute = sum(daily.slice(Math.max(0, i - 6), i + 1).map((x) => x.load));
    const chronicStart = Math.max(0, i - 27);
    const chronicDays = i - chronicStart + 1;
    const chronic = sum(daily.slice(chronicStart, i + 1).map((x) => x.load)) / (chronicDays / 7);
    let acwr: number | null = null;
    let band: AcwrBand | null = null;
    if (i >= 20 && chronic > 0) {
      acwr = Math.round((acute / chronic) * 100) / 100;
      band = acwr < opts.low ? "detrain" : acwr > opts.high ? "spike" : "sweet";
    }
    return { date: d.date, acute: Math.round(acute), chronic: Math.round(chronic), acwr, band };
  });
}

// ── Weekly load spike ─────────────────────────────────────────────────────────

export interface WeekSpike {
  weekStart: string;
  load: number;
  baseline: number | null; // mean of up to 4 preceding weeks
  changePct: number | null;
  flagged: boolean;
}

export function weeklySpikes(weekly: WeeklyLoadPoint[], thresholdPct: number): WeekSpike[] {
  return weekly.map((w, idx) => {
    const prev = weekly.slice(Math.max(0, idx - 4), idx);
    if (prev.length === 0) return { weekStart: w.weekStart, load: w.load, baseline: null, changePct: null, flagged: false };
    const baseline = prev.reduce((a, b) => a + b.load, 0) / prev.length;
    if (baseline <= 0) return { weekStart: w.weekStart, load: w.load, baseline: 0, changePct: null, flagged: false };
    const changePct = Math.round(((w.load - baseline) / baseline) * 100);
    return { weekStart: w.weekStart, load: w.load, baseline: Math.round(baseline), changePct, flagged: changePct > thresholdPct };
  });
}

// ── Monotony & strain (Foster) ────────────────────────────────────────────────

export interface WeekMonotony {
  weekStart: string;
  meanDaily: number;
  sdDaily: number;
  monotony: number | null; // meanDailyLoad ÷ SD; null if <3 training days or SD 0
  strain: number | null; // weeklyLoad × monotony
}

export function weeklyMonotonyStrain(daily: DailyLoadPoint[]): WeekMonotony[] {
  const byWeek = new Map<string, number[]>();
  for (const d of daily) {
    const wk = weekStartISO(d.date);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk)!.push(d.load);
  }
  return Array.from(byWeek.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([weekStart, loads]) => {
      const mean = loads.reduce((a, b) => a + b, 0) / loads.length;
      const variance = loads.reduce((a, b) => a + (b - mean) ** 2, 0) / loads.length;
      const sd = Math.sqrt(variance);
      const weekLoad = loads.reduce((a, b) => a + b, 0);
      const monotony = loads.length >= 3 && sd > 0 ? mean / sd : null;
      return {
        weekStart,
        meanDaily: Math.round(mean),
        sdDaily: Math.round(sd * 10) / 10,
        monotony: monotony != null ? Math.round(monotony * 100) / 100 : null,
        strain: monotony != null ? Math.round(weekLoad * monotony) : null,
      };
    });
}

// ── Aggregate (attached to ReportData in lib/data/reports.ts) ─────────────────

export interface LoadMonitoringResult {
  daily: DailyLoadPoint[];
  weekly: WeeklyLoadPoint[];
  acwr: AcwrPoint[];
  spikes: WeekSpike[];
  monotony: WeekMonotony[];
  excludedNoDuration: number;
  latestAcwr: AcwrPoint | null; // most recent point that has a ratio
}

export function computeLoadMonitoring(
  sessions: Session[],
  rangeStart: string,
  rangeEnd: string,
  opts: { acwrLow: number; acwrHigh: number; spikePct: number }
): LoadMonitoringResult {
  const inRange = sessions.filter((s) => s.date >= rangeStart && s.date <= rangeEnd);
  const daily = dailyLoads(inRange, rangeStart, rangeEnd);
  const weekly = weeklyLoads(inRange);
  const acwr = acwrSeries(daily, { low: opts.acwrLow, high: opts.acwrHigh });
  let latestAcwr: AcwrPoint | null = null;
  for (let i = acwr.length - 1; i >= 0; i--) {
    if (acwr[i].acwr != null) { latestAcwr = acwr[i]; break; }
  }
  return {
    daily,
    weekly,
    acwr,
    spikes: weeklySpikes(weekly, opts.spikePct),
    monotony: weeklyMonotonyStrain(daily),
    excludedNoDuration: countExcludedNoDuration(inRange),
    latestAcwr,
  };
}

export const ACWR_BAND_LABEL: Record<AcwrBand, string> = {
  detrain: "below the sweet spot — possible detraining",
  sweet: "in the sweet spot",
  spike: "above the sweet spot — injury risk climbs",
};
