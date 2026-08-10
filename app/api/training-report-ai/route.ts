import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { computeReport } from "@/lib/report-calc";
import { computeStrengthReport } from "@/lib/strength-report-calc";
import { DEFAULT_SETTINGS } from "@/lib/data/settings";
import type { Session, SessionExercise } from "@/types";

const SYSTEM = `You are a strength and conditioning coaching assistant. You are given a training load report covering several weeks, the athlete's own notes from that period, and optionally the coach's own context for this report. Respond in exactly this format, plain text only, no markdown, no bullets, no long dashes:

SUMMARY:
<2-3 sentences on the overall training load trend across the range — standout progress, and anything worth watching. Direct coaching tone, not a school report. If e1RM (estimated 1-rep-max) data is included: when the 1RM mode is Rolling, read week-to-week e1RM movement as genuine strength trend. When the mode is Fixed, e1RM values are distance from a fixed reference max the coach set manually — describe movement as "how close to their reference max", never as week-to-week strength change, since a session's e1RM naturally varies below a fixed target without that being a real strength change. Never misattribute one mode's meaning to the other. If the coach has given context for this report (e.g. returning from injury, a taper, illness), use it to correctly interpret the numbers — a jump in an exercise's load is "recovery" or "return to baseline" rather than plain "progress" if the context says the athlete was coming back from a layoff affecting that area, and a plateau or dip reads differently during a deliberate taper than it would otherwise. Weave this in naturally where it actually changes the interpretation of a metric — don't just restate the coach's note back verbatim, and don't force it in if none of the numbers are actually related to it.>

THEMES:
<1-2 sentences naming any recurring theme(s) across the athlete's own notes below (e.g. a body part mentioned repeatedly, energy, sleep, motivation). If there are fewer than 2 notes, or no clear repeated theme, just say "No recurring themes noted." Do not invent a theme that isn't actually repeated.>`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  let athleteId: string;
  let rangeStart: string | null;
  let rangeEnd: string | null;
  let includeE1rm: boolean;
  let coachContext: string;
  try {
    const body = await req.json();
    athleteId = body.athleteId;
    rangeStart = body.rangeStart ?? null;
    rangeEnd = body.rangeEnd ?? null;
    includeE1rm = !!body.includeE1rm;
    coachContext = typeof body.coachContext === "string" ? body.coachContext.trim().slice(0, 500) : "";
    if (!athleteId) throw new Error();
  } catch {
    return NextResponse.json({ error: "athleteId required" }, { status: 400 });
  }

  const supabase = await createClient();
  // Re-fetches and re-computes rather than trusting client-supplied
  // numbers - same pattern as /api/session-report, and it means RLS
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

  let e1rmBlock = "";
  if (includeE1rm) {
    // Re-derives org settings server-side rather than trusting a
    // client-supplied formula/mode - same RLS-gated trust boundary as
    // the rest of this route. Mirrors getOrgSettings() (lib/data/settings.ts),
    // which is browser-client-only and can't be called from here.
    let oneRmFormula = DEFAULT_SETTINGS.one_rm_formula;
    let oneRmSource = DEFAULT_SETTINGS.one_rm_source;
    const { data: coach } = await supabase.from("coaches").select("organisation_id").single();
    if (coach) {
      const { data: org } = await supabase
        .from("organisations")
        .select("settings")
        .eq("id", coach.organisation_id)
        .single();
      oneRmFormula = org?.settings?.one_rm_formula ?? oneRmFormula;
      oneRmSource = org?.settings?.one_rm_source ?? oneRmSource;
    }

    const strength = computeStrengthReport(allSessions, oneRmFormula);
    const e1rmLines = strength.exerciseSummaries.map((e) => {
      const first = e.entries[0];
      const last = e.entries[e.entries.length - 1];
      const pct = e.overallPct != null ? `${e.overallPct >= 0 ? "+" : ""}${e.overallPct.toFixed(1)}%` : "n/a (single session)";
      return `${e.name}: ${e.entries.length} sessions, e1RM ${first.e1rm.toFixed(1)}kg -> ${last.e1rm.toFixed(1)}kg (${pct})`;
    }).join("\n");

    e1rmBlock = `

ESTIMATED 1RM (formula: ${oneRmFormula}, mode: ${oneRmSource === "fixed" ? "Fixed — values are distance from a coach-set reference max, not week-to-week change" : "Rolling — values reflect genuine week-to-week strength trend"}):
${e1rmLines || "No e1RM data available in this range."}`;
  }

  const coachContextBlock = coachContext ? `

COACH CONTEXT FOR THIS REPORT:
${coachContext}` : "";

  const prompt = `Training load report for ${athleteName}, ${rangeStart && rangeEnd ? `${rangeStart} to ${rangeEnd}` : "all time"}.${coachContextBlock}

EXERCISES:
${exerciseLines || "No weighted strength data logged in this range."}${e1rmBlock}

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
