// How far apart the weights are in a gym - used by the quick-pick load
// buttons (lib/quick-loads.ts) to offer the next weight down / up that
// actually exists. One gym's dumbbells go up in 2kg, another's in 2.5kg;
// one has 1.25kg change plates, another only 2.5kg.
//
// The coach sets the default for the organisation (Settings -> Gym
// weights, stored in org settings `load_increments`); an athlete who
// trains somewhere else can set their own gym in the athlete app
// (athletes.load_increments, 0133). Theirs wins, then the coach's, then
// DEFAULT_INCREMENTS.

export type DumbbellSteps = "1" | "2" | "2.5" | "1-2" | "1-2.5";

export interface LoadIncrements {
  dumbbell: DumbbellSteps; // "1-2" = 1kg up to 10kg, then 2kg
  kettlebell: number; // kg between bells
  plate: number; // smallest plate - a barbell goes up by two of them
  machine: number; // pin-stack / cable steps
}

export const DEFAULT_INCREMENTS: LoadIncrements = { dumbbell: "1-2", kettlebell: 4, plate: 1.25, machine: 2.5 };

export const DUMBBELL_OPTIONS: { value: DumbbellSteps; label: string }[] = [
  { value: "1-2", label: "1kg up to 10kg, then 2kg" },
  { value: "1-2.5", label: "1kg up to 10kg, then 2.5kg" },
  { value: "1", label: "Every 1kg" },
  { value: "2", label: "Every 2kg" },
  { value: "2.5", label: "Every 2.5kg" },
];
export const KETTLEBELL_OPTIONS = [2, 4].map((v) => ({ value: v, label: `Every ${v}kg` }));
export const PLATE_OPTIONS = [0.5, 1, 1.25, 2.5].map((v) => ({ value: v, label: `${v}kg plates (bar +${v * 2}kg)` }));
export const MACHINE_OPTIONS = [1, 2.5, 5].map((v) => ({ value: v, label: `Every ${v}kg` }));

export function resolveIncrements(
  athlete: Partial<LoadIncrements> | null | undefined,
  org: Partial<LoadIncrements> | null | undefined
): LoadIncrements {
  return { ...DEFAULT_INCREMENTS, ...clean(org), ...clean(athlete) };
}

// Drops unset / invalid fields so a partial object never blanks a default.
function clean(v: Partial<LoadIncrements> | null | undefined): Partial<LoadIncrements> {
  if (!v || typeof v !== "object") return {};
  const out: Partial<LoadIncrements> = {};
  if (DUMBBELL_OPTIONS.some((o) => o.value === v.dumbbell)) out.dumbbell = v.dumbbell;
  for (const k of ["kettlebell", "plate", "machine"] as const) {
    const n = Number(v[k]);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

export type Kit = "dumbbell" | "kettlebell" | "barbell" | "machine" | "other";

/** What an exercise is loaded with, from its name. */
export function kitFor(name: string): Kit {
  const n = name.toLowerCase();
  if (/kettlebell|\bkb\b/.test(n)) return "kettlebell";
  if (/dumbbell|\bdb\b|goblet/.test(n)) return "dumbbell";
  if (/machine|cable|pulldown|pull-down|leg press|leg extension|leg curl|pec deck|smith|seated row|lat pull/.test(n)) return "machine";
  if (/barbell|\bbb\b|trap bar|hex bar|squat|deadlift|bench press|overhead press|military press|clean|snatch|jerk|hip thrust|good morning|rdl|romanian/.test(n)) return "barbell";
  return "other";
}

/** The next weight up/down from `kg` for this exercise in this gym. */
export function stepFor(name: string, kg: number, inc: LoadIncrements = DEFAULT_INCREMENTS): number {
  switch (kitFor(name)) {
    case "dumbbell": {
      const [light, heavy] = inc.dumbbell.includes("-") ? inc.dumbbell.split("-").map(Number) : [Number(inc.dumbbell), Number(inc.dumbbell)];
      return kg < 10 ? light : heavy;
    }
    case "kettlebell": return inc.kettlebell;
    case "barbell": return inc.plate * 2;
    case "machine": return inc.machine;
    default: return kg < 12 ? 1 : inc.plate * 2;
  }
}
