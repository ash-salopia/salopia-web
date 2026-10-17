import { createClient } from "@/lib/supabase-browser";
import type { Session, SessionExercise } from "@/types";
import { computeReport, type ComputedReport } from "@/lib/report-calc";
import { computeLoadMonitoring, type LoadMonitoringResult } from "@/lib/training-load";
import { computeStrengthReport, type ComputedStrengthReport } from "@/lib/strength-report-calc";
import { getOrgSettings } from "@/lib/data/settings";
import { resolveCurrentOneRMWithSource } from "@/lib/data/one-rm";
import { listVelocityProfiles } from "@/lib/data/velocity-profiles";
import type { OneRMSource } from "@/lib/data/settings";
import type { OneRMFormula } from "@/lib/one-rm";
import {
  computeVisualSummary,
  computeGoalProgress,
  previousRange,
  type CheckInInput,
  type GoalInput,
  type GoalProgress,
  type ReportPB,
  type StrengthPBRow,
  type UpcomingCompetition,
  type VisualSummary,
} from "@/lib/report-visuals";
import { daySpan } from "@/lib/report-visuals";
import { latestTestValues, listTestMetrics } from "@/lib/data/testing";
import { todayISO } from "@/lib/date-utils";

export type { ReportRow, ExerciseMap, ExerciseSummary, WeeklyPoint, WeeklyExerciseMap, NoteEntry, RPEEntry, RPEWeeklyPoint, PowerSpeedRow, PowerSpeedMap, PowerSpeedSummary } from "@/lib/report-calc";
export type { StrengthRow, StrengthExerciseMap, StrengthExerciseSummary, StrengthWeeklyPoint, StrengthWeeklyMap } from "@/lib/strength-report-calc";

export interface ReportData extends ComputedReport {
  rangeStart: string | null;
  rangeEnd: string | null;
  generated: string;
  strength: ComputedStrengthReport;
  oneRmFormula: OneRMFormula;
  oneRmSource: OneRMSource;
  bodyweightKg: number | null;
  // Resolved "current" 1RM per exercise (fixed override if the coach
  // has set one, else the rolling estimate) plus which one won — used
  // to render the "manual" tag on the Strength report.
  oneRmReference: Record<string, { value: number | null; source: "manual" | "rolling" }>;
  // 0088 — sRPE load / ACWR / monotony over the range. Always computed (cheap);
  // the report section that shows it is gated by options.loadMonitoring +
  // the org's load_monitoring tick-boxes.
  loadMonitoring: LoadMonitoringResult;
  loadMonitoringSettings: {
    enabled: boolean;
    acwr: boolean;
    load_spike_alert: boolean;
    monotony_strain: boolean;
    rtp_status: boolean;
    acwrLow: number;
    acwrHigh: number;
    spikePct: number;
  };
  athleteRtp: { status: string | null; note: string | null; since: string | null };
  // Headline cards, consistency calendar, weekly sessions, PB wall.
  // Only built when asked for (the single-athlete report) - bulk and
  // squad callers skip the extra queries.
  visual?: VisualSummary;
}

