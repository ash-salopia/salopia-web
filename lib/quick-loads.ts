// "Guesstimate" load buttons in the athlete app: when an athlete taps a
// kg box, offer three likely weights (e.g. 5 / 6 / 7 kg for a 6 kg goblet
// squat) so most sets are logged with one tap instead of typing.
//
// The middle button is the best guess for this set: what they typed on
// the set before (or any set logged today), else the coach's %1RM target, else what they lifted on
// this set last time, else the coach's kg load. Either side is one step
// lighter / heavier - 1 kg for light loads, 2 kg for dumbbells and
// kettlebells, 2.5 kg for barbell-type loads.

const num = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function loadStep(exerciseName: string, kg: number): number {
  if (kg < 12) return 1;
  return /dumbbell|\bdb\b|kettlebell|\bkb\b/i.test(exerciseName) ? 2 : 2.5;
}

export function guessLoads(
  ex: { name: string; target_load?: string; computed_targets?: (number | null)[]; log?: { weight: string }[] },
  setIndex: number,
  lastTime?: number[]
): number[] {
  const log = ex.log ?? [];
  const base =
    num(log[setIndex]?.weight) ??
    num(log[setIndex - 1]?.weight) ??
    log.map((l) => num(l.weight)).find((n) => n != null) ?? // any set already logged today
    ex.computed_targets?.[setIndex] ??
    (lastTime?.length ? lastTime[Math.min(setIndex, lastTime.length - 1)] : null) ??
    num(ex.target_load);
  if (!base) return [];
  const step = loadStep(ex.name, base);
  const r = (n: number) => Math.round(n * 2) / 2;
  return [r(base - step), r(base), r(base + step)].filter((n, i, a) => n > 0 && a.indexOf(n) === i);
}

/**
 * Weights logged per set the last time each exercise was done, from the
 * athlete's history (most recent earlier session with logged weights).
 */
export function lastWeightsByExercise(
  sessions: { id: string; date: string; exercises?: { name: string; log?: { weight: string; done: boolean }[] }[] }[],
  current: { id: string; date: string }
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const earlier = sessions
    .filter((s) => s.id !== current.id && s.date <= current.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const s of earlier) {
    for (const ex of s.exercises ?? []) {
      const key = ex.name.trim().toLowerCase();
      if (out.has(key)) continue;
      const kgs = (ex.log ?? []).filter((l) => l.done).map((l) => num(l.weight)).filter((n): n is number => n != null);
      if (kgs.length) out.set(key, kgs);
    }
  }
  return out;
}
