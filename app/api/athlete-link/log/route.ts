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
  weightKg: number;
  reps: number | null;
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
async function detectPB(athleteId: string, exerciseId: string, sessionId: string, log: SetLog[]): Promise<DetectedPB | null> {
  try {
    let maxWeight = 0;
    let repsAtMax: number | null = null;
    for (const set of log) {
      if (!set.done) continue;
      const w = parseFloat(String(set.weight));
      if (!isNaN(w) && w > 0 && w > maxWeight) { maxWeight = w; repsAtMax = parseInt(String(set.reps)) || null; }
    }

    const supabase = createServiceRoleClient();

    // Get exercise name and session date via separate queries (avoids join ambiguity)
    const { data: exData, error: exErr } = await supabase
      .from("session_exercises")
      .select("name, session_id")
      .eq("id", exerciseId)
      .maybeSingle();
    if (exErr || !exData?.name) { console.error("[detectPB] exercise lookup failed", exErr); return null; }

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
      .order("weight_kg", { ascending: false })
      .limit(1);
    const sessionPb = sessionPbRows?.[0] ?? null;

    // The bar this session's best set must clear — every OTHER
    // session's best for this exercise, excluding this session's own
    // (possibly stale) row so it doesn't block itself from updating.
    let bestOtherQuery = supabase
      .from("personal_bests")
      .select("weight_kg")
      .eq("athlete_id", athleteId)
      .ilike("exercise_name", exData.name)
      .order("weight_kg", { ascending: false })
      .limit(1);
    if (sessionPb) bestOtherQuery = bestOtherQuery.neq("id", sessionPb.id);
    const { data: bestOther } = await bestOtherQuery.maybeSingle();
    const threshold = bestOther?.weight_kg ?? 0;

    if (maxWeight <= 0 || maxWeight <= threshold) {
      // Not a PB (or nothing logged as done) — remove any PB this
      // session previously produced, since it's been corrected away.
      if (sessionPb) {
        const { error: delErr } = await supabase.from("personal_bests").delete().eq("id", sessionPb.id);
        if (delErr) console.error("[detectPB] stale PB delete failed", delErr);
      }
      return null;
    }

    if (sessionPb) {
      const { error: updateErr } = await supabase
        .from("personal_bests")
        .update({ weight_kg: maxWeight, reps: repsAtMax, date: sessionDate })
        .eq("id", sessionPb.id);
      if (updateErr) { console.error("[detectPB] update failed", updateErr); return null; }
    } else {
      const { error: insertErr } = await supabase.from("personal_bests").insert({
        athlete_id: athleteId,
        exercise_name: exData.name,
        weight_kg: maxWeight,
        reps: repsAtMax,
        date: sessionDate,
        session_id: sessionId,
      });
      if (insertErr) { console.error("[detectPB] insert failed", insertErr); return null; }
    }

    return { exerciseName: exData.name, weightKg: maxWeight, reps: repsAtMax };
  } catch (e) {
    console.error("[detectPB] unexpected error", e);
    return null;
  }
}