// Fetches an athlete's sessions in range and hands them to the shared
// (pure, Supabase-free) computeReport — see lib/report-calc.ts for
// the actual tonnage/highlights/notes logic, and strength-report-calc.ts
// for the parallel e1RM computation. Kept as a thin wrapper so the
// same computation also runs server-side, unchanged, in the AI
// summary route (app/api/training-report-ai/route.ts).
export async function generateReport(
  athleteId: string,
  rangeStart: string | null,
  rangeEnd: string | null,
  opts: { visuals?: boolean } = {}
): Promise<ReportData> {
  const supabase = createClient();

  let query = supabase
    .from("sessions")
    .select("*, session_exercises(*)")
    .eq("athlete_id", athleteId)
    // Library sessions are informal/standalone (started by the athlete
    // from their Session Library) and must never count toward reports.
    // 'athlete_logged' (ad-hoc sport sessions the athlete added) DO count
    // toward training load — they're real training — but are excluded from
    // adherence stats downstream (collectCompletion keys on 'programme').
    .in("session_source", ["programme", "athlete_logged"]);
  if (rangeStart && rangeEnd) {
    query = query.gte("date", rangeStart).lte("date", rangeEnd);
  }

  const [{ data, error }, settings, athleteRes, velocityProfiles] = await Promise.all([
    query.order("date", { ascending: true }),
    getOrgSettings(),
    supabase.from("athletes").select("bodyweight_kg, rtp_status, rtp_note, rtp_since").eq("id", athleteId).single(),
    listVelocityProfiles(athleteId).catch(() => []),
  ]);
  if (error) throw error;

  const allSessions: Session[] = (data ?? []).map((s) => ({
    ...s,
    exercises: (s.session_exercises ?? []) as SessionExercise[],
  }));

  const strength = computeStrengthReport(allSessions, settings.one_rm_formula);

  // Range for the daily zero-fill: the explicit range, else the span of
  // sessions we actually have.
  const dates = allSessions.map((s) => s.date).filter(Boolean).sort();
  const lmStart = rangeStart ?? dates[0] ?? new Date().toISOString().slice(0, 10);
  const lmEnd = rangeEnd ?? dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10);
  const loadMonitoring = computeLoadMonitoring(allSessions, lmStart, lmEnd, {
    acwrLow: settings.acwr_low,
    acwrHigh: settings.acwr_high,
    spikePct: settings.load_spike_pct,
  });

  const oneRmReference: ReportData["oneRmReference"] = {};
  await Promise.all(
    Object.keys(strength.exMap).map(async (name) => {
      oneRmReference[name] = await resolveCurrentOneRMWithSource(athleteId, name, settings.one_rm_formula);
    })
  );

  const visual = opts.visuals
    ? await buildVisualSummary(athleteId, allSessions, rangeStart, rangeEnd, settings.pb_enabled !== false).catch((e) => {
        console.error("[generateReport] visual summary failed", e);
        return undefined; // the rest of the report still renders
      })
    : undefined;

  return {
    ...computeReport(allSessions, velocityProfiles),
    rangeStart,
    rangeEnd,
    generated: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    strength,
    oneRmFormula: settings.one_rm_formula,
    oneRmSource: settings.one_rm_source,
    bodyweightKg: athleteRes.data?.bodyweight_kg ?? null,
    oneRmReference,
    loadMonitoring,
    loadMonitoringSettings: {
      enabled: settings.load_monitoring_enabled,
      acwr: settings.load_monitoring.acwr,
      load_spike_alert: settings.load_monitoring.load_spike_alert,
      monotony_strain: settings.load_monitoring.monotony_strain,
      rtp_status: settings.load_monitoring.rtp_status,
      acwrLow: settings.acwr_low,
      acwrHigh: settings.acwr_high,
      spikePct: settings.load_spike_pct,
    },
    athleteRtp: {
      status: (athleteRes.data as { rtp_status?: string | null } | null)?.rtp_status ?? null,
      note: (athleteRes.data as { rtp_note?: string | null } | null)?.rtp_note ?? null,
      since: (athleteRes.data as { rtp_since?: string | null } | null)?.rtp_since ?? null,
    },
    visual,
  };
}

const PB_SELECT = "exercise_name, date, pb_type, weight_kg, reps, time_seconds";

// PBs in a date range, as the community feed shows them: the classic
// weight / bodyweight lanes only (e1RM and volume rows are bookkeeping
// for the celebration pop-up), minus exercises the coach has hidden.
async function listPBsInRange(
  athleteId: string,
  start: string | null,
  end: string | null,
  hidden: Set<string>
): Promise<ReportPB[]> {
  const supabase = createClient();
  let q = supabase.from("personal_bests").select(PB_SELECT).eq("athlete_id", athleteId).in("pb_type", ["weight", "bw_reps", "bw_time"]);
  if (start && end) q = q.gte("date", start).lte("date", end);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? [])
    .filter((p) => !hidden.has(String(p.exercise_name).toLowerCase()))
    .map((p) => ({
      exercise: p.exercise_name,
      date: p.date,
      kind: p.pb_type as ReportPB["kind"],
      weightKg: p.weight_kg,
      reps: p.reps,
      timeSeconds: p.time_seconds,
    }));
}

