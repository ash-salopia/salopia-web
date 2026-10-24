// Compound vs accessory, from the exercise name. Exercise names are coach
// free text (there's no exercise database), so this is deliberately
// simple keyword matching - a best-effort split, not a guarantee for
// unusual naming. Used by the Squad Report (compounds first) and by the
// training report's Compound lifts / Accessories options.
const COMPOUND_KEYWORDS = [
  "squat", "deadlift", "rdl", "romanian", "trap bar", "hex bar", "good morning",
  "bench", "overhead press", "shoulder press", "military press", "push press", "ohp",
  "row", "pull up", "pull-up", "pullup", "chin up", "chin-up", "chinup",
  "clean", "snatch", "jerk", "hip thrust", "lunge", "step up", "step-up",
];

// Keyword at the start of a word ("Pull Ups", "Rows" still match, "Arrow"
// doesn't).
const COMPOUND_RE = new RegExp(`\\b(?:${COMPOUND_KEYWORDS.map((k) => k.replace(/[-]/g, "\\-")).join("|")})`, "i");

export function isCompoundLift(name: string): boolean {
  return COMPOUND_RE.test(name);
}

// Whether a strength exercise is in the report, given the two options.
// Older saved presets have neither option set - both count as on.
export function exerciseInScope(name: string, opts: { compounds?: boolean; accessories?: boolean }): boolean {
  return isCompoundLift(name) ? opts.compounds !== false : opts.accessories !== false;
}
