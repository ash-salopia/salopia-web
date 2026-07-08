import { NextRequest, NextResponse } from "next/server";

type ConvMessage = { role: "user" | "assistant"; content: string };

export interface SessionChange {
  session_id: string;
  session_name: string;
  exercise_id: string;
  exercise_name: string;
  field: "name" | "sets" | "reps" | "target_load" | "rest" | "tempo" | "notes";
  old_value: string;
  new_value: string;
  reason: string;
}

const SYSTEM = `You are a strength & conditioning assistant helping a coach modify an athlete's upcoming training sessions.

The coach will describe changes they want to make in natural language. Analyse the current sessions and return specific, targeted changes as JSON.

Always respond with valid JSON only - no markdown, no backticks:
{
  "changes": [
    {
      "session_id": "exact uuid from the data",
      "session_name": "session name for display",
      "exercise_id": "exact uuid from the data",
      "exercise_name": "exercise name for display",
      "field": "sets",
      "old_value": "3",
      "new_value": "4",
      "reason": "One sentence explaining why"
    }
  ],
  "message": "Brief summary of proposed changes."
}

Field options: name, sets, reps, target_load, rest, tempo, notes
All values are strings (e.g. sets: "4" not 4, reps: "8-10")

Rules:
- Use exact session_id and exercise_id UUIDs from the provided data
- Only modify exercises that exist in the upcoming sessions
- Be specific - only change what the coach mentioned
- To replace one exercise with a different one (e.g. "replace X with Y"), use field "name" with old_value the current exercise name and new_value the replacement name - this changes which exercise it is, not just a parameter of it
- If the instruction is vague ("reduce volume"), apply a sensible interpretation and explain it in reason
- Return an empty changes array if nothing applicable was found
- Keep reasons brief and factual`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  let instruction: string;
  let sessions: any[];
  let history: ConvMessage[];

  try {
    const body = await req.json();
    instruction = body.instruction ?? "";
    sessions = body.sessions ?? [];
    history = body.history ?? [];
    if (!instruction.trim()) throw new Error();
  } catch {
    return NextResponse.json({ error: "instruction and sessions required" }, { status: 400 });
  }

  // Build compact session context for Claude
  const sessionContext = sessions.map((s: any) => ({
    id: s.id,
    name: s.name,
    date: s.date,
    exercises: (s.exercises ?? []).map((e: any) => ({
      id: e.id,
      name: e.name,
      sets: e.sets,
      reps: e.reps,
      target_load: e.target_load,
      rest: e.rest,
      tempo: e.tempo,
    })),
  }));

  const messages: ConvMessage[] = [
    ...history,
    {
      role: "user",
      content: `Instruction: ${instruction}\n\nUpcoming sessions:\n${JSON.stringify(sessionContext, null, 2)}`,
    },
  ];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096, // bulk multi-session edits (e.g. "from the 9th onwards") can produce many change objects
      system: SYSTEM,
      messages,
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }

  const data = await res.json();
  const raw = data?.content?.[0]?.text ?? "{}";

  let parsed: { changes?: SessionChange[]; message?: string };
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return NextResponse.json({ error: "Could not parse AI response" }, { status: 500 });
  }

  const updatedHistory: ConvMessage[] = [
    ...messages,
    { role: "assistant", content: raw },
  ];

  return NextResponse.json({
    changes: parsed.changes ?? [],
    message: parsed.message ?? "",
    history: updatedHistory,
  });
}
