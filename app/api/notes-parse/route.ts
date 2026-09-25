import { NextRequest, NextResponse } from "next/server";
import { AI_MODEL, callClaude } from "@/lib/ai/claude";
import { QUALITY_META, isPSMetricKey } from "@/lib/ps-metrics";

// ── Types ─────────────────────────────────────────────────────────────────────

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

type ConvMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };

export interface ParsedExerciseWithMatch {
  name: string;
  order: string;  // "1", "1A", "1B", "2" etc.
  matched: boolean;
  sets: number;
  reps: string;
  rest: string;
  target_load: string;
  tempo: string;
  notes: string;
  time: string;
  each_side: boolean;
  // Power/Speed-only fields — undefined/empty for every other session
  // type. Without these a "power_speed" session built from a PDF landed
  // with every exercise on "General" quality and no metrics ticked, so
  // e.g. a Broad Jump's "Plyo contacts" total always read "-" until the
  // coach manually classified every exercise by hand after import
  // (0104) — see the "Power/Speed exercise setup" system-prompt section.
  ps_quality?: string;          // "acceleration"|"max_velocity"|"plyometric"|"cod"|"deceleration"|""
  ps_distance?: string;         // prescribed distance e.g. "20m" (sprints/throws)
  // Plyometric-only contacts-PER-REP multiplier (the app calculates the
  // total automatically as sets × reps) - null for the normal
  // one-contact-per-rep case, a number only when one "rep" is actually
  // several ground contacts (e.g. a rapid multi-hop drill).
  ps_contacts?: number | null;
  ps_tracked_metrics?: string[]; // e.g. ["time","distance"] — which boxes the athlete logs
}

export interface ParsedSession {
  name: string;
  exercises: ParsedExerciseWithMatch[];
  type?: string;       // "strength" | "power_speed" | "cardio" | "hyrox"
  date?: string;       // ISO date YYYY-MM-DD if a specific date was mentioned
  dayOffset: number;   // 0=Mon, 1=Tue … relative offset if no specific date
  weekNumber: number;  // 1-based
  // Warm-up/cool-down movements, summarised as free text rather than
  // added to `exercises` as individually-tracked lifts — see the system
  // prompt's "Warm-up and cool-down" section. Land in session_notes
  // (top of session) / cooldown_notes (bottom) respectively; empty
  // string when the source had none.
  warmupNotes?: string;
  cooldownNotes?: string;
}

interface RouteBody {
  text?: string;
  pdfBase64?: string;
  libraryNames: string[];
  history?: ConvMessage[];
}

interface ParseResponse {
  sessions: ParsedSession[];
  unmatchedExercises: string[];
  message: string;
  history: ConvMessage[];
}

// ── System prompt ─────────────────────────────────────────────────────────────

