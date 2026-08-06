import { createClient } from "@/lib/supabase-browser";
import type { Session, SessionExercise } from "@/types";
import { computeReport, type ComputedReport } from "@/lib/report-calc";
import { computeStrengthReport, type ComputedStrengthReport } from "@/lib/strength-report-calc";
import { getOrgSettings } from "@/lib/data/settings";
import { resolveCurrentOneRMWithSource } from "@/lib/data/one-rm";
import type { OneRMSource } from "@/lib/data/settings";
import type { OneRMFormula } from "@/lib/one-rm";

export type { ReportRow, ExerciseMap, ExerciseSummary, WeeklyPoint, WeeklyExerciseMap, NoteEntry } from "@/lib/report-calc";
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
    // from their Session Library, separate from their assigned
    // programme) — they must never count toward Training Load.
    .eq("session_source", "programme");
  if (rangeStart && rangeEnd) {
    query = query.gte("date", rangeStart).lte("date", rangeEnd);
  }

  const [{ data, error }, settings, athleteRes] = await Promise.all([
    query.order("date", { ascending: true }),
    getOrgSettings(),
    supabase.from("athletes").select("bodyweight_kg").eq("id", athleteId).single(),
  ]);
  if (error) throw error;

  const allSessions: Session[] = (data ?? []).map((s) => ({
    ...s,
    exercises: (s.session_exercises ?? []) as SessionExercise[],
  }));

  const strength = computeStrengthReport(allSessions, settings.one_rm_formula);

  const oneRmReference: ReportData["oneRmReference"] = {};
  await Promise.all(
    Object.keys(strength.exMap).map(async (name) => {
      oneRmReference[name] = await resolveCurrentOneRMWithSource(athleteId, name, settings.one_rm_formula);
    })
  );

  return {
    ...computeReport(allSessions),
    rangeStart,
    rangeEnd,
    generated: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    strength,
    oneRmFormula: settings.one_rm_formula,
    oneRmSource: settings.one_rm_source,
    bodyweightKg: athleteRes.data?.bodyweight_kg ?? null,
    oneRmReference,
  };
}
