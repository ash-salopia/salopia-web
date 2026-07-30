import { createClient } from "@/lib/supabase-browser";
import type { Session, SessionExercise } from "@/types";
import { computeReport, type ComputedReport } from "@/lib/report-calc";

export type { ReportRow, ExerciseMap, ExerciseSummary, WeeklyPoint, WeeklyExerciseMap, NoteEntry } from "@/lib/report-calc";

export interface ReportData extends ComputedReport {
  rangeStart: string | null;
  rangeEnd: string | null;
  generated: string;
}

// Fetches an athlete's sessions in range and hands them to the shared
// (pure, Supabase-free) computeReport — see lib/report-calc.ts for
// the actual tonnage/highlights/notes logic. Kept as a thin wrapper
// so the same computation also runs server-side, unchanged, in the
// AI summary route (app/api/training-report-ai/route.ts).
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
  const { data, error } = await query.order("date", { ascending: true });
  if (error) throw error;

  const allSessions: Session[] = (data ?? []).map((s) => ({
    ...s,
    exercises: (s.session_exercises ?? []) as SessionExercise[],
  }));

  return {
    ...computeReport(allSessions),
    rangeStart,
    rangeEnd,
    generated: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  };
}
