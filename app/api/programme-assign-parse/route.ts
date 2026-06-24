import { NextRequest, NextResponse } from "next/server";

const SYSTEM = `You are a coaching assistant parsing a programme assignment instruction.

Extract:
1. Which programme the coach wants to assign (match to the provided list by name similarity)
2. What start date they want
3. How many days between sessions (spacing)

Always respond with valid JSON only - no markdown:
{
  "programmeId": "exact id from the provided list, or null if no match",
  "programmeName": "matched name or what you heard",
  "startDate": "YYYY-MM-DD",
  "spacingDays": 2,
  "confidence": 0.9,
  "message": "Brief confirmation of what you understood"
}

Date parsing rules:
- "this Monday" / "next Monday" → calculate from today
- "1st January" → use the next occurrence of that date
- "today" → today's date
- If no date mentioned, default to today
- Always output YYYY-MM-DD format

Spacing rules:
- "every day" / "daily" → 1
- "every other day" / "alternate days" / default → 2
- "3 times a week" → 2
- "twice a week" → 3
- "weekly" / "once a week" → 7
- If not mentioned → 2`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  let instruction: string;
  let programmeNames: { id: string; name: string }[];

  try {
    const body = await req.json();
    instruction = body.instruction ?? "";
    programmeNames = body.programmeNames ?? [];
    if (!instruction.trim()) throw new Error();
  } catch {
    return NextResponse.json({ error: "instruction required" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const userMessage = `Today's date: ${today}

Available programmes:
${programmeNames.map((p) => `- id: "${p.id}", name: "${p.name}"`).join("\n")}

Instruction: "${instruction}"`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      system: SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }

  const data = await res.json();
  const raw = data?.content?.[0]?.text ?? "{}";

  let parsed: {
    programmeId?: string;
    programmeName?: string;
    startDate?: string;
    spacingDays?: number;
    confidence?: number;
    message?: string;
  };

  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return NextResponse.json({ error: "Could not parse AI response" }, { status: 500 });
  }

  return NextResponse.json({
    programmeId: parsed.programmeId ?? null,
    programmeName: parsed.programmeName ?? "",
    startDate: parsed.startDate ?? today,
    spacingDays: parsed.spacingDays ?? 2,
    confidence: parsed.confidence ?? 0,
    message: parsed.message ?? "",
  });
}
