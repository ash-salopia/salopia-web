// Normalizes an exercise name for matching against the library: expands
// common fitness abbreviations to their canonical form and strips simple
// trailing-s pluralization, so e.g. "DB Lateral Raises" and "Dumbbell
// Lateral Raise" normalize to the same string. This is deliberately
// narrow (a fixed abbreviation table + one plural rule), not general
// fuzzy/edit-distance matching — it only ever merges names a coach would
// consider obviously identical, never two different exercises that
// merely look similar.
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bdb\b/g, "dumbbell"],
  [/\bbb\b/g, "barbell"],
  [/\bkb\b/g, "kettlebell"],
  [/\bsl\b/g, "single leg"],
  [/\bsa\b/g, "single arm"],
];

export function normalizeExerciseName(name: string): string {
  let n = name.trim().toLowerCase().replace(/\s+/g, " ");
  for (const [pattern, expansion] of ABBREVIATIONS) {
    n = n.replace(pattern, expansion);
  }
  n = n.replace(/\s+/g, " ").trim();
  if (n.length > 3 && n.endsWith("s")) n = n.slice(0, -1);
  return n;
}
