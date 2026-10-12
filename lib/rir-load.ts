// ─────────────────────────────────────────────────────────────────────────────
// lib/rir-load.ts
//
// Converts a "reps performed × target Reps-in-Reserve" prescription into a
// suggested %1RM, so an RIR-prescribed set can show the coach a concrete
// suggested kg the same way a %1RM-prescribed set already does (see
// calculateSetTargets in lib/one-rm.ts, which this mirrors exactly).
//
// Table is the published Zourdos/Helms (2016) RPE-based %1RM chart — the
// current industry standard, reproduced near-identically across RTS,
// Juggernaut AI, RP's apps etc. RIR = 10 − RPE (RIR 0 = RPE 10 = failure).
//
// Sourced directly for RIR 0–3 (RPE 10–7), reps 1–12. RIR 4 is extrapolated
// by continuing each rep-row's own RIR2→RIR3 decrement one more step, rather
// than a guessed flat number — the table's per-step decay is fairly linear
// in this range, but it's explicitly an extrapolation beyond the sourced
// data, not a second published data point. RIR 5+ and reps beyond 12 aren't
// supported (returns null) — both are where this kind of estimate is known
// to get much less reliable anyway: 1RM-estimation formulas themselves break
// down past ~10 reps, and a lifter's own reps-in-reserve self-estimate gets
// less accurate the further they are from failure. There's little value in
// a precise-looking number built on genuinely unreliable inputs at either
// extreme, so this deliberately declines to produce one.
// ─────────────────────────────────────────────────────────────────────────────

// [reps 1..12][RIR 0..3] = %1RM
const RIR_PCT_TABLE: readonly (readonly number[])[] = [
  // RIR:    0    1    2    3
  [100, 96, 92, 89], // 1 rep
  [96, 92, 89, 86],  // 2 reps
  [92, 89, 86, 83],  // 3 reps
  [89, 86, 83, 81],  // 4 reps
  [86, 83, 81, 78],  // 5 reps
  [83, 81, 78, 75],  // 6 reps
  [81, 78, 75, 73],  // 7 reps
  [79, 76, 74, 71],  // 8 reps
  [77, 75, 73, 70],  // 9 reps
  [75, 73, 70, 67],  // 10 reps
  [73, 70, 67, 64],  // 11 reps
  [71, 68, 65, 63],  // 12 reps
];

export const MIN_TARGET_RIR = 0;
export const MAX_TARGET_RIR = 4;

// %1RM for N reps performed at a target Reps-in-Reserve. null when outside
// the supported range (see file header for why those bounds are deliberate).
export function percentFromRepsAndRIR(reps: number, rir: number): number | null {
  if (!Number.isFinite(reps) || reps < 1 || reps > 12) return null;
  if (!Number.isFinite(rir) || rir < MIN_TARGET_RIR || rir > MAX_TARGET_RIR) return null;
  const row = RIR_PCT_TABLE[Math.round(reps) - 1];
  if (rir <= 3) return row[Math.round(rir)];
  // RIR 4 — continue this row's own RIR2→RIR3 decrement one more step.
  const step = row[3] - row[2];
  return Math.max(0, row[3] + step);
}

// Per-set kg targets for an RIR-prescribed exercise, given its resolved
// 1RM, prescribed reps (a single count — a rep RANGE like "8-12" should be
// passed in already reduced to one number, e.g. via parseRepsStr, same
// lower-bound convention the rolling e1RM estimator elsewhere uses) and
// set_rir. null entries are sets with no/invalid/out-of-range RIR
// prescribed. Same 0.5kg rounding convention as calculateSetTargets.
export function calculateSetTargetsFromRIR(
  oneRM: number,
  reps: number,
  setRIR: (string | undefined)[]
): (number | null)[] {
  return setRIR.map((r) => {
    const rir = parseFloat(String(r ?? ""));
    if (isNaN(rir)) return null;
    const pct = percentFromRepsAndRIR(reps, rir);
    if (pct == null) return null;
    return Math.round(((oneRM * pct) / 100) * 2) / 2;
  });
}