const buildSystem = (libraryNames: string[]) => `
You are a strength & conditioning programming assistant. You parse coaching notes, session plans, spreadsheet data, and printed or scanned session PDFs into structured training sessions.

Always respond with valid JSON only - no markdown, no backticks, no preamble.

${libraryNames.length > 0 ? `The coach's exercise library contains these exercises (use EXACT names when matching):
${libraryNames.join(", ")}` : "The coach has no library entries yet."}

Response format:
{
  "sessions": [
    {
      "name": "Session name",
      "type": "strength",
      "date": "2026-06-26",
      "dayOffset": 0,
      "weekNumber": 1,
      "warmupNotes": "5 min bike\nBand pull-aparts x15\nBodyweight squats x10",
      "cooldownNotes": "5 min easy row\nHamstring stretch\nHip flexor stretch",
      "exercises": [
        {
          "name": "Exercise name",
          "order": "1",
          "matched": true,
          "sets": 3,
          "reps": "8",
          "rest": "90s",
          "target_load": "80kg",
          "tempo": "",
          "notes": "",
          "time": "",
          "each_side": false,
          "ps_quality": "",
          "ps_distance": "",
          "ps_contacts": null,
          "ps_tracked_metrics": []
        }
      ]
    }
  ],
  "unmatchedExercises": ["Names of exercises that could not be matched to the library"],
  "message": "1-2 sentence summary of what you found and parsed."
}

Library matching rules:
- Only match an exercise to a library entry if it is genuinely the SAME exercise under a different name — an abbreviation, plural, or equipment-naming variant of the identical movement (e.g. "DB Lateral Raises" = "Dumbbell Lateral Raise", "RDL" = "Romanian Deadlift").
- NEVER match just because two names share a family or keyword. Split Squat, Bulgarian Split Squat, Lunge, Step-Up, Front Squat, Back Squat, Goblet Squat, and Overhead Squat are all DIFFERENT exercises even though "squat" appears in several. The same applies to every other family: Deadlift variants (RDL, Sumo, Deficit, Single-Leg), Press variants (Bench, Incline, Overhead, Push Press), Row variants, Curl variants, etc. Match only true synonyms of the identical exercise — never the "closest relative."
- If genuinely uncertain whether two names are the same exercise, do NOT match (matched=false) — the coach can create it as a new library entry in one tap, which is cheap and safe. A wrong match silently attaches logged data to the wrong exercise's history and PBs, which is much worse than an unmatched exercise.
- Common abbreviations for genuinely identical exercises: BS=Back Squat, RDL=Romanian Deadlift, BP=Bench Press, DL=Deadlift, OHP=Overhead Press, SQ=Squat, DB=Dumbbell, BB=Barbell, BW=Bodyweight
- If matched: use the EXACT library name, set matched=true
- If no confident match: use the coach's own wording from the notes, set matched=false
- List all unmatched names in unmatchedExercises

Session type detection:
- Add "type" to each session: "strength" | "power_speed" | "cardio" | "hyrox"
- "power_speed" if session contains sprints, plyometrics, jumps, agility, throws, speed work
- "strength" for weights, sets/reps, resistance
- "cardio" for endurance without structure
- "hyrox" if Hyrox is mentioned
- Default: "strength"

Session detection rules:
- Detect how many distinct sessions are described - one or many
- Single session: name it clearly (e.g. "Upper Body", "Strength A")
- Multiple sessions per week: name each (e.g. "Upper A", "Lower A")
- Multi-week: include week numbers
- date: if a specific date is mentioned (e.g. "26/06/2026", "June 26", "next Monday"), extract it as YYYY-MM-DD. Today is 2026-06-24. Leave null if no specific date mentioned.
- dayOffset: days from start - Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
  - If training days are specified (Mon/Wed/Fri): use those offsets (0, 2, 4)
  - If only order given (Day 1/Day 2/Day 3): use 0, 1, 2
  - If no day info: space 1 day apart (0, 1, 2…)
- weekNumber: 1-based (Week 1=1, Week 2=2…); always 1 for single-week content

Warm-up and cool-down:
- A session often opens with general prep (mobility, activation, an easy bike/row, band work) and/or closes with a cool-down (easy cardio, stretching) — these are NOT part of the tracked training block.
- Do NOT add warm-up or cool-down movements to "exercises" — nobody logs sets/reps/load history against them, so turning each one into a tracked exercise just clutters the session.
- Instead, list them as plain text in "warmupNotes" / "cooldownNotes" — ONE ITEM PER LINE, separated by a literal "\n" in the JSON string, the same vertical list shape the source shows them in. Do NOT collapse them into one comma-separated sentence or paragraph — a coach reading this in the app should see the same list they'd see on the original page, e.g.:
  "warmupNotes": "5 min bike\nBand pull-aparts x15\nBodyweight squats x10\nWorld's greatest stretch x5 each side"
  If the source gives a set/rep/duration for a warm-up or cool-down item, keep it on that line (e.g. "Band pull-aparts x15"), exactly as it's written there — don't drop the detail just because it's not a tracked exercise.
- If a session has no warm-up or no cool-down described, use an empty string "" for that field — never omit it, and never guess one that wasn't in the source.
- Only the genuinely tracked working sets (the main lifts, conditioning pieces, plyo/speed work etc. the coach actually prescribed sets/reps/load for) go into "exercises".

Exercise field rules:
- sets: integer, default 3 if unclear
- reps: string - "8", "8-10", "AMRAP". Empty if none
- rest: "90s", "2min". Empty if none
- target_load: "80kg", "RPE 8", "bodyweight". Empty if none
- tempo: "3-1-2" format. Empty if none
- time: "30s", "1min" for timed sets. Empty if reps-based
- each_side: true only if explicitly mentioned
- notes: any other instruction that doesn't fit above

Exercise ordering rules:
- order: string label for the exercise position. A session is a sequence of numbered "blocks" (1, 2, 3…); a block that groups multiple exercises together (superset/tri-set/giant-set/circuit) letters them A, B, C… within that block instead of just using the plain number. A standalone exercise that isn't grouped with anything keeps a plain number ("1", "2", "3") - do NOT letter-suffix it.
- Grouping trigger words - all of these mean "group these exercises into one lettered block": "superset"/"super set"/"super", "tri set"/"triset", "giant set", "circuit". Also treat "trust" as "tri set" - it's a common voice-transcription mishearing of "tri set", not the coach actually saying "trust".
- If the notes name the exercises explicitly for a group (e.g. "super these exercises: back squat and bench press" or "tri set these exercises: dead bug, side plank and pallof press"), group exactly those named exercises together, in the order given - back squat/bench press becomes "1A"/"1B"; dead bug/side plank/pallof press becomes the NEXT block, e.g. "2A"/"2B"/"2C".
- If the trigger word appears with no explicit exercise list, apply it to the next exercises in the list in order: 2 exercises for "superset"/"super set", 3 for "tri set"/"triset"/"trust", or however many the phrasing implies (e.g. "giant set of 4" = 4).
- The block NUMBER increments by one for every block (grouped or standalone) as you move down the session - it does not reset or skip. E.g. a tri-set of 3 exercises followed by a superset of 2 followed by one standalone exercise becomes: 1A, 1B, 1C, 2A, 2B, 3.
- Always assign order based on the notation/wording in the notes, using the rules above when notation is absent.
- Exercises within the same session must be in order (1A before 1B, 2A before 2B etc.)

Power/Speed exercise setup (only for exercises inside a "power_speed" session — leave ps_quality/ps_distance/ps_contacts/ps_tracked_metrics as "" / "" / null / [] for every strength/cardio/hyrox exercise):
- ps_quality: classify each exercise into exactly one of "acceleration" (short sprints, starts, ~≤10-20m flat-out), "max_velocity" (flying sprints, top-speed segments, longer flat-out runs), "plyometric" (jumps, hops, bounds, depth jumps, throws/tosses — anything landing/absorbing force or explosively releasing an implement), "cod" (change of direction, agility, shuttle, 5-0-5-style drills), "deceleration" (drills explicitly about braking/stopping/landing control rather than producing force), or "" if none of those genuinely fit. Do not force a fit — "" (General) is correct for something that doesn't match any of them.
- ps_distance: the prescribed distance for that exercise exactly as written (e.g. "20m", "220cm", "10m") — only for sprint/throw-type exercises that have one; "" if none is given.
- ps_contacts: the app totals plyometric ground contacts automatically as sets × reps, so this is NOT the total contact count — leave it null for the normal case (e.g. "Broad Jump x5" is 5 reps of 1 contact each; leave ps_contacts null and let sets × reps give 5). Only set it, for "plyometric" exercises alone, when the source makes clear that ONE rep is itself several ground contacts (e.g. "5 sets of 3 continuous hops" where each rep/set is 3 quick hops in a row) — in that case set it to the contacts-per-rep count (3 here), not the grand total. null for every non-plyometric exercise and for every ordinary single-contact-per-rep plyometric.
- ps_tracked_metrics: which of these the source actually gives a number for on this exercise, as an array of these exact keys only: "load" (an external weight/resistance), "reps" (a rep count logged per set, distinct from the prescribed "reps" field), "time" (a duration, e.g. sprint time), "distance" (a distance in METRES — sprint/flying-run distance), "distance_cm" (a distance in CENTIMETRES — jump/throw distance, e.g. broad jump), "height" (jump height in cm), "velocity" (a speed in m/s), "power" (watts), "rsi" (reactive strength index), "contact_time" (ground contact time in ms). Only include a key when the source genuinely gives that number to log against — do not guess extras just because the exercise "could" track them. A plain "Broad Jump x5" with no numbers beyond reps/contacts gets ps_tracked_metrics: [] (the athlete just ticks each set done); a "10m Sprint - record time" gets ["time"]; a timed sprint with a stated distance gets ["time","distance"].

When handling a correction: update only what was mentioned, return the COMPLETE updated sessions array.

Splitting or merging sessions during a correction:
- If asked to split one session into multiple (e.g. "split the first 3 exercises into a plyo/speed session and the rest into strength"), the response MUST contain one entry in "sessions" per resulting session — this is a structural change to the array itself, not a relabelling of exercises within a single session. Each new session needs its own accurate "type" (the plyo/speed one should be "power_speed", not "strength", unless told otherwise), its own "name", and inherits the original "date"/"dayOffset"/"weekNumber" unless the coach specifies otherwise for one of them. Move each mentioned exercise into its new session's "exercises" array — do not duplicate it into both.
- If asked to merge multiple sessions into one, the opposite applies: return exactly one session entry containing every exercise from all the merged sessions, in a sensible combined order, with "type" set to whichever makes sense for the merged content (ask yourself what the majority of the content is, don't just keep the first session's type by default).
- After a split or merge, re-count "exercises" across the result and confirm every exercise from before the correction still appears exactly once, in exactly one session, unless the coach explicitly asked for one to be removed.
`.trim();

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest
): Promise<NextResponse<ParseResponse | { error: string }>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  let body: RouteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { text, pdfBase64, libraryNames = [], history = [] } = body;

  if (!text?.trim() && !pdfBase64) {
    return NextResponse.json({ error: "text or pdfBase64 is required" }, { status: 400 });
  }

  // A PDF page (e.g. a printed/scanned session sheet) is sent as a
  // document block alongside any typed context, so Claude reads the
  // page directly (tables, layout, handwriting) rather than relying on
  // a client-side text extraction that would fail on scanned pages.
  const userContent: string | ContentBlock[] = pdfBase64
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
        { type: "text", text: text?.trim() || "Parse this session PDF into structured training session(s)." },
      ]
    : (text as string);

  const messages: ConvMessage[] = [
    ...history,
    { role: "user", content: userContent },
  ];

  // Messy spreadsheet → structured multi-session output: accuracy-
  // critical, kept on the stronger model. max_tokens high (long output).
  const r = await callClaude({ model: AI_MODEL.parse, system: buildSystem(libraryNames), maxTokens: 4096, messages });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });

  const raw: string = r.text || "{}";

  let parsed: { sessions?: ParsedSession[]; unmatchedExercises?: string[]; message?: string };
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    return NextResponse.json(
      { error: "AI returned an unexpected format - please try again" },
      { status: 500 }
    );
  }

  // Normalise all fields so the client can rely on them being present
  const sessions: ParsedSession[] = (parsed.sessions ?? []).map((s) => ({
    name: s.name ?? "Session",
    type: (["strength","power_speed","cardio","hyrox"] as const).includes(s.type as any) ? s.type : "strength",
    date: s.date ?? undefined,
    dayOffset: typeof s.dayOffset === "number" ? s.dayOffset : 0,
    weekNumber: typeof s.weekNumber === "number" ? Math.max(1, s.weekNumber) : 1,
    warmupNotes: typeof s.warmupNotes === "string" ? s.warmupNotes : "",
    cooldownNotes: typeof s.cooldownNotes === "string" ? s.cooldownNotes : "",
    exercises: (s.exercises ?? []).map((e) => ({
      name: e.name ?? "",
      order: String(e.order ?? ""),
      matched: !!e.matched,
      sets: typeof e.sets === "number" ? e.sets : parseInt(String(e.sets), 10) || 3,
      reps: e.reps ?? "",
      rest: e.rest ?? "",
      target_load: e.target_load ?? "",
      tempo: e.tempo ?? "",
      notes: e.notes ?? "",
      time: e.time ?? "",
      each_side: !!e.each_side,
      // Validated against the real quality/metric-key sets rather than
      // trusted as-is — this lands straight in intensity_label /
      // ps_tracked_metrics columns on save, so a hallucinated key here
      // would otherwise silently corrupt those columns.
      ps_quality: typeof e.ps_quality === "string" && e.ps_quality in QUALITY_META ? e.ps_quality : "",
      ps_distance: typeof e.ps_distance === "string" ? e.ps_distance : "",
      ps_contacts: typeof e.ps_contacts === "number" && e.ps_contacts > 0 ? e.ps_contacts : null,
      ps_tracked_metrics: Array.isArray(e.ps_tracked_metrics) ? e.ps_tracked_metrics.filter(isPSMetricKey) : [],
    })),
  }));

  const updatedHistory: ConvMessage[] = [
    ...messages,
    { role: "assistant", content: raw },
  ];

  return NextResponse.json({
    sessions,
    unmatchedExercises: parsed.unmatchedExercises ?? [],
    message: parsed.message ?? "",
    history: updatedHistory,
  });
}
