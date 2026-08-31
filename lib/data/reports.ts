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
  rangeEnd: string | null
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
  };
}
