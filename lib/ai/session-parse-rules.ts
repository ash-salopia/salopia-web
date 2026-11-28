// Prompt rules shared by the two "build a session" parsers - voice
// (app/api/voice-parse) and typed notes / PDF (app/api/notes-parse) -
// so both handle exercise order (1A/1B supersets), library names
// (DB = Dumbbell) and unstated sets/reps the same way.

export function libraryRules(libraryNames: string[]): string {
  return `${libraryNames.length > 0 ? `The coach's exercise library contains these exercises (use EXACT names when matching):
${libraryNames.join(", ")}` : "The coach has no library entries yet."}

Library matching rules:
- Only match an exercise to a library entry if it is genuinely the SAME exercise under a different name — an abbreviation, plural, or equipment-naming variant of the identical movement (e.g. "dumbbell lateral raises" = "DB Lateral Raise", "barbell hip thrust" = "BB Hip Thrust", "RDL" = "Romanian Deadlift").
- Equipment abbreviations are always interchangeable with the full word, in either direction: DB = Dumbbell, BB = Barbell, KB = Kettlebell, SL = Single Leg, SA = Single Arm, BW = Bodyweight, MB = Med Ball. If the coach says "dumbbell bench press" and the library has "DB Bench Press", use "DB Bench Press".
- NEVER match just because two names share a family or keyword. Split Squat, Bulgarian Split Squat, Lunge, Step-Up, Front Squat, Back Squat, Goblet Squat, and Overhead Squat are all DIFFERENT exercises even though "squat" appears in several. The same applies to every other family: Deadlift variants (RDL, Sumo, Deficit, Single-Leg), Press variants (Bench, Incline, Overhead, Push Press), Row variants, Curl variants, etc. A dumbbell and a barbell version are different exercises too.
- If genuinely uncertain whether two names are the same exercise, do NOT match (matched=false) — the coach can create it as a new library entry in one tap. A wrong match silently attaches logged data to the wrong exercise's history and PBs, which is much worse than an unmatched exercise.
- Common abbreviations for identical exercises: BS=Back Squat, RDL=Romanian Deadlift, BP=Bench Press, DL=Deadlift, OHP=Overhead Press, BSS=Bulgarian Split Squat, RFESS=Rear Foot Elevated Split Squat
- If matched: use the EXACT library name, set matched=true
- If no confident match: use the coach's own wording, properly capitalised, set matched=false`;
}

export const ORDER_RULES = `Exercise ordering rules:
- order: string label for the exercise position. A session is a sequence of numbered "blocks" (1, 2, 3…); a block that groups multiple exercises together (superset/tri-set/giant-set/circuit) letters them A, B, C… within that block. A standalone exercise keeps a plain number ("1", "2", "3") - do NOT letter-suffix it.
- When the coach states the label themselves, ALWAYS put it in "order" (never in notes or the name), normalised to number-then-capital-letter: "1A", "1a", "1 a", "A1", "1A)", "1A." and spoken forms like "one A", "one a", "1 A", "won A", "A one" all mean order "1A"; "two B" = "2B"; "three" / "exercise 3" / "number three" on its own = "3". Strip the label out of the exercise name (e.g. "one A back squat" -> order "1A", name "Back Squat").
- Grouping trigger words - all of these mean "group these exercises into one lettered block": "superset"/"super set"/"super", "tri set"/"triset", "giant set", "circuit", "paired with", "with". Also treat "trust" as "tri set" - a common voice-transcription mishearing.
- If the coach names the exercises for a group (e.g. "superset back squat and bench press"), group exactly those, in the order given - "1A"/"1B"; the next group becomes "2A"/"2B"/... 
- If a trigger word has no explicit list, apply it to the next exercises in order: 2 for a superset, 3 for a tri set, or however many the phrasing implies ("giant set of 4" = 4).
- The block NUMBER increments by one for every block (grouped or standalone) down the session - it never resets or skips. E.g. a tri-set, then a superset, then one standalone exercise = 1A, 1B, 1C, 2A, 2B, 3.
- If the coach gives no labels and no grouping at all, number the exercises 1, 2, 3… in the order given.
- Return exercises in order (1A before 1B, 2A before 2B…).`;

export const DOSE_RULES = `Sets, reps and time:
- sets: integer when the coach states it ("3 sets", "3 by 8", "3x8", "three of eight"). If the coach does NOT state a set count, use null - never 0, never guess. The app fills in the exercise's library default, or 3.
- reps: string - "8", "8-12", "AMRAP", "Max", "5 each side" -> "5" with each_side true. If not stated, use "" (the app fills in the library default or 8-12). "3 by 8 to 12" = sets 3, reps "8-12".
- time: for timed work, e.g. "30s", "45s", "1min" ("3 by 30 seconds" = sets 3, time "30s", reps ""). Only one of reps/time is filled for an exercise.
- Never output 0 sets or "0" reps.`;

/** A set count the coach actually gave, or null (not stated / 0 / junk). */
export function positiveInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** "1a", "1 A", "A1", "1A)" -> "1A"; "3" stays "3"; anything else as given. */
export function normaliseOrder(v: unknown): string {
  const s = String(v ?? "").trim().toUpperCase().replace(/[).:]/g, "").trim();
  let m = s.match(/^(\d+)\s*([A-Z])?$/);
  if (m) return `${m[1]}${m[2] ?? ""}`;
  m = s.match(/^([A-Z])\s*(\d+)$/);
  if (m) return `${m[2]}${m[1]}`;
  return s;
}
