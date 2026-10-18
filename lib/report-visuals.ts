// Visual summary for the Training Report: headline numbers (with the
// previous period alongside for comparison), a day-by-day consistency
// calendar, weekly session counts by type and the PBs set in range.
// Pure and Supabase-free like report-calc.ts; generateReport fetches
// the inputs and attaches the result as ReportData.visual.

import type { Session } from "@/types";
import { sessionHasCompletion, weekStartISO, findRepeatedSessionGroups, compareSessionGroup, extractMetricEntries } from "@/lib/report-calc";
import { METRIC_META, LOWER_IS_BETTER_METRICS, type MetricKey } from "@/lib/cardio-metrics";

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
  goals: GoalProgress[];
  competitions: UpcomingCompetition[];
  readiness: ReadinessSummary | null;
  adherence: AdherenceRow[];
  benchmarks: BenchmarkGroup[];
  hrZones: HrZoneSplit | null;
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
  goals?: GoalProgress[];
  competitions?: UpcomingCompetition[];
  checkins?: CheckInInput[];
  hrZones?: { zones: { n: number; name: string; hr: { low: number; high: number } | null }[]; maxHrSource: "set" | "estimated" } | null;
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
    goals: input.goals ?? [],
    competitions: input.competitions ?? [],
    readiness: computeReadiness((input.checkins ?? []).filter((c) => c.date >= start && c.date <= end), sessions, weekly),
    adherence: computeAdherence(sessions, today),
    benchmarks: computeBenchmarks(sessions),
    hrZones: input.hrZones ? computeHrZoneSplit(sessions, input.hrZones.zones, input.hrZones.maxHrSource) : null,
  };
}

// ════════════════════════════════════════════════════════════════════
// Coach-value sections: goal progress, upcoming competitions,
// readiness vs training, skipped & swapped exercises, benchmark repeats.
// ════════════════════════════════════════════════════════════════════

export type GoalStatus = "achieved" | "on_track" | "behind" | "overdue" | "in_progress" | "no_data";

export interface GoalProgress {
  id: string;
  label: string;
  tier: "primary" | "secondary" | null;
  kind: "exercise" | "weight" | "time" | "text" | "test";
  unit: string;
  start: number | null;
  current: number | null;
  target: number | null;
  /** 0-1 of the way from start to target, null when not measurable. */
  pct: number | null;
  status: GoalStatus;
  targetDate: string | null;
  daysLeft: number | null;
  /** For goals with no number to track (time / text). */
  note: string | null;
}

export interface GoalInput {
  id: string;
  label: string;
  goal_type: GoalProgress["kind"];
  exercise_name: string | null;
  rep_max: number | null;
  target_kg: number | null;
  target_time: string;
  target_text: string;
  unit: string;
  tier: "primary" | "secondary" | null;
  starred: boolean;
  created_at: string;
  target_date: string | null;
  test_metric_id: string | null;
  start_value: number | null;
  start_value_date: string | null;
  target_value: number | null;
}

/** Weight-bearing PB rows (weight / e1rm lanes): the set that was lifted. */
export interface StrengthPBRow {
  exercise: string;
  date: string;
  weightKg: number | null;
  reps: number | null;
}

function bestLift(rows: StrengthPBRow[], exercise: string, minReps: number, before?: string): number | null {
  const name = exercise.toLowerCase();
  let best: number | null = null;
  for (const r of rows) {
    if (r.exercise.toLowerCase() !== name || r.weightKg == null) continue;
    if ((r.reps ?? 1) < minReps) continue;
    if (before && r.date >= before) continue;
    if (best == null || r.weightKg > best) best = r.weightKg;
  }
  return best;
}

