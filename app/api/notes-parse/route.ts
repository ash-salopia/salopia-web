import { NextRequest, NextResponse } from "next/server";

// ── Types ─────────────────────────────────────────────────────────────────────

type ConvMessage = { role: "user" | "assistant"; content: string };

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
}

export interface ParsedSession {
  name: string;
  exercises: ParsedExerciseWithMatch[];
  type?: string;       // "strength" | "power_speed" | "cardio" | "hyrox"
  date?: string;       // ISO date YYYY-MM-DD if a specific date was mentioned
  dayOffset: number;   // 0=Mon, 1=Tue … relative offset if no specific date
  weekNumber: number;  // 1-based
}

interface RouteBody {
  text: string;
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
You are a strength & conditioning programming assistant. You parse coaching notes, session plans, and spreadsheet data into structured training sessions.

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
          "each_side": false
        }
      ]
    }
  ],
  "unmatchedExercises": ["Names of exercises that could not be matched to the library"],
  "message": "1-2 sentence summary of what you found and parsed."
}

Library matching rules:
- Match each exercise to the closest library entry using fuzzy logic
- Common abbreviations: BS=Back Squat, RDL=Romanian Deadlift, BP=Bench Press, DL=Deadlift, OHP=Overhead Press, SQ=Squat, DB=Dumbbell, BB=Barbell, BW=Bodyweight
- If matched: use the EXACT library name, set matched=true
- If no reasonable match: use best interpretation from the notes, set matched=false
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
- order: string label for the exercise position. Use "1", "2", "3" for sequential exercises.
- For supersets use "1A", "1B", "2A", "2B" etc. If notes say "1A/1B" that means a superset pair - use "1A" and "1B"
- Always assign order based on the notation in the notes
- Exercises within the same session must be in order (1A before 1B, 2A before 2B etc.)

When handling a correction: update only what was mentioned, return the COMPLETE updated sessions array.
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

  const { text, libraryNames = [], history = [] } = body;

  if (!text?.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const messages: ConvMessage[] = [
    ...history,
    { role: "user", content: text },
  ];

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096, // More than voice-parse - multi-session output can be long
        system: buildSystem(libraryNames),
        messages,
      }),
    });
  } catch {
    return NextResponse.json({ error: "Could not reach AI service" }, { status: 502 });
  }

  if (!anthropicRes.ok) {
    const detail = await anthropicRes.text().catch(() => "");
    return NextResponse.json(
      { error: `AI request failed (${anthropicRes.status}): ${detail}` },
      { status: 500 }
    );
  }

  const anthropicData = await anthropicRes.json();
  const raw: string = anthropicData?.content?.[0]?.text ?? "{}";

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
