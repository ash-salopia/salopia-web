// Data-driven "progressing or not" signals for a logged exercise —
// this session's best completed set and total load vs the same
// exercise last time. Extracted from the Live Group page so the AI
// session summary is grounded in the exact same numbers the coach
// sees live.

import type { SessionExercise } from "@/types";

export type ProgressionSignal = { direction: "up" | "down" | "same"; label: string };

type PastSession = { athlete_id: string; date: string; exercises?: SessionExercise[] | null };

// The same exercise's most recent prior *completed* instance before
// `beforeDate` (most-recent-first walk, name-insensitive match), plus
// which session (date) it came from.
export function findPreviousExerciseEntry(
  sessions: PastSession[],
  athleteId: string,
  exerciseName: string,
  beforeDate: string
): { exercise: SessionExercise; date: string } | null {
  const name = exerciseName.trim().toLowerCase();
  if (!name) return null;
  const past = sessions
    .filter((s) => s.athlete_id === athleteId && s.date < beforeDate)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const sess of past) {
    const match = (sess.exercises ?? []).find(
      (e) => (e.name ?? "").trim().toLowerCase() === name && (e.log ?? []).some((l) => l.done)
    );
    if (match) return { exercise: match, date: sess.date };
  }
  return null;
}

export function findPreviousExercise(
  sessions: PastSession[],
  athleteId: string,
  exerciseName: string,
  beforeDate: string
): SessionExercise | null {
  return findPreviousExerciseEntry(sessions, athleteId, exerciseName, beforeDate)?.exercise ?? null;
}

// Last time's completed sets as a compact string, e.g. "92.5kg×5, 92.5kg×5".
export function formatPrevSets(ex: SessionExercise | null): string | null {
  if (!ex) return null;
  const timeMode = (ex.time ?? "").trim().length > 0;
  const showWeight = !ex.is_bodyweight;
  const parts = (ex.log ?? [])
    .filter((l) => l.done)
    .map((l) => {
      if (timeMode) return l.time?.trim() ? `${l.time}s` : null;
      if (!showWeight) return l.reps?.trim() ? `×${l.reps}` : null;
      if (l.weight?.trim() && l.reps?.trim()) return `${l.weight}kg×${l.reps}`;
      if (l.weight?.trim()) return `${l.weight}kg`;
      return null;
    })
    .filter((v): v is string => !!v);
  return parts.length ? parts.join(", ") : null;
}

// The single best completed set this session (heaviest weight, longest
// time, or most reps depending on how the exercise is prescribed).
export function bestCompletedValue(
  ex: SessionExercise | null
): { weight: number | null; reps: number | null; time: number | null } | null {
  if (!ex) return null;
  const done = (ex.log ?? []).filter((l) => l.done);
  if (!done.length) return null;
  const timeMode = (ex.time ?? "").trim().length > 0;
  if (timeMode) {
    const times = done.map((l) => parseFloat(l.time ?? "")).filter((n) => isFinite(n));
    return times.length ? { weight: null, reps: null, time: Math.max(...times) } : null;
  }
  const weights = done.map((l) => parseFloat(l.weight ?? "")).filter((n) => isFinite(n));
  const reps = done.map((l) => parseInt(l.reps ?? "", 10)).filter((n) => isFinite(n));
  const weight = weights.length ? Math.max(...weights) : null;
  const repsMax = reps.length ? Math.max(...reps) : null;
  if (weight == null && repsMax == null) return null;
  return { weight, reps: repsMax, time: null };
}

// Best set this session vs last time. Weight first (primary axis); reps
// at unchanged weight is the tie-breaker. null when there's nothing to
// compare (no prior session / nothing logged done yet).
export function computeBestSetSignal(
  currentEx: SessionExercise,
  prevEx: SessionExercise | null
): ProgressionSignal | null {
  if (!prevEx) return null;
  const cur = bestCompletedValue(currentEx);
  const prev = bestCompletedValue(prevEx);
  if (!cur || !prev) return null;

  if (cur.time != null && prev.time != null) {
    const diff = Math.round((cur.time - prev.time) * 10) / 10;
    if (diff === 0) return { direction: "same", label: "same" };
    return { direction: diff > 0 ? "up" : "down", label: `${diff > 0 ? "+" : ""}${diff}s` };
  }

  if (cur.weight != null && prev.weight != null) {
    const wDiff = Math.round((cur.weight - prev.weight) * 10) / 10;
    if (wDiff !== 0) return { direction: wDiff > 0 ? "up" : "down", label: `${wDiff > 0 ? "+" : ""}${wDiff}kg` };
    if (cur.reps != null && prev.reps != null && cur.reps !== prev.reps) {
      const rDiff = cur.reps - prev.reps;
      return { direction: rDiff > 0 ? "up" : "down", label: `same weight, ${rDiff > 0 ? "+" : ""}${rDiff} reps` };
    }
    return { direction: "same", label: "same" };
  }

  if (cur.reps != null && prev.reps != null) {
    const rDiff = cur.reps - prev.reps;
    if (rDiff === 0) return { direction: "same", label: "same" };
    return { direction: rDiff > 0 ? "up" : "down", label: `${rDiff > 0 ? "+" : ""}${rDiff} reps` };
  }

  return null;
}

// Total tonnage (Σ weight×reps across completed sets). Only meaningful
// for a weighted, rep-based exercise.
export function totalLoadValue(ex: SessionExercise | null): number | null {
  if (!ex) return null;
  const done = (ex.log ?? []).filter((l) => l.done);
  if (!done.length) return null;
  let total = 0;
  let counted = false;
  for (const l of done) {
    const w = parseFloat(l.weight ?? "");
    const r = parseInt(l.reps ?? "", 10);
    if (isFinite(w) && isFinite(r)) { total += w * r; counted = true; }
  }
  return counted ? total : null;
}

export function computeTotalLoadSignal(
  currentEx: SessionExercise,
  prevEx: SessionExercise | null
): ProgressionSignal | null {
  if (!prevEx) return null;
  const cur = totalLoadValue(currentEx);
  const prev = totalLoadValue(prevEx);
  if (cur == null || prev == null) return null;
  const diff = Math.round((cur - prev) * 10) / 10;
  if (diff === 0) return { direction: "same", label: "same" };
  return { direction: diff > 0 ? "up" : "down", label: `${diff > 0 ? "+" : ""}${diff}kg` };
}

export function progressionArrow(direction: "up" | "down" | "same"): string {
  return direction === "up" ? "▲" : direction === "down" ? "▼" : "＝";
}