export function computeGoalProgress(input: {
  goals: GoalInput[];
  strengthPbs: StrengthPBRow[];
  testLatest: Record<string, { value: number; date: string }>;
  testLowerIsBetter: Record<string, boolean>;
  today: string;
}): GoalProgress[] {
  const { today } = input;
  const out: GoalProgress[] = [];
  for (const g of input.goals) {
    let start: number | null = null;
    let current: number | null = null;
    let target: number | null = null;
    let lower = false;
    let note: string | null = null;
    let startDate = g.created_at.slice(0, 10);

    if (g.goal_type === "exercise" && g.exercise_name && g.target_kg != null) {
      const reps = Math.max(1, g.rep_max ?? 1);
      target = g.target_kg;
      current = bestLift(input.strengthPbs, g.exercise_name, reps);
      start = bestLift(input.strengthPbs, g.exercise_name, reps, startDate);
    } else if (g.goal_type === "test" && g.test_metric_id && g.target_value != null) {
      target = g.target_value;
      start = g.start_value;
      if (g.start_value_date) startDate = g.start_value_date;
      current = input.testLatest[g.test_metric_id]?.value ?? null;
      lower = !!input.testLowerIsBetter[g.test_metric_id];
    } else if (g.goal_type === "time") {
      note = g.target_time ? `Target: ${g.target_time}` : null;
    } else if (g.goal_type === "weight") {
      note = g.target_kg != null ? `Target: ${g.target_kg}${g.unit ? ` ${g.unit}` : ""}` : null;
    } else {
      note = g.target_text || null;
    }

    let pct: number | null = null;
    let status: GoalStatus = target == null ? "in_progress" : "no_data";
    const daysLeft = g.target_date ? daySpan(today, g.target_date) - 1 : null;

    if (target != null && current != null) {
      const achieved = lower ? current <= target : current >= target;
      const from = start ?? (lower ? null : 0);
      if (from != null && from !== target) pct = Math.max(0, Math.min(1, (current - from) / (target - from)));
      else pct = achieved ? 1 : null;
      if (achieved) {
        status = "achieved";
        pct = 1;
      } else if (g.target_date && daysLeft != null && daysLeft < 0) {
        status = "overdue";
      } else if (g.target_date && pct != null) {
        // Expected progress if it moved in a straight line from when the
        // goal was set to its target date; within 10% of that is on track.
        const total = daySpan(startDate, g.target_date) - 1;
        const elapsed = Math.min(Math.max(daySpan(startDate, today) - 1, 0), Math.max(total, 1));
        const expected = total > 0 ? elapsed / total : 1;
        status = pct >= expected - 0.1 ? "on_track" : "behind";
      } else {
        status = "in_progress";
      }
    } else if (target == null && g.target_date && daysLeft != null && daysLeft < 0) {
      status = "overdue";
    }

    out.push({
      id: g.id,
      label: g.label,
      tier: g.tier,
      kind: g.goal_type,
      unit: g.goal_type === "exercise" ? "kg" : g.unit || "",
      start,
      current,
      target,
      pct,
      status,
      targetDate: g.target_date,
      daysLeft,
      note,
    });
  }
  const tierRank = (t: GoalProgress["tier"]) => (t === "primary" ? 0 : t === "secondary" ? 1 : 2);
  return out.sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999"));
}

export interface UpcomingCompetition {
  title: string;
  date: string;
  location: string | null;
  daysAway: number;
}

export interface ReadinessWeek {
  weekStart: string;
  readiness: number | null; // 1-5
  sessionsDone: number;
  avgRpe: number | null;
}

export interface ReadinessSummary {
  checkins: number;
  avgReadiness: number; // 1-5: mean of energy, sleep and (inverted) soreness
  avgSleep: number;
  avgEnergy: number;
  avgSoreness: number; // 1-5, higher = more sore
  weekly: ReadinessWeek[];
  lowDays: number; // check-ins scoring ≤ 2.5
  lowDaysWithSession: number;
  lowDaysCompleted: number;
  goodDaysWithSession: number;
  goodDaysCompleted: number;
}

