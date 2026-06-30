import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

const SYSTEM = `You are a strength and conditioning coaching assistant. Write a concise, professional session summary for a coach.

Rules:
- 2-4 short paragraphs, plain text only, no markdown, no bullets, no long dashes
- Cover both total training load (volume) AND strength progression separately
- Give credit for increased weight even when total volume dropped - moving heavier is progress
- Flag exercises where the athlete moved heavier than before, even if they did fewer reps or sets
- Flag exercises where both weight AND volume dropped - these are the real regressions to note
- End with one specific actionable note for next session
- Tone: direct coaching note, not a school report`;

function parseWeight(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseReps(s: string): number {
  if (!s) return 0;
  const match = s.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function buildExerciseContext(ex: any, previousBest: number | null): string {
  const log: Array<{ weight: string; reps: string; done: boolean }> = ex.log ?? [];
  const completedSets = log.filter((s) => s.done);
  const prescribedReps = parseReps(ex.reps ?? ex.time ?? "");
  const prescribedLoad = parseWeight(ex.target_load ?? "");

  const lines: string[] = [];
  lines.push(`${ex.name}: ${completedSets.length}/${log.length} sets`);

  const setDetails: string[] = [];
  let actualVolume = 0;
  let maxWeightThisSession = 0;
  let hasVolumeData = false;

  for (const set of completedSets) {
    const w = parseWeight(set.weight);
    const r = parseReps(set.reps) || prescribedReps;
    const isAmrap = (ex.reps ?? "").toUpperCase() === "AMRAP";
    // For AMRAP: only count volume if athlete logged actual reps
    const repsForVolume = isAmrap ? parseReps(set.reps) : r;
    if (w > 0) {
      if (w > maxWeightThisSession) maxWeightThisSession = w;
      if (repsForVolume > 0) {
        actualVolume += w * repsForVolume;
        hasVolumeData = true;
        setDetails.push(isAmrap ? `${w}kg x ${repsForVolume} (AMRAP)` : `${w}kg x ${repsForVolume}`);
      } else if (isAmrap) {
        setDetails.push(`${w}kg x AMRAP (reps not logged)`);
      } else {
        setDetails.push(`${w}kg`);
      }
    }
  }

  if (setDetails.length > 0) lines.push(`  Sets: ${setDetails.join(" | ")}`);

  if (hasVolumeData) {
    lines.push(`  Total volume: ${actualVolume.toFixed(0)}kg`);
    if (ex.sets > 0 && prescribedReps > 0 && prescribedLoad > 0) {
      const prescribed = ex.sets * prescribedReps * prescribedLoad;
      const pct = Math.round((actualVolume / prescribed) * 100);
      lines.push(`  vs prescribed: ${prescribed.toFixed(0)}kg (${pct}%)`);
    }
  }

  // Strength progression vs previous session
  if (maxWeightThisSession > 0 && previousBest !== null) {
    if (maxWeightThisSession > previousBest) {
      lines.push(`  STRENGTH PROGRESS: ${previousBest}kg -> ${maxWeightThisSession}kg (+${(maxWeightThisSession - previousBest).toFixed(1)}kg heavier than last time)`);
    } else if (maxWeightThisSession === previousBest) {
      lines.push(`  Weight held at ${maxWeightThisSession}kg (same as previous best)`);
    } else {
      lines.push(`  Weight: ${maxWeightThisSession}kg (previous best was ${previousBest}kg)`);
    }
  } else if (maxWeightThisSession > 0) {
    lines.push(`  Max weight: ${maxWeightThisSession}kg (no previous data to compare)`);
  }

  if (ex.progress) lines.push(`  Progress flag: ${ex.progress}`);
  if (ex.session_notes) lines.push(`  Athlete note: "${ex.session_notes}"`);

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

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
    .select("*, session_exercises(*), athletes(id, name)")
    .eq("id", sessionId)
    .single();

  if (error || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const athlete = Array.isArray(session.athletes) ? session.athletes[0] : session.athletes;
  const exercises = (session.session_exercises ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order);

  // For each exercise, find the previous best weight from other sessions
  const previousBests: Record<string, number | null> = {};
  if (athlete?.id) {
    for (const ex of exercises) {
      const { data: prevData } = await supabase
        .from("session_exercises")
        .select("log, sessions!inner(date, athlete_id)")
        .ilike("name", ex.name)
        .eq("sessions.athlete_id", athlete.id)
        .neq("session_id", sessionId)
        .order("date", { ascending: false, foreignTable: "sessions" })
        .limit(10);

      let bestPrev = 0;
      for (const prev of prevData ?? []) {
        const log: any[] = prev.log ?? [];
        for (const set of log) {
          if (!set.done) continue;
          const w = parseFloat(set.weight);
          if (!isNaN(w) && w > bestPrev) bestPrev = w;
        }
      }
      previousBests[ex.id] = bestPrev > 0 ? bestPrev : null;
    }
  }

  const exerciseContext = exercises
    .map((ex: any) => buildExerciseContext(ex, previousBests[ex.id] ?? null))
    .join("\n\n");

  const prompt = `Write a session summary for ${athlete?.name ?? "the athlete"}.
Session: ${session.name} (${session.date})
Type: ${session.type}

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
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) return NextResponse.json({ error: "AI request failed" }, { status: 500 });

  const data = await res.json();
  const report = data?.content?.[0]?.text ?? "";
  return NextResponse.json({ report });
}
