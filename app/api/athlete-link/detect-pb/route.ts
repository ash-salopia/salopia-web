import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceRoleClient } from "@/lib/supabase-service";
import type { SetLog } from "@/types";

// Called from the coach session page after logging sets — detects PBs
// the same way the athlete-link/log route does for the athlete app.
//
// SECURITY NOTE: this route is nested under /api/athlete-link/ but is
// coach-only — it's called from an authenticated coach page, not the
// athlete app. Because the whole /api/athlete-link/ prefix bypasses the
// middleware's login check (so token-based athlete requests can reach
// their own routes), this route MUST do its own auth check rather than
// relying on middleware. Previously it did neither, which meant anyone
// who found this URL could POST arbitrary IDs and write a fake PB into
// any athlete's data with no authentication at all.
export async function POST(request: NextRequest) {
  // 1. Require a real coach session
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { athleteId?: string; exerciseId?: string; sessionId?: string; log?: SetLog[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const { athleteId, exerciseId, sessionId, log } = body;
  if (!athleteId || !exerciseId || !sessionId || !Array.isArray(log)) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // 2. Verify the coach's organisation actually owns this athlete
  const { data: coach } = await supabase.from("coaches").select("organisation_id").eq("id", user.id).single();
  if (!coach) return NextResponse.json({ error: "Not a coach" }, { status: 403 });

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, organisation_id")
    .eq("id", athleteId)
    .eq("organisation_id", coach.organisation_id)
    .maybeSingle();
  if (!athlete) return NextResponse.json({ error: "Athlete not found in your organisation" }, { status: 404 });

  // 3. Verify the exercise/session actually belong to this athlete —
  //    stops a coach's own compromised session from writing a PB
  //    against a different athlete's record.
  const service = createServiceRoleClient();
  const { data: exRow } = await service
    .from("session_exercises")
    .select("id, session_id, sessions!inner(athlete_id)")
    .eq("id", exerciseId)
    .eq("session_id", sessionId)
    .maybeSingle();
  const exAthleteId = Array.isArray((exRow as any)?.sessions)
    ? (exRow as any).sessions[0]?.athlete_id
    : (exRow as any)?.sessions?.athlete_id;
  if (!exRow || exAthleteId !== athleteId) {
    return NextResponse.json({ error: "Exercise does not belong to this athlete/session" }, { status: 403 });
  }

  try {
    await detectPB(athleteId, exerciseId, sessionId, log);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "PB detection failed" }, { status: 500 });
  }
}

// Mirrors detectPB in app/api/athlete-link/log/route.ts exactly — see
// that file's docstring for the full reasoning (session-scoped
// reconciliation, the three PB shapes driven by the explicit
// is_bodyweight flag, and the atomic upsert on the 0039 unique
// constraint). Keep both in sync if either changes.
async function detectPB(athleteId: string, exerciseId: string, sessionId: string, log: SetLog[]) {
  const supabase = createServiceRoleClient();

  const { data: exData, error: exErr } = await supabase
    .from("session_exercises")
    .select("name, session_id, is_bodyweight, time")
    .eq("id", exerciseId)
    .maybeSingle();
  if (exErr || !exData?.name) { console.error("[detectPB coach] exercise lookup failed", exErr); return; }

  const isBodyweight = !!exData.is_bodyweight;
  const isTimeMode = isBodyweight && !!(exData.time ?? "").trim();

  let maxWeight = 0;
  let repsAtMaxWeight: number | null = null;
  let maxReps = 0;
  let maxTime = 0;
  for (const set of log) {
    if (!set.done) continue;
    if (isBodyweight) {
      if (isTimeMode) {
        const t = parseFloat(String(set.time ?? ""));
        if (!isNaN(t) && t > maxTime) maxTime = t;
      } else {
        const r = parseInt(String(set.reps ?? "")) || 0;
        if (r > maxReps) maxReps = r;
      }
    } else {
      const w = parseFloat(String(set.weight));
      if (!isNaN(w) && w > 0 && w > maxWeight) { maxWeight = w; repsAtMaxWeight = parseInt(String(set.reps)) || null; }
    }
  }

  const candidateValue = isBodyweight ? (isTimeMode ? maxTime : maxReps) : maxWeight;

  const { data: sessData, error: sessErr } = await supabase
    .from("sessions")
    .select("date")
    .eq("id", exData.session_id)
    .maybeSingle();
  if (sessErr || !sessData?.date) { console.error("[detectPB coach] session lookup failed", sessErr); return; }

  const { data: sessionPbRows } = await supabase
    .from("personal_bests")
    .select("id")
    .eq("athlete_id", athleteId)
    .ilike("exercise_name", exData.name)
    .eq("session_id", sessionId)
    .limit(1);
  const sessionPb = sessionPbRows?.[0] ?? null;

  let bestOtherQuery = supabase
    .from("personal_bests")
    .select("weight_kg, reps, time_seconds")
    .eq("athlete_id", athleteId)
    .ilike("exercise_name", exData.name);
  if (isBodyweight) {
    bestOtherQuery = isTimeMode
      ? bestOtherQuery.not("time_seconds", "is", null).order("time_seconds", { ascending: false })
      : bestOtherQuery.is("weight_kg", null).is("time_seconds", null).order("reps", { ascending: false });
  } else {
    bestOtherQuery = bestOtherQuery.not("weight_kg", "is", null).order("weight_kg", { ascending: false });
  }
  if (sessionPb) bestOtherQuery = bestOtherQuery.neq("id", sessionPb.id);
  const { data: bestOther } = await bestOtherQuery.limit(1).maybeSingle();

  const threshold = isBodyweight
    ? (isTimeMode ? (bestOther?.time_seconds ?? 0) : (bestOther?.reps ?? 0))
    : (bestOther?.weight_kg ?? 0);

  if (candidateValue <= 0 || candidateValue <= threshold) {
    if (sessionPb) {
      const { error: delErr } = await supabase.from("personal_bests").delete().eq("id", sessionPb.id);
      if (delErr) console.error("[detectPB coach] stale PB delete failed", delErr);
    }
    return;
  }

  const row = {
    athlete_id: athleteId,
    exercise_name: exData.name,
    date: sessData.date,
    session_id: sessionId,
    weight_kg: isBodyweight ? null : maxWeight,
    reps: isBodyweight ? (isTimeMode ? null : maxReps) : repsAtMaxWeight,
    time_seconds: isBodyweight && isTimeMode ? maxTime : null,
  };

  const { error: upsertErr } = await supabase
    .from("personal_bests")
    .upsert(row, { onConflict: "athlete_id,exercise_name,session_id" });
  if (upsertErr) console.error("[detectPB coach] upsert failed", upsertErr);
}
