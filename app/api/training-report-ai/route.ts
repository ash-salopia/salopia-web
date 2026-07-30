import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { computeReport } from "@/lib/report-calc";
import type { Session, SessionExercise } from "@/types";

const SYSTEM = `You are a strength and conditioning coaching assistant. You are given a training load report covering several weeks and the athlete's own notes from that period. Respond in exactly this format, plain text only, no markdown, no bullets, no long dashes:

SUMMARY:
<2-3 sentences on the overall training load trend across the range — standout progress, and anything worth watching. Direct coaching tone, not a school report.>

THEMES:
<1-2 sentences naming any recurring theme(s) across the athlete's own notes below (e.g. a body part mentioned repeatedly, energy, sleep, motivation). If there are fewer than 2 notes, or no clear repeated theme, just say "No recurring themes noted." Do not invent a theme that isn't actually repeated.>`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  let athleteId: string;
  let rangeStart: string | null;
  let rangeEnd: string | null;
  try {
    const body = await req.json();
    athleteId = body.athleteId;
    rangeStart = body.rangeStart ?? null;
    rangeEnd = body.rangeEnd ?? null;
    if (!athleteId) throw new Error();
  } catch {
    return NextResponse.json({ error: "athleteId required" }, { status: 400 });
  }

  const supabase = await createClient();
  // Re-fetches and re-computes rather than trusting client-supplied
  // numbers — same pattern as /api/session-report, and it means RLS
  // (via this cookie-authenticated client) is what actually gates
  // access to this athlete's data, not anything passed in the body.
  let query = supabase
    .from("sessions")
    .select("*, session_exercises(*), athletes(name)")
    .eq("athlete_id", athleteId)
    .eq("session_source", "programme");
  if (rangeStart && rangeEnd) query = query.gte("date", rangeStart).lte("date", rangeEnd);
  const { data, error } = await query.order("date", { ascending: true });
  if (error) return NextResponse.json({ error: "Could not load sessions" }, { status: 500 });

  const allSessions: Session[] = (data ?? []).map((s: any) => ({
    ...s,
    exercises: (s.session_exercises ?? []) as SessionExercise[],
  }));
  const athleteName = (data?.[0] as any)?.athletes?.name ?? "the athlete";

  const report = computeReport(allSessions);

  if (!report.exerciseSummaries.length && !report.notes.length) {
    return NextResponse.json({
      summary: "No logged training data in this range yet.",
      themes: "No recurring themes noted.",
    });
  }

  const exerciseLines = report.exerciseSummaries.map((e) => {
    const first = e.entries[0];
    const last = e.entries[e.entries.length - 1];
    const pct = e.overallPct != null ? `${e.overallPct >= 0 ? "+" : ""}${e.overallPct.toFixed(1)}%` : "n/a (single session)";
    return `${e.name}: ${e.entries.length} sessions, TTL ${first.ttl.toFixed(0)}kg -> ${last.ttl.toFixed(0)}kg (${pct}), max weight ${first.maxWeight}kg -> ${last.maxWeight}kg`;
  }).join("\n");

  const notesLines = report.notes.slice(0, 25).map((n) => `${n.date} (${n.label}): "${n.note}"`).join("\n");

  const prompt = `Training load report for ${athleteName}, ${rangeStart && rangeEnd ? `${rangeStart} to ${rangeEnd}` : "all time"}.

EXERCISES:
${exerciseLines || "No weighted strength data logged in this range."}

ATHLETE NOTES:
${notesLines || "No notes logged in this range."}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) return NextResponse.json({ error: "AI request failed" }, { status: 500 });

  const aiData = await res.json();
  const text: string = aiData?.content?.[0]?.text ?? "";
  const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*?)(?:\n\s*THEMES:|$)/i);
  const themesMatch = text.match(/THEMES:\s*([\s\S]*)$/i);

  return NextResponse.json({
    summary: summaryMatch?.[1]?.trim() || text.trim() || "Summary unavailable.",
    themes: themesMatch?.[1]?.trim() || "No recurring themes noted.",
  });
}
