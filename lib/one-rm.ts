// ─────────────────────────────────────────────────────────────────────────────
// lib/one-rm.ts
//
// 1RM estimation formulas and weight unit utilities.
// All formulas take weight (in whatever unit) and reps (integer).
// Valid for 1–10 reps; accuracy degrades beyond 10.
// ─────────────────────────────────────────────────────────────────────────────

export type OneRMFormula = "lander" | "epley" | "brzycki" | "oconner" | "lombardi";
export type WeightUnit = "kg" | "lbs";

// ── Formula metadata ──────────────────────────────────────────────────────────

export interface FormulaInfo {
  id: OneRMFormula;
  name: string;
  description: string;
  formula: string; // human-readable
}

export const FORMULAS: FormulaInfo[] = [
  {
    id: "lander",
    name: "Lander",
    description: "Conservative and well-validated. Good for strength athletes.",
    formula: "(100 × w) / (101.3 − 2.67123 × r)",
  },
  {
    id: "epley",
    name: "Epley",
    description: "Most widely used formula. Slightly higher estimates than Lander.",
    formula: "w × (1 + r / 30)",
  },
  {
    id: "brzycki",
    name: "Brzycki",
    description: "Very similar to Epley. Commonly used in US powerlifting.",
    formula: "w × 36 / (37 − r)",
  },
  {
    id: "oconner",
    name: "O'Conner",
    description: "Most conservative formula. Best for beginners or higher rep ranges.",
    formula: "w × (1 + 0.025 × r)",
  },
  {
    id: "lombardi",
    name: "Lombardi",
    description: "Tends to produce slightly higher estimates. Works well for trained athletes.",
    formula: "w × r^0.10",
  },
];

// ── Calculations ──────────────────────────────────────────────────────────────

// Estimate 1RM from weight lifted for N reps.
// Returns null if reps < 1 or weight <= 0.
export function estimateOneRM(
  weight: number,
  reps: number,
  formula: OneRMFormula = "lander"
): number | null {
  if (weight <= 0 || reps < 1) return null;
  if (reps === 1) return weight; // Already a 1RM, no estimation needed

  // Formulas are undefined/inaccurate beyond 10 reps
  const clampedReps = Math.min(reps, 10);

  let result: number;

  switch (formula) {
    case "lander":
      result = (100 * weight) / (101.3 - 2.67123 * clampedReps);
      break;
    case "epley":
      result = weight * (1 + clampedReps / 30);
      break;
    case "brzycki":
      if (clampedReps >= 37) return null; // formula breaks down
      result = weight * (36 / (37 - clampedReps));
      break;
    case "oconner":
      result = weight * (1 + 0.025 * clampedReps);
      break;
    case "lombardi":
      result = weight * Math.pow(clampedReps, 0.1);
      break;
    default:
      result = (100 * weight) / (101.3 - 2.67123 * clampedReps);
  }

  // Round to nearest 0.5kg
  return Math.round(result * 2) / 2;
}

// Find the best estimated 1RM from a set of logged sets.
// Returns the highest 1RM estimate across all completed sets.
export function bestEstimatedOneRM(
  log: Array<{ weight: string; reps: string; done: boolean }>,
  prescribedReps: number,
  formula: OneRMFormula = "lander"
): number | null {
  let best: number | null = null;

  for (const set of log) {
    if (!set.done) continue;
    const w = parseFloat(set.weight);
    if (isNaN(w) || w <= 0) continue;
    const r = parseRepsStr(set.reps) || prescribedReps || 1;
    const est = estimateOneRM(w, r, formula);
    if (est !== null && (best === null || est > best)) {
      best = est;
    }
  }

  return best;
}

// ── Unit conversion ───────────────────────────────────────────────────────────

const LBS_PER_KG = 2.20462;

export function kgToLbs(kg: number): number {
  return Math.round(kg * LBS_PER_KG * 10) / 10;
}

export function lbsToKg(lbs: number): number {
  return Math.round((lbs / LBS_PER_KG) * 10) / 10;
}

// Display a weight value in the correct unit, rounded sensibly.
export function displayWeight(kg: number, unit: WeightUnit): string {
  if (unit === "lbs") {
    const lbs = kgToLbs(kg);
    return `${lbs}lbs`;
  }
  return `${kg}kg`;
}

// Parse a weight string that might be in kg or lbs, return kg value.
export function parseToKg(value: string, unit: WeightUnit): number {
  const n = parseFloat(value);
  if (isNaN(n)) return 0;
  return unit === "lbs" ? lbsToKg(n) : n;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseRepsStr(s: string | null | undefined): number {
  if (!s) return 0;
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}