async function buildVisualSummary(
  athleteId: string,
  sessions: Session[],
  rangeStart: string | null,
  rangeEnd: string | null,
  orgPbEnabled: boolean
): Promise<VisualSummary> {
  const supabase = createClient();
  // pb_enabled / pb_hidden are read separately (select *) so a missing
  // column on an older database can't break the main athlete query.
  const { data: ath } = await supabase.from("athletes").select("*").eq("id", athleteId).maybeSingle();
  const pbOn = orgPbEnabled && (ath as { pb_enabled?: boolean } | null)?.pb_enabled !== false;
  const hidden = new Set<string>(((ath as { pb_hidden?: string[] } | null)?.pb_hidden ?? []).map((h) => h.toLowerCase()));

  const prev = rangeStart && rangeEnd ? previousRange(rangeStart, rangeEnd) : null;
  const [pbs, prevPbs, prevSessions] = await Promise.all([
    pbOn ? listPBsInRange(athleteId, rangeStart, rangeEnd, hidden) : Promise.resolve([]),
    pbOn && prev ? listPBsInRange(athleteId, prev.start, prev.end, hidden) : Promise.resolve(null),
    prev
      ? supabase
          .from("sessions")
          .select("*, session_exercises(*)")
          .eq("athlete_id", athleteId)
          .in("session_source", ["programme", "athlete_logged"])
          .gte("date", prev.start)
          .lte("date", prev.end)
          .then(({ data, error }) => {
            if (error) throw error;
            return (data ?? []).map((s) => ({ ...s, exercises: (s.session_exercises ?? []) as SessionExercise[] })) as Session[];
          })
      : Promise.resolve(null),
  ]);

  const today = todayISO();
  const dates = sessions.map((s) => s.date).filter(Boolean).sort();
  const checkinFrom = rangeStart ?? dates[0] ?? today;
  const checkinTo = rangeEnd ?? today;

  // Each extra is best-effort: one failing (or a table missing on an
  // older database) just leaves its section out of the report.
  const [goals, competitions, checkins] = await Promise.all([
    loadGoalProgress(athleteId, today).catch((e) => {
      console.error("[generateReport] goals failed", e);
      return [] as GoalProgress[];
    }),
    supabase
      .from("competitions")
      .select("title, competition_date, location")
      .eq("athlete_id", athleteId)
      .gte("competition_date", today)
      .order("competition_date", { ascending: true })
      .limit(3)
      .then(({ data }) =>
        (data ?? []).map(
          (c): UpcomingCompetition => ({
            title: c.title,
            date: c.competition_date,
            location: c.location ?? null,
            daysAway: daySpan(today, c.competition_date) - 1,
          })
        )
      ),
    supabase
      .from("checkins")
      .select("date, energy, sleep, soreness")
      .eq("athlete_id", athleteId)
      .gte("date", checkinFrom)
      .lte("date", checkinTo)
      .then(({ data }) => (data ?? []) as CheckInInput[]),
  ]);

  return computeVisualSummary({
    sessions,
    rangeStart,
    rangeEnd,
    pbs,
    previousSessions: prevSessions,
    previousPbCount: prevPbs ? prevPbs.length : null,
    today,
    goals,
    competitions,
    checkins,
  });
}

// Goal progress (athlete_goals): current best lifts come from the PB
// table (all time, weight + e1RM lanes, which both record the actual
// set lifted); test goals read the latest test result.
async function loadGoalProgress(athleteId: string, today: string): Promise<GoalProgress[]> {
  const supabase = createClient();
  const { data: goals, error } = await supabase.from("athlete_goals").select("*").eq("athlete_id", athleteId);
  if (error) throw error;
  if (!goals?.length) return [];

  const exerciseNames = Array.from(new Set(goals.filter((g) => g.goal_type === "exercise" && g.exercise_name).map((g) => g.exercise_name as string)));
  const hasTestGoals = goals.some((g) => g.goal_type === "test" && g.test_metric_id);

  const [pbRows, testLatest, metrics] = await Promise.all([
    exerciseNames.length
      ? supabase
          .from("personal_bests")
          .select("exercise_name, date, weight_kg, reps")
          .eq("athlete_id", athleteId)
          .in("pb_type", ["weight", "e1rm"])
          .then(({ data }) => data ?? [])
      : Promise.resolve([]),
    hasTestGoals ? latestTestValues(athleteId) : Promise.resolve({} as Record<string, { value: number; date: string }>),
    hasTestGoals ? listTestMetrics() : Promise.resolve([]),
  ]);

  const strengthPbs: StrengthPBRow[] = (pbRows as { exercise_name: string; date: string; weight_kg: number | null; reps: number | null }[]).map((r) => ({
    exercise: r.exercise_name,
    date: r.date,
    weightKg: r.weight_kg,
    reps: r.reps,
  }));
  const testLowerIsBetter: Record<string, boolean> = {};
  for (const m of metrics) testLowerIsBetter[m.id] = m.better_direction === "lower";

  return computeGoalProgress({ goals: goals as GoalInput[], strengthPbs, testLatest, testLowerIsBetter, today });
}
