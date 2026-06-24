import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

const SYSTEM = `You are a strength & conditioning coaching assistant. Write a short, sharp session summary for the coach.

Rules:
- 2-3 sentences maximum, plain text only
- Always reference actual volume numbers when available
- Give credit for load increases even if set completion was below 100%
- Compare actual vs prescribed volume where data exists
- Be specific (numbers, exercises) not vague
- One actionable note for next session`;

function parseWeight(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseReps(s: string): number {
  if (!s) return 0;
  const match = s.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function buildExerciseContext(ex: any): string {
  const log: Array<{ weight: string; reps: string; done: boolean }> = ex.log ?? [];
  const completedSets = log.filter((s) => s.done);
  const prescribedSets: number = ex.sets ?? 0;
  const prescribedReps: number = parseReps(ex.reps ?? "");
  const prescribedLoad: number = parseWeight(ex.target_load ?? "");

  let actualVolume = 0;
  let hasVolume = false;
  const setDetails: string[] = [];

  for (const set of completedSets) {
    const w = parseWeight(set.weight);
    const r = parseReps(set.reps) || prescribedReps;
    if (w > 0 && r > 0) {
      actualVolume += w * r;
      hasVolume = true;
      setDetails.push(`${w}kg×${r}`);
    } else if (w > 0) {
      setDetails.push(`${w}kg`);
    }
  }

  const parts = [`${ex.name}: ${completedSets.length}/${log.length} sets`];
  if (setDetails.length) parts.push(`(${setDetails.join(", ")})`);
  if (hasVolume) {
    parts.push(`actual vol ${actualVolume.toFixed(0)}kg`);
    if (prescribedSets > 0 && prescribedReps > 0 && prescribedLoad > 0) {
      const prescribed = prescribedSets * prescribedReps * prescribedLoad;
      const pct = Math.round((actualVolume / prescribed) * 100);
      parts.push(`vs prescribed ${prescribed.toFixed(0)}kg (${pct}%)`);
    }
  }
  if (ex.progress) parts.push(`[${ex.progress}]`);
  if (ex.session_notes) parts.push(`athlete: "${ex.session_notes}"`);

  return parts.join(" ");
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  let sessionId: string;
  try {
    const body = await req.json();
    sessionId = body.sessionId;
    if (!sessionId) throw new Error();
  } catch {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: session, error } = await supabase
    .from("sessions")
    .select("*, session_exercises(*), athletes(name)")
    .eq("id", sessionId)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const athlete = Array.isArray(session.athletes) ? session.athletes[0] : session.athletes;
  const exercises = (session.session_exercises ?? []).sort(
    (a: any, b: any) => a.sort_order - b.sort_order
  );

  const exerciseContext = exercises.map(buildExerciseContext).join("\n");

  const prompt = `Summarise this session for ${athlete?.name ?? "the athlete"}.
Session: ${session.name} (${session.date})

${exerciseContext}`;

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
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }

  const data = await res.json();
  const summary: string = data?.content?.[0]?.text?.trim() ?? "";

  // Save to session row
  await supabase.from("sessions").update({ coach_summary: summary }).eq("id", sessionId);

  return NextResponse.json({ summary, saved: true });
}
