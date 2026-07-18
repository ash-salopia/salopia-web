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

async function detectPB(athleteId: string, exerciseId: string, sessionId: string, log: SetLog[]): Promise<DetectedPB | null> {
  try {
    let maxWeight = 0;
    let repsAtMax: number | null = null;
    for (const set of log) {
      if (!set.done) continue;
      const w = parseFloat(String(set.weight));
      if (!isNaN(w) && w > 0 && w > maxWeight) { maxWeight = w; repsAtMax = parseInt(String(set.reps)) || null; }
    }
    if (maxWeight <= 0) return null;

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

    // Check current best
    const { data: existing } = await supabase
      .from("personal_bests")
      .select("weight_kg")
      .eq("athlete_id", athleteId)
      .ilike("exercise_name", exData.name)
      .order("weight_kg", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxWeight <= (existing?.weight_kg ?? 0)) return null;

    const { error: insertErr } = await supabase.from("personal_bests").insert({
      athlete_id: athleteId,
      exercise_name: exData.name,
      weight_kg: maxWeight,
      reps: repsAtMax,
      date: sessionDate,
      session_id: sessionId,
    });
    if (insertErr) { console.error("[detectPB] insert failed", insertErr); return null; }

    return { exerciseName: exData.name, weightKg: maxWeight, reps: repsAtMax };
  } catch (e) {
    console.error("[detectPB] unexpected error", e);
    return null;
  }
}
