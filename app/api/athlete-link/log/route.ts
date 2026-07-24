import { NextResponse } from "next/server";
import { getAthleteByShareToken, updateAthleteSetLog } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";
import type { SetLog } from "@/types";

export async function POST(request: Request) {
  let body: { token?: string; sessionId?: string; exerciseId?: string; log?: SetLog[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  const { token, sessionId, exerciseId, log } = body;
  if (!token || !sessionId || !exerciseId || !Array.isArray(log)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    await updateAthleteSetLog(sessionId, athlete.id, exerciseId, log);
    // Awaited (not fire-and-forget) so the athlete app can show a
    // celebration popup off the same response — a couple of extra fast
    // lookups is worth it for the immediate "New PB!" feedback.
    const pb = await detectPB(athlete.id, exerciseId, sessionId, log);
    return NextResponse.json({ ok: true, pb });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save" }, { status: 400 });
  }
}

export interface DetectedPB {
  exerciseName: string;
  weightKg: number | null;
  reps: number | null;
  timeSeconds: number | null;
}

// Reconciles the PB for this athlete+exercise+session against the
// current log every time a set is saved — not just "insert on
// improvement" — so correcting a typo (e.g. 8 reps fixed to 6, or a
// weight typed too high then corrected) after the fact updates or
// removes the PB it produced, rather than leaving a stale row behind
// forever. Any PB previously recorded FROM THIS SESSION for this
// exercise is treated as "ours to keep in sync": updated if this
// session's best set still beats every other session's best, deleted
// if it no longer does.
//
// Three PB "shapes", decided by the exercise's explicit is_bodyweight
// flag (0041) — never inferred from a set's weight happening to be
// blank: weighted (compare by kg), bodyweight+reps (compare by reps),
// bodyweight+time (compare by longest hold). An exercise's shape is
// fixed for the whole session (is_bodyweight + the reps/time
// prescription don't vary set-to-set), so there's no ambiguity about
// which lane a given session's PB row belongs to.
async function detectPB(athleteId: string, exerciseId: string, sessionId: string, log: SetLog[]): Promise<DetectedPB | null> {
  try {
    const supabase = createServiceRoleClient();

    const { data: exData, error: exErr } = await supabase
      .from("session_exercises")
      .select("name, session_id, is_bodyweight, time")
      .eq("id", exerciseId)
      .maybeSingle();
    if (exErr || !exData?.name) { console.error("[detectPB] exercise lookup failed", exErr); return null; }

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
    if (sessErr || !sessData?.date) { console.error("[detectPB] session lookup failed", sessErr); return null; }
    const sessionDate = sessData.date;

    // A PB already recorded from THIS session for this exercise, if any.
    const { data: sessionPbRows } = await supabase
      .from("personal_bests")
      .select("id")
      .eq("athlete_id", athleteId)
      .ilike("exercise_name", exData.name)
      .eq("session_id", sessionId)
      .limit(1);
    const sessionPb = sessionPbRows?.[0] ?? null;

    // The bar this session's best set must clear — every OTHER
    // session's best for this exercise IN THE SAME LANE, excluding
    // this session's own (possibly stale) row so it doesn't block
    // itself from updating.
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
      // Not a PB (or nothing logged as done) — remove any PB this
      // session previously produced, since it's been corrected away.
      if (sessionPb) {
        const { error: delErr } = await supabase.from("personal_bests").delete().eq("id", sessionPb.id);
        if (delErr) console.error("[detectPB] stale PB delete failed", delErr);
      }
      return null;
    }

    const row = {
      athlete_id: athleteId,
      exercise_name: exData.name,
      date: sessionDate,
      session_id: sessionId,
      weight_kg: isBodyweight ? null : maxWeight,
      reps: isBodyweight ? (isTimeMode ? null : maxReps) : repsAtMaxWeight,
      time_seconds: isBodyweight && isTimeMode ? maxTime : null,
    };

    // Atomic upsert on (athlete_id, exercise_name, session_id) — see
    // 0039_personal_bests_session_unique.sql. Two near-simultaneous
    // saves that both reach this point believing no row exists yet
    // (the sessionPb lookup above raced) still can't both insert: the
    // database itself enforces the constraint, so the second write
    // lands as an update instead of a duplicate row.
    const { error: upsertErr } = await supabase
      .from("personal_bests")
      .upsert(row, { onConflict: "athlete_id,exercise_name,session_id" });
    if (upsertErr) { console.error("[detectPB] upsert failed", upsertErr); return null; }

    return { exerciseName: exData.name, weightKg: row.weight_kg, reps: row.reps, timeSeconds: row.time_seconds };
  } catch (e) {
    console.error("[detectPB] unexpected error", e);
    return null;
  }
}
