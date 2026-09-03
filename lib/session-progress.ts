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
  const withPause = (s: string, l: { pause?: string }) =>
    ex.track_pause && l.pause?.trim() ? `${s} @${l.pause}s` : s;
  const parts = (ex.log ?? [])
    .filter((l) => l.done)
    .map((l) => {
      if (timeMode) return l.time?.trim() ? `${l.time}s` : null;
      if (!showWeight) return l.reps?.trim() ? withPause(`×${l.reps}`, l) : null;
      if (l.weight?.trim() && l.reps?.trim()) return withPause(`${l.weight}kg×${l.reps}`, l);
      if (l.weight?.trim()) return withPause(`${l.weight}kg`, l);
      return null;
    })
    .filter((v): v is string => !!v);
  return parts.length ? parts.join(", ") : null;
}

// The single best completed set this session (heaviest weight, longest
// time, or most reps depending on how the exercise is prescribed).
export function bestCompletedValue(
  ex: SessionExercise | null
): { weight: number | null; reps: number | null; time: number | null; pause: number | null } | null {
  if (!ex) return null;
  const done = (ex.log ?? []).filter((l) => l.done);
  if (!done.length) return null;
  const timeMode = (ex.time ?? "").trim().length > 0;
  if (timeMode) {
    const times = done.map((l) => parseFloat(l.time ?? "")).filter((n) => isFinite(n));
    return times.length ? { weight: null, reps: null, time: Math.max(...times), pause: null } : null;
  }
  const weights = done.map((l) => parseFloat(l.weight ?? "")).filter((n) => isFinite(n));
  const reps = done.map((l) => parseInt(l.reps ?? "", 10)).filter((n) => isFinite(n));
  const weight = weights.length ? Math.max(...weights) : null;
  const repsMax = reps.length ? Math.max(...reps) : null;
  // Longest pause held across the completed sets — only meaningful when the
  // exercise is set up to track it.
  const pauses = ex.track_pause
    ? done.map((l) => parseFloat(l.pause ?? "")).filter((n) => isFinite(n) && n > 0)
    : [];
  const pause = pauses.length ? Math.max(...pauses) : null;
  if (weight == null && repsMax == null && pause == null) return null;
  return { weight, reps: repsMax, time: null, pause };
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
    // Same weight and reps — a longer pause at the same load is progress.
    const pauseSig = pauseTieBreak(cur.pause, prev.pause);
    if (pauseSig) return pauseSig;
    return { direction: "same", label: "same" };
  }

  if (cur.reps != null && prev.reps != null) {
    const rDiff = cur.reps - prev.reps;
    if (rDiff !== 0) return { direction: rDiff > 0 ? "up" : "down", label: `${rDiff > 0 ? "+" : ""}${rDiff} reps` };
    const pauseSig = pauseTieBreak(cur.pause, prev.pause);
    if (pauseSig) return pauseSig;
    return { direction: "same", label: "same" };
  }

  return null;
}

// Same primary result (weight, reps) — a change in the pause held is the
// tie-breaker: a longer hold at the same load reads as progress (green),
// a shorter one as a regression. null when pause isn't being tracked or
// hasn't changed.
function pauseTieBreak(cur: number | null, prev: number | null): ProgressionSignal | null {
  if (cur == null && prev == null) return null;
  if (cur != null && prev == null) return { direction: "up", label: `same, +${cur}s pause` };
  if (cur == null && prev != null) return { direction: "down", label: `same, no pause (was ${prev}s)` };
  const diff = Math.round(((cur as number) - (prev as number)) * 10) / 10;
  if (diff === 0) return null;
  return { direction: diff > 0 ? "up" : "down", label: `same, ${diff > 0 ? "+" : ""}${diff}s pause` };
}

// Total work across completed sets:
//   tonnage — Σ weight×reps, for a loaded exercise
//   reps    — Σ reps, always (used when there's no load, e.g. pull-ups)
// A bodyweight exercise done for more total reps over the same number of
// sets still counts as progress even though the best single set didn't
// move — that's what the Best signal alone would miss.
function totalWork(ex: SessionExercise | null): { tonnage: number | null; reps: number | null } {
  if (!ex) return { tonnage: null, reps: null };
  const done = (ex.log ?? []).filter((l) => l.done);
  let tonnage = 0, tonnageCounted = false;
  let reps = 0, repsCounted = false;
  for (const l of done) {
    const w = parseFloat(l.weight ?? "");
    const r = parseInt(l.reps ?? "", 10);
    if (isFinite(r)) { reps += r; repsCounted = true; }
    if (isFinite(w) && isFinite(r)) { tonnage += w * r; tonnageCounted = true; }
  }
  return { tonnage: tonnageCounted ? tonnage : null, reps: repsCounted ? reps : null };
}

// Total tonnage (Σ weight×reps). null for a bodyweight / no-load exercise.
export function totalLoadValue(ex: SessionExercise | null): number | null {
  return totalWork(ex).tonnage;
}

export function computeTotalLoadSignal(
  currentEx: SessionExercise,
  prevEx: SessionExercise | null
): ProgressionSignal | null {
  if (!prevEx) return null;
  const cur = totalWork(currentEx);
  const prev = totalWork(prevEx);

  // Loaded both times → total tonnage moved
  if (cur.tonnage != null && prev.tonnage != null) {
    const diff = Math.round((cur.tonnage - prev.tonnage) * 10) / 10;
    if (diff === 0) return { direction: "same", label: "same" };
    return { direction: diff > 0 ? "up" : "down", label: `${diff > 0 ? "+" : ""}${diff}kg` };
  }

  // No load (or one side unweighted) → total reps across all sets
  if (cur.reps != null && prev.reps != null) {
    const diff = cur.reps - prev.reps;
    if (diff === 0) return { direction: "same", label: "same" };
    return { direction: diff > 0 ? "up" : "down", label: `${diff > 0 ? "+" : ""}${diff} reps` };
  }

  return null;
}

export function progressionArrow(direction: "up" | "down" | "same"): string {
  return direction === "up" ? "▲" : direction === "down" ? "▼" : "＝";
}
