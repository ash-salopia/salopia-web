// Normalizes an exercise name for matching against the library: expands
// common fitness abbreviations to their canonical form and strips simple
// trailing-s pluralization, so e.g. "DB Lateral Raises" and "Dumbbell
// Lateral Raise" normalize to the same string. This is deliberately
// narrow (a fixed abbreviation table + plural/punctuation rules), not
// general fuzzy/edit-distance matching — it only ever merges names a
// coach would consider obviously identical, never two different
// exercises that merely look similar.
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bdbs?\b/g, "dumbbell"],
  [/\bbbs?\b/g, "barbell"],
  [/\bkbs?\b/g, "kettlebell"],
  [/\bsl\b/g, "single leg"],
  [/\bsa\b/g, "single arm"],
  [/\bbw\b/g, "bodyweight"],
  [/\brdls?\b/g, "romanian deadlift"],
  [/\bsldls?\b/g, "stiff leg deadlift"],
  [/\bohp\b/g, "overhead press"],
  [/\brfess\b/g, "rear foot elevated split squat"],
  [/\bbss\b/g, "bulgarian split squat"],
  [/\bmb\b/g, "medicine ball"],
  [/\bmed ball\b/g, "medicine ball"],
  [/\bcmj\b/g, "countermovement jump"],
  [/\bbody weight\b/g, "bodyweight"],
  [/\bdumb bell\b/g, "dumbbell"],
  [/\bkettle bell\b/g, "kettlebell"],
  [/\bpress ups?\b/g, "push up"],
  [/\bpressups?\b/g, "push up"],
  [/\bpushups?\b/g, "push up"],
  [/\bpull ?ups?\b/g, "pull up"],
  [/\bchin ?ups?\b/g, "chin up"],
  [/\bsit ups?\b/g, "sit up"],
  [/\bsitups?\b/g, "sit up"],
  [/\bbiceps\b/g, "bicep"],
  [/\btriceps\b/g, "tricep"],
];

export function normalizeExerciseName(name: string): string {
  // Hyphens, slashes, brackets, commas, full stops -> spaces, so
  // "Single-Leg RDL" and "Single Leg RDL" read the same.
  let n = name.trim().toLowerCase().replace(/[-_/(),.&+]/g, " ").replace(/\s+/g, " ");
  for (const [pattern, expansion] of ABBREVIATIONS) {
    n = n.replace(pattern, expansion);
  }
  // Plurals on any word ("Lateral Raises", "Push Ups"), but not short
  // words or ones that are never plurals ("press", "cross", "abs").
  n = n
    .split(" ")
    .map((w) =>
      w.length > 4 && /(ss|ch|sh|x)es$/.test(w) ? w.slice(0, -2) // presses, crunches
      : w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w) ? w.slice(0, -1)
      : w
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return n;
}

/**
 * Library search: does `name` match what the coach typed? Every word of
 * the query must appear in the name (any order, prefix of a word is
 * enough), with abbreviations expanded on BOTH sides - so "dumbbell
 * bench" finds "DB Bench Press", "db press" finds "Dumbbell Shoulder
 * Press", and "rdl" finds "Romanian Deadlift". Empty query matches all.
 */
export function exerciseMatchesQuery(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (name.toLowerCase().includes(q)) return true;
  const hay = normalizeExerciseName(name).split(" ");
  const raw = name.toLowerCase().replace(/[-_/(),.&+]/g, " ").split(/\s+/);
  const words = normalizeExerciseName(q).split(" ").filter(Boolean);
  // A half-typed word ("dumb", "kettl") won't expand, so also try it raw.
  const rawWords = q.replace(/[-_/(),.&+]/g, " ").split(/\s+/).filter(Boolean);
  const has = (w: string) => hay.some((h) => h.startsWith(w)) || raw.some((h) => h.startsWith(w));
  return words.every(has) || rawWords.every(has);
}
