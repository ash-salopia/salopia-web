import { NextRequest, NextResponse } from "next/server";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConvMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ParsedExercise {
  name: string;
  sets: number;
  reps: string;
  rest: string;
  target_load: string;
  tempo: string;
  notes: string;
  time: string;
  order: string;
  each_side: boolean;
}

interface ParseResponse {
  exercises: ParsedExercise[];
  message: string;
  history: ConvMessage[];
}

// ── System prompt ─────────────────────────────────────────────────────────────
// Claude always returns the FULL exercise list (never a delta) so the client
// can just replace whatever it had - this keeps the correction loop simple.

const SYSTEM = `You are a strength & conditioning programming assistant. Coaches speak their session plans to you and you parse them into structured exercise data.

Always respond with valid JSON only - no markdown, no backticks, no preamble. Use this exact format:
{
  "exercises": [
    {
      "name": "Exercise Name",
      "order": "1",
      "sets": 3,
      "reps": "8",
      "rest": "90s",
      "target_load": "80kg",
      "tempo": "",
      "notes": "",
      "time": "",
      "each_side": false
    }
  ],
  "message": "One sentence confirming what you parsed or changed."
}

Field rules:
- name: Capitalise properly. "back squat" → "Back Squat", "rdl" → "Romanian Deadlift"
- sets: integer
- reps: string - "8", "8-10", "AMRAP", "Max", etc. Empty string if none mentioned
- rest: normalise to "90s", "2min", "3min". Empty string if not mentioned
- target_load: "80kg", "RPE 8", "bodyweight", "60% 1RM". Empty string if not mentioned
- tempo: "3-1-2" format. Empty string if not mentioned
- time: for timed sets, e.g. "30s", "1min". Empty string if not reps-based
- each_side: true only if coach explicitly says "each side", "per side", "each leg/arm"
- order: "1","2","3" sequential; "1A","1B" for supersets. Always assign.
- notes: any other instruction that doesn't fit the above

Correction rules:
- When the user says "correction" or describes a change, update only the exercise(s) mentioned
- Return the COMPLETE updated exercises array, not just the changed ones
- Infer exercise number from "exercise 1", "first exercise", "the squat", etc.

Keep "message" to one sentence, friendly and direct.`;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse<ParseResponse | { error: string }>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  let transcript: string;
  let history: ConvMessage[];

  try {
    const body = await req.json();
    transcript = body.transcript ?? "";
    history = body.history ?? [];
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!transcript.trim()) {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
  }

  const messages: ConvMessage[] = [
    ...history,
    { role: "user", content: transcript },
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
        max_tokens: 1024,
        system: SYSTEM,
        messages,
      }),
    });
  } catch (e) {
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

  let parsed: { exercises?: ParsedExercise[]; message?: string };
  try {
    // Strip any accidental markdown fences before parsing
    const clean = raw.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    return NextResponse.json(
      { error: "AI returned an unexpected format - please try again" },
      { status: 500 }
    );
  }

  // Normalise defaults so the client can rely on all fields being present
  const exercises: ParsedExercise[] = (parsed.exercises ?? []).map((e) => ({
    name: e.name ?? "",
    order: String(e.order ?? ""),
    sets: typeof e.sets === "number" ? e.sets : parseInt(String(e.sets), 10) || 3,
    reps: e.reps ?? "",
    rest: e.rest ?? "",
    target_load: e.target_load ?? "",
    tempo: e.tempo ?? "",
    notes: e.notes ?? "",
    time: e.time ?? "",
    each_side: !!e.each_side,
  }));

  const updatedHistory: ConvMessage[] = [
    ...messages,
    { role: "assistant", content: raw },
  ];

  return NextResponse.json({
    exercises,
    message: parsed.message ?? "",
    history: updatedHistory,
  });
}
