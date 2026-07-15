import { createClient } from "@/lib/supabase-browser";
import type { Session, SessionExercise } from "@/types";

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

export interface ReportData {
  exMap: ExerciseMap;
  hyroxSessions: Session[];
  cardioSessions: Session[];
  powerSpeedSessions: Session[];
  rangeStart: string | null;
  rangeEnd: string | null;
  generated: string;
}

// Generates a training load report for one athlete, optionally
// scoped to a date range. Ported exactly from the prototype's
// debugged generateReport function — see the comments inline for why
// each piece works the way it does. Two real bugs were found and
// fixed during that build, both preserved here:
//
// 1. Tonnage must use each SET's own logged reps where the
//    athlete/coach changed it for that set, not just the
//    exercise's prescribed reps — otherwise a session where reps
//    were adjusted mid-workout reports the wrong tonnage entirely.
// 2. "Each side" exercises (logged weight is per hand, e.g. DB
//    work) must double their tonnage, matching the live in-session
//    TTL display, so the report and the session view never
//    disagree on the same logged data.
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

  const strSessions = allSessions
    .filter((s) => s.type === "strength")
    .filter((s) => (s.exercises ?? []).some((e) => (e.log ?? []).some((l) => parseFloat(l.weight) > 0)));

  const exMap: ExerciseMap = {};

  for (const sess of strSessions) {
    for (const ex of sess.exercises ?? []) {
      if (!ex.name) continue;
      const done = (ex.log ?? []).filter((s) => parseFloat(s.weight) > 0);
      if (!done.length) continue;

      const prescribedReps = parseInt(ex.reps) || 0;
      // Use each set's own logged reps if modified, else fall back
      // to the prescribed reps for that exercise.
      const perSetReps = done.map((s) => parseInt(s.reps) || prescribedReps);
      if (!perSetReps.some((r) => r > 0)) continue;

      const weights = done.map((s) => parseFloat(s.weight));
      const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
      const avgReps = Math.round(perSetReps.reduce((a, b) => a + b, 0) / perSetReps.length);
      const sideMultiplier = ex.each_side ? 2 : 1;
      // True tonnage: sum each individual set's own weight x reps,
      // not sets-count x one averaged reps figure — stays accurate
      // even when reps vary set to set (e.g. a top set then back-off
      // sets at a different rep count).
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
    hyroxSessions,
    cardioSessions,
    powerSpeedSessions,
    rangeStart,
    rangeEnd,
    generated: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  };
}