export interface CheckInInput {
  date: string;
  energy: number;
  sleep: number;
  soreness: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function computeReadiness(checkins: CheckInInput[], sessions: Session[], weekly: WeeklySessions[]): ReadinessSummary | null {
  const valid = checkins.filter((c) => c.energy && c.sleep && c.soreness);
  if (!valid.length) return null;
  const score = (c: CheckInInput) => (c.energy + c.sleep + (6 - c.soreness)) / 3;

  const byWeek: Record<string, number[]> = {};
  for (const c of valid) (byWeek[weekStartISO(c.date)] ??= []).push(score(c));

  const sessionsByDate: Record<string, Session[]> = {};
  for (const s of countable(sessions)) (sessionsByDate[s.date] ??= []).push(s);
  let lowDays = 0, lowWith = 0, lowDone = 0, goodWith = 0, goodDone = 0;
  for (const c of valid) {
    const sc = score(c);
    const day = sessionsByDate[c.date] ?? [];
    const done = day.length > 0 && day.some(isDone);
    if (sc <= 2.5) {
      lowDays++;
      if (day.length) { lowWith++; if (done) lowDone++; }
    } else if (day.length) {
      goodWith++;
      if (done) goodDone++;
    }
  }

  return {
    checkins: valid.length,
    avgReadiness: r1(mean(valid.map(score))),
    avgSleep: r1(mean(valid.map((c) => c.sleep))),
    avgEnergy: r1(mean(valid.map((c) => c.energy))),
    avgSoreness: r1(mean(valid.map((c) => c.soreness))),
    weekly: weekly.map((w) => ({
      weekStart: w.weekStart,
      readiness: byWeek[w.weekStart] ? r1(mean(byWeek[w.weekStart])) : null,
      sessionsDone: (Object.values(w.completed) as number[]).reduce((a, b) => a + b, 0),
      avgRpe: w.avgRpe,
    })),
    lowDays,
    lowDaysWithSession: lowWith,
    lowDaysCompleted: lowDone,
    goodDaysWithSession: goodWith,
    goodDaysCompleted: goodDone,
  };
}

export interface AdherenceRow {
  exercise: string;
  programmed: number;
  completed: number;
  skipped: number; // opted out, or nothing logged in a session that was otherwise trained
  swapped: { to: string; times: number }[];
}

// Coach-programmed exercises in sessions that are already in the past.
// Only sessions the athlete actually trained count, so a whole missed
// session (already shown on the calendar) doesn't flood this with
// every exercise in it.
export function computeAdherence(sessions: Session[], today: string): AdherenceRow[] {
  const rows: Record<string, AdherenceRow & { swapCounts: Record<string, number> }> = {};
  for (const s of countable(sessions)) {
    if (s.session_source !== "programme" || s.date > today || !isDone(s)) continue;
    if (s.type !== "strength" && s.type !== "power_speed") continue;
    for (const ex of s.exercises ?? []) {
      if (ex.is_primer || !ex.name) continue;
      const original = (ex.swapped_from || ex.name).trim();
      const key = original.toLowerCase();
      const row = (rows[key] ??= { exercise: original, programmed: 0, completed: 0, skipped: 0, swapped: [], swapCounts: {} });
      row.programmed++;
      const anyDone = (ex.log ?? []).some((l) => l.done);
      if (ex.opted_out || !anyDone) row.skipped++;
      else row.completed++;
      if (ex.swapped_from && ex.name.trim().toLowerCase() !== key) {
        row.swapCounts[ex.name.trim()] = (row.swapCounts[ex.name.trim()] ?? 0) + 1;
      }
    }
  }
  return Object.values(rows)
    .map(({ swapCounts, ...r }) => ({ ...r, swapped: Object.entries(swapCounts).map(([to, times]) => ({ to, times })).sort((a, b) => b.times - a.times) }))
    .filter((r) => r.skipped > 0 || r.swapped.length > 0)
    .sort((a, b) => b.skipped + b.swapped.reduce((n, x) => n + x.times, 0) - (a.skipped + a.swapped.reduce((n, x) => n + x.times, 0)));
}

export interface BenchmarkRow {
  group: string; // exercise / modality, e.g. "SkiErg"
  label: string; // e.g. "Pace (min/km)"
  values: (number | null)[]; // aligned to BenchmarkGroup.attempts
  lowerIsBetter: boolean;
  changePct: number | null; // first → latest attempt that has a value
  improved: boolean | null;
}

export interface BenchmarkGroup {
  name: string;
  type: string;
  attempts: string[]; // dates, chronological (first + the latest few)
  totalAttempts: number;
  rows: BenchmarkRow[];
}

const MAX_BENCHMARK_COLUMNS = 4;

function metricKeyForLabel(label: string): MetricKey | null {
  for (const key of Object.keys(METRIC_META) as MetricKey[]) {
    if (label.startsWith(METRIC_META[key].label)) return key;
  }
  return null;
}

// The same workout done more than once in range (same name + type),
// compared attempt by attempt - cardio and hybrid only, since repeated
// strength sessions are what the progress charts already show.
export function computeBenchmarks(sessions: Session[], limit = 4): BenchmarkGroup[] {
  const pool = countable(sessions).filter((s) => (s.type === "hyrox" || s.type === "cardio") && isDone(s));
  const out: BenchmarkGroup[] = [];
  for (const g of findRepeatedSessionGroups(pool)) {
    const ids = new Set(g.sessions.map((x) => x.id));
    const cmp = compareSessionGroup(pool.filter((s) => ids.has(s.id)));
    const allDates = cmp.sessions.map((s) => s.date);
    const shown = allDates.length > MAX_BENCHMARK_COLUMNS ? [allDates[0], ...allDates.slice(-(MAX_BENCHMARK_COLUMNS - 1))] : allDates;
    const rows: BenchmarkRow[] = [];
    for (const row of cmp.rows) {
      const byDate = new Map(row.cells.map((c) => [c.date, c.value]));
      const values = shown.map((d) => (byDate.has(d) ? byDate.get(d)! : null));
      const present = row.cells.filter((c) => Number.isFinite(c.value));
      if (present.length < 2) continue;
      const key = metricKeyForLabel(row.label);
      const lowerIsBetter = key ? LOWER_IS_BETTER_METRICS.includes(key) : false;
      const first = present[0].value;
      const latest = present[present.length - 1].value;
      const changePct = first ? ((latest - first) / Math.abs(first)) * 100 : null;
      rows.push({
        group: row.group,
        label: row.label,
        values,
        lowerIsBetter,
        changePct: changePct == null ? null : Math.round(changePct * 10) / 10,
        improved: latest === first ? null : lowerIsBetter ? latest < first : latest > first,
      });
    }
    // When an exercise has both distance and duration varying (e.g. an
    // easy run of whatever length), they describe how much was done, not
    // how well - so neither is marked better or worse. On a fixed-
    // distance piece (no distance row) a shorter time is a real win.
    for (const grp of new Set(rows.map((r) => r.group))) {
      const isVolume = (r: BenchmarkRow) => r.group === grp && (r.label.startsWith(METRIC_META.distance.label) || r.label.startsWith(METRIC_META.duration.label));
      if (rows.filter(isVolume).length >= 2) for (const r of rows) if (isVolume(r)) r.improved = null;
    }
    if (rows.length) out.push({ name: g.name, type: g.type, attempts: shown, totalAttempts: allDates.length, rows });
    if (out.length >= limit) break;
  }
  return out;
}

// ── Heart-rate zone split (Hybrid + Cardio combined) ─────────────────────────

export interface HrZoneBand {
  n: number;
  name: string;
  low: number; // bpm
  high: number;
  amount: number; // minutes, or efforts when basis = "efforts"
  pct: number;
}

export interface HrZoneSplit {
  zones: HrZoneBand[];
  basis: "minutes" | "efforts"; // minutes when durations were logged alongside HR
  total: number;
  sessions: number;
  maxHrSource: "set" | "estimated";
  easyPct: number; // Z1-2
  moderatePct: number; // Z3
  hardPct: number; // Z4-5
}

// Each logged block (a run, an erg piece, a whole session) has one
// average HR and usually a duration. Its minutes go to the zone its
// average HR falls in - an approximation of true time-in-zone, which
// would need second-by-second HR data. Blocks with HR but no duration
// share the session's own length; if no durations are logged at all,
// the split is by number of efforts instead.
export function computeHrZoneSplit(
  sessions: Session[],
  zones: { n: number; name: string; hr: { low: number; high: number } | null }[],
  maxHrSource: "set" | "estimated"
): HrZoneSplit | null {
  const bands = zones.filter((z) => z.hr) as { n: number; name: string; hr: { low: number; high: number } }[];
  if (bands.length === 0) return null;
  const zoneFor = (hr: number) => {
    for (const z of bands) if (hr < z.hr.high) return z.n;
    return bands[bands.length - 1].n;
  };
  const minutes: Record<number, number> = {};
  const efforts: Record<number, number> = {};
  let sessionsCounted = 0;
  let anyMinutes = false;

  for (const s of countable(sessions)) {
    if ((s.type !== "hyrox" && s.type !== "cardio") || !isDone(s)) continue;
    const blocks = extractMetricEntries(s)
      .map((e) => ({ hr: parseFloat(String(e.values.avg_hr ?? "")), min: parseFloat(String(e.values.duration ?? "")) }))
      .filter((b) => Number.isFinite(b.hr) && b.hr > 40 && b.hr < 230);
    if (!blocks.length) continue;
    sessionsCounted++;
    const untimed = blocks.filter((b) => !(b.min > 0));
    const share = s.duration_min && untimed.length ? s.duration_min / untimed.length : null;
    for (const b of blocks) {
      const z = zoneFor(b.hr);
      efforts[z] = (efforts[z] ?? 0) + 1;
      const m = b.min > 0 ? b.min : share;
      if (m) {
        minutes[z] = (minutes[z] ?? 0) + m;
        anyMinutes = true;
      }
    }
  }
  if (!sessionsCounted) return null;

  const basis = anyMinutes ? "minutes" : "efforts";
  const src = basis === "minutes" ? minutes : efforts;
  const total = Object.values(src).reduce((a, b) => a + b, 0);
  if (!total) return null;
  const out = bands.map((z) => {
    const amount = Math.round((src[z.n] ?? 0) * 10) / 10;
    return { n: z.n, name: z.name, low: z.hr.low, high: z.hr.high, amount, pct: Math.round(((src[z.n] ?? 0) / total) * 1000) / 10 };
  });
  const sum = (ns: number[]) => Math.round(out.filter((z) => ns.includes(z.n)).reduce((a, z) => a + z.pct, 0));
  return {
    zones: out,
    basis,
    total: Math.round(total),
    sessions: sessionsCounted,
    maxHrSource,
    easyPct: sum([1, 2]),
    moderatePct: sum([3]),
    hardPct: sum([4, 5]),
  };
}

// ── Shared by the on-screen report and the PDF export ────────────────────────

/** One card per exercise + PB kind: its newest PB (always the best) and how many were set. */
export function groupPBs(pbs: ReportPB[]): { pb: ReportPB; count: number }[] {
  const groups = new Map<string, { pb: ReportPB; count: number }>();
  for (const pb of pbs) {
    const key = `${pb.exercise.toLowerCase()}|${pb.kind}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { pb, count: 1 });
    else {
      g.count++;
      if (pb.date > g.pb.date) g.pb = pb;
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.pb.date.localeCompare(a.pb.date));
}

export function pbValueText(pb: ReportPB): string {
  if (pb.kind === "bw_time") return pb.timeSeconds != null ? `${pb.timeSeconds}s hold` : "-";
  if (pb.kind === "bw_reps") return pb.reps != null ? `${pb.reps} reps` : "-";
  if (pb.weightKg == null) return "-";
  return pb.reps ? `${pb.weightKg}kg × ${pb.reps}` : `${pb.weightKg}kg`;
}

interface StrengthSummaryLike {
  name: string;
  overallPct: number | null;
  entries: { e1rm: number }[];
}
interface TtlSummaryLike {
  name: string;
  overallPct: number | null;
  entries: { ttl: number }[];
}

export interface ProgressRowData {
  name: string;
  pct: number;
  first: number;
  latest: number;
}
export interface TrendSeriesData {
  name: string;
  pct: number | null;
  points: { date: string; value: number }[];
}

/** % change per exercise, first session in range → latest (e1RM or tonnage). */
export function buildProgressRows(
  metric: "e1rm" | "ttl",
  strength: { exerciseSummaries: StrengthSummaryLike[] },
  ttl: TtlSummaryLike[],
  e1rmValue: (kg: number) => number
): ProgressRowData[] {
  return metric === "e1rm"
    ? strength.exerciseSummaries
        .filter((e) => e.overallPct != null && e.entries.length >= 2)
        .map((e) => ({ name: e.name, pct: e.overallPct!, first: e1rmValue(e.entries[0].e1rm), latest: e1rmValue(e.entries[e.entries.length - 1].e1rm) }))
    : ttl
        .filter((e) => e.overallPct != null && e.entries.length >= 2)
        .map((e) => ({ name: e.name, pct: e.overallPct!, first: e.entries[0].ttl, latest: e.entries[e.entries.length - 1].ttl }));
}

/** Weekly value per exercise, most-logged first. */
export function buildTrendSeries(
  metric: "e1rm" | "ttl",
  strength: { exerciseSummaries: StrengthSummaryLike[]; weeklyExMap: Record<string, { weekStart: string; e1rm: number }[]> },
  ttl: TtlSummaryLike[],
  weeklyTtl: Record<string, { weekStart: string; ttl: number }[]>,
  e1rmValue: (kg: number) => number,
  limit: number
): TrendSeriesData[] {
  const list =
    metric === "e1rm"
      ? [...strength.exerciseSummaries]
          .sort((a, b) => b.entries.length - a.entries.length)
          .map((e) => ({ name: e.name, pct: e.overallPct, points: (strength.weeklyExMap[e.name] ?? []).map((w) => ({ date: w.weekStart, value: e1rmValue(w.e1rm) })) }))
      : [...ttl]
          .sort((a, b) => b.entries.length - a.entries.length)
          .map((e) => ({ name: e.name, pct: e.overallPct, points: (weeklyTtl[e.name] ?? []).map((w) => ({ date: w.weekStart, value: w.ttl })) }));
  return list.filter((s) => s.points.length >= 2).slice(0, limit);
}
