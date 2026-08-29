import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { computeReport } from "@/lib/report-calc";
import { computeStrengthReport } from "@/lib/strength-report-calc";
import { DEFAULT_SETTINGS } from "@/lib/data/settings";
import { METRIC_META, METRIC_ORDER, type MetricKey } from "@/lib/cardio-metrics";
import { AI_MODEL, callClaude } from "@/lib/ai/claude";
import { fingerprintReportInput, getCachedReport, putCachedReport } from "@/lib/ai/report-cache";
import type { Session, SessionExercise } from "@/types";

const SYSTEM = `You are a strength and conditioning coaching assistant. You are given a training load report covering several weeks - only the data sections the coach actually selected for this report, plus optionally the coach's own context for this report. Only discuss what's actually present in the sections below; never reference a metric or session type that isn't included, even if you'd normally expect it. Respond in exactly this format, plain text only, no markdown, no bullets, no long dashes:

SUMMARY:
<2-3 sentences on the overall training trend across the range, covering only the sections provided below - standout progress, and anything worth watching. Direct coaching tone, not a school report. If e1RM (estimated 1-rep-max) data is included: when the 1RM mode is Rolling, read week-to-week e1RM movement as genuine strength trend. When the mode is Fixed, e1RM values are distance from a fixed reference max the coach set manually — describe movement as "how close to their reference max", never as week-to-week strength change, since a session's e1RM naturally varies below a fixed target without that being a real strength change. Never misattribute one mode's meaning to the other. If the coach has given context for this report (e.g. returning from injury, a taper, illness), use it to correctly interpret the numbers — a jump in an exercise's load is "recovery" or "return to baseline" rather than plain "progress" if the context says the athlete was coming back from a layoff affecting that area, and a plateau or dip reads differently during a deliberate taper than it would otherwise. Weave this in naturally where it actually changes the interpretation of a metric — don't just restate the coach's note back verbatim, and don't force it in if none of the numbers are actually related to it. If session RPE and/or training load (sRPE) data is included, read it alongside whatever load/metric trend is also included rather than in isolation: rising load with stable or falling RPE reads as adapting well; rising RPE alongside flat or falling load is worth flagging as possible fatigue or overreaching; RPE isn't logged for recovery sessions and shouldn't be discussed as if it should be. If cardio and/or hybrid metric trends are included, comment on the genuinely notable movement (e.g. pace improving, distance climbing, HR drifting for the same effort) rather than restating every number. If only one section is included, write the summary about that section alone — don't apologise for or mention the absence of sections that weren't selected.>

THEMES:
<1-2 sentences naming any recurring theme(s) across the athlete's own notes below (e.g. a body part mentioned repeatedly, energy, sleep, motivation). If athlete notes were not included below, or there are fewer than 2 notes, or no clear repeated theme, just say "No recurring themes noted." Do not invent a theme that isn't actually repeated.>`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  let athleteId: string;
  let rangeStart: string | null;
  let rangeEnd: string | null;
  let includeTtl: boolean;
  let includeE1rm: boolean;
  let includeNotes: boolean;
  let includeRpe: boolean;
  let includeTrainingLoad: boolean;
  let includeCardio: boolean;
  let includeHyrox: boolean;
  let includePowerSpeed: boolean;
  let includeBarSpeed: boolean;
  let cardioMetricKeys: MetricKey[];
  let hyroxMetricKeys: MetricKey[];
  let coachContext: string;
  try {
    const body = await req.json();
    athleteId = body.athleteId;
    rangeStart = body.rangeStart ?? null;
    rangeEnd = body.rangeEnd ?? null;
    // Every block below is opt-in and mirrors the exact report option the
    // coach ticked - the AI summary must never discuss data the coach
    // didn't select for this report, even if it exists in range.
    includeTtl = !!body.includeTtl;
    includeE1rm = !!body.includeE1rm;
    includeNotes = !!body.includeNotes;
    includeRpe = !!body.includeRpe;
    includeTrainingLoad = !!body.includeTrainingLoad;
    includeCardio = !!body.includeCardio;
    includeHyrox = !!body.includeHyrox;
    includePowerSpeed = !!body.includePowerSpeed;
    includeBarSpeed = !!body.includeBarSpeed;
    cardioMetricKeys = Array.isArray(body.cardioMetricKeys) ? body.cardioMetricKeys.filter((k: unknown) => METRIC_ORDER.includes(k as MetricKey)) : [...METRIC_ORDER];
    hyroxMetricKeys = Array.isArray(body.hyroxMetricKeys) ? body.hyroxMetricKeys.filter((k: unknown) => METRIC_ORDER.includes(k as MetricKey)) : [...METRIC_ORDER];
    coachContext = typeof body.coachContext === "string" ? body.coachContext.trim().slice(0, 500) : "";
    if (!athleteId) throw new Error();
  } catch {
    return NextResponse.json({ error: "athleteId required" }, { status: 400 });
  }

  const supabase = await createClient();
  // Re-fetches and re-computes rather than trusting client-supplied
  // numbers - re-fetches and re-computes rather than trusting the client,
  // and it means RLS
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

  const exerciseLines = includeTtl && report.exerciseSummaries.length
    ? report.exerciseSummaries.map((e) => {
        const first = e.entries[0];
        const last = e.entries[e.entries.length - 1];
        const pct = e.overallPct != null ? `${e.overallPct >= 0 ? "+" : ""}${e.overallPct.toFixed(1)}%` : "n/a (single session)";
        return `${e.name}: ${e.entries.length} sessions, TTL ${first.ttl.toFixed(0)}kg -> ${last.ttl.toFixed(0)}kg (${pct}), max weight ${first.maxWeight}kg -> ${last.maxWeight}kg`;
      }).join("\n")
    : "";
  const ttlBlock = includeTtl ? `

TOTAL TRAINING LOAD (TTL) BY EXERCISE:
${exerciseLines || "No weighted strength data logged in this range."}` : "";

  const notesLines = includeNotes && report.notes.length ? report.notes.slice(0, 25).map((n) => `${n.date} (${n.label}): "${n.note}"`).join("\n") : "";
  const notesBlock = includeNotes ? `

ATHLETE NOTES:
${notesLines || "No notes logged in this range."}` : "";

  let rpeBlock = "";
  if (includeRpe && report.rpeEntries.length) {
    const avgRpe = Math.round((report.rpeEntries.reduce((s, e) => s + e.rpe, 0) / report.rpeEntries.length) * 10) / 10;
    const rpeLines = report.rpeEntries.map((e) => `${e.date} (${e.sessName}, ${e.type}): RPE ${e.rpe}/10`).join("\n");
    rpeBlock = `

SESSION RPE (athlete-rated perceived exertion for the whole session, 1-10, logged after strength/hybrid/cardio/power-speed sessions — not recovery). Average across this range: ${avgRpe}/10.
${rpeLines}`;
  }

  let trainingLoadBlock = "";
  if (includeTrainingLoad && report.trainingLoadEntries.length) {
    const lines = report.trainingLoadEntries.map((e) => `${e.date} (${e.sessName}): ${e.value}`).join("\n");
    trainingLoadBlock = `

TRAINING LOAD (sRPE — session RPE × estimated session length in minutes, hybrid/cardio only):
${lines}`;
  }

  let cardioBlock = "";
  if (includeCardio) {
    const summaries = report.cardioMetricSummaries.filter((m) => m.sessionType === "cardio" && cardioMetricKeys.includes(m.key));
    if (summaries.length) {
      const lines = summaries.map((m) => {
        const meta = METRIC_META[m.key];
        const first = m.entries[0];
        const last = m.entries[m.entries.length - 1];
        const pct = m.overallPct != null ? `${m.overallPct >= 0 ? "+" : ""}${m.overallPct.toFixed(1)}%` : "n/a (single session)";
        return `${meta.label} — ${m.group}: ${m.entries.length} sessions, ${first.value}${meta.unit} -> ${last.value}${meta.unit} (${pct})`;
      }).join("\n");
      cardioBlock = `

CARDIO METRIC TRENDS:
${lines}`;
    }
  }

  let hyroxBlock = "";
  if (includeHyrox) {
    const summaries = report.cardioMetricSummaries.filter((m) => m.sessionType === "hyrox" && hyroxMetricKeys.includes(m.key));
    if (summaries.length) {
      const lines = summaries.map((m) => {
        const meta = METRIC_META[m.key];
        const first = m.entries[0];
        const last = m.entries[m.entries.length - 1];
        const pct = m.overallPct != null ? `${m.overallPct >= 0 ? "+" : ""}${m.overallPct.toFixed(1)}%` : "n/a (single session)";
        return `${meta.label} — ${m.group}: ${m.entries.length} sessions, ${first.value}${meta.unit} -> ${last.value}${meta.unit} (${pct})`;
      }).join("\n");
      hyroxBlock = `

HYBRID METRIC TRENDS:
${lines}`;
    }
  }

  let powerSpeedBlock = "";
  if (includePowerSpeed && report.powerSpeedSummaries.length) {
    const lines = report.powerSpeedSummaries.map((p) => {
      const first = p.entries[0];
      const last = p.entries[p.entries.length - 1];
      const pct = p.overallPct != null ? `${p.overallPct >= 0 ? "+" : ""}${p.overallPct.toFixed(1)}%` : "n/a (single session)";
      return `${p.name}: ${p.entries.length} sessions, ${first.value}${p.unit} -> ${last.value}${p.unit} (${pct})`;
    }).join("\n");
    powerSpeedBlock = `

POWER/SPEED TRENDS:
${lines}`;
  }

  let barSpeedBlock = "";
  if (includeBarSpeed && report.velocitySummaries.length) {
    const lines = report.velocitySummaries.map((v) => {
      const first = v.entries[0];
      const last = v.entries[v.entries.length - 1];
      const pct = v.overallPct != null ? `${v.overallPct >= 0 ? "+" : ""}${v.overallPct.toFixed(1)}%` : "n/a (single session)";
      return `${v.name}: ${v.entries.length} sessions, avg ${first.avgVelocity.toFixed(2)}m/s -> ${last.avgVelocity.toFixed(2)}m/s (${pct})`;
    }).join("\n");
    barSpeedBlock = `

BAR SPEED TRENDS (m/s):
${lines}`;
  }

  let e1rmBlock = "";
  if (includeE1rm) {
    // Re-derives org settings server-side rather than trusting a
    // client-supplied formula/mode - same RLS-gated trust boundary as
    // the rest of this route. Mirrors getOrgSettings() (lib/data/settings.ts),
    // which is browser-client-only and can't be called from here.
    let oneRmFormula = DEFAULT_SETTINGS.one_rm_formula;
    let oneRmSource = DEFAULT_SETTINGS.one_rm_source;
    // Coaches RLS returns every colleague in the org, not just this
    // one - .single() with no filter silently breaks for any org with
    // more than one coach, so this has to resolve auth.uid() first.
    const { data: { user } } = await supabase.auth.getUser();
    const { data: coach } = user
      ? await supabase.from("coaches").select("organisation_id").eq("id", user.id).single()
      : { data: null };
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

  // Nothing to summarise if every selected section came back empty -
  // don't burn an AI call (or risk it inventing content) for a report
  // with a ticked option but zero logged data behind it.
  if (!exerciseLines && !e1rmBlock && !notesLines && !rpeBlock && !trainingLoadBlock && !cardioBlock && !hyroxBlock && !powerSpeedBlock && !barSpeedBlock) {
    return NextResponse.json({
      summary: "No logged training data in this range yet.",
      themes: "No recurring themes noted.",
    });
  }

  const coachContextBlock = coachContext ? `

COACH CONTEXT FOR THIS REPORT:
${coachContext}` : "";

  const prompt = `Training load report for ${athleteName}, ${rangeStart && rangeEnd ? `${rangeStart} to ${rangeEnd}` : "all time"}.${coachContextBlock}${ttlBlock}${e1rmBlock}${rpeBlock}${trainingLoadBlock}${cardioBlock}${hyroxBlock}${powerSpeedBlock}${barSpeedBlock}${notesBlock}`;

  // The prompt string IS the full report data (computeReport-derived
  // lines for every selected section). Any change to a logged set, note,
  // RPE, or the selected options changes the prompt → busts the cache.
  const hash = fingerprintReportInput({ v: 2, model: AI_MODEL.report, prompt });
  const cached = await getCachedReport(supabase, { athleteId, reportType: "training_load", hash });
  if (cached && typeof (cached as any).summary === "string") {
    return NextResponse.json(cached, { headers: { "x-cache": "hit" } });
  }

  const r = await callClaude({ model: AI_MODEL.report, system: SYSTEM, maxTokens: 400, prompt });
  if (!r.ok) return NextResponse.json({ error: "AI request failed" }, { status: 500 });

  const summaryMatch = r.text.match(/SUMMARY:\s*([\s\S]*?)(?:\n\s*THEMES:|$)/i);
  const themesMatch = r.text.match(/THEMES:\s*([\s\S]*)$/i);
  const out = {
    summary: summaryMatch?.[1]?.trim() || r.text.trim() || "Summary unavailable.",
    themes: themesMatch?.[1]?.trim() || "No recurring themes noted.",
  };

  if (r.text.trim()) {
    await putCachedReport(supabase, {
      athleteId, reportType: "training_load", hash, model: AI_MODEL.report,
      content: out, rangeStart, rangeEnd,
    }).catch(() => {});
  }
  return NextResponse.json(out);
}
