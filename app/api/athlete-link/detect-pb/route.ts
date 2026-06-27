import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-service";
import type { SetLog } from "@/types";

// Called from coach side after logging sets — detects PBs the same
// way the athlete-link/log route does.

export async function POST(request: NextRequest) {
  let body: { athleteId?: string; exerciseId?: string; sessionId?: string; log?: SetLog[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const { athleteId, exerciseId, sessionId, log } = body;
  if (!athleteId || !exerciseId || !sessionId || !Array.isArray(log)) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  try {
    await detectPB(athleteId, exerciseId, sessionId, log);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "PB detection failed" }, { status: 500 });
  }
}

async function detectPB(athleteId: string, exerciseId: string, sessionId: string, log: SetLog[]) {
  let maxWeight = 0;
  let repsAtMax: number | null = null;
  let isBodyweight = false;

  for (const set of log) {
    if (!set.done) continue;
    const w = parseFloat(String(set.weight));
    if (!isNaN(w) && w > 0 && w > maxWeight) {
      maxWeight = w;
      repsAtMax = parseInt(String(set.reps)) || null;
    }
    if (set.done && (!set.weight || set.weight === "" || w === 0)) {
      isBodyweight = true;
      const r = parseInt(String(set.reps)) || null;
      if (r && (!repsAtMax || r > repsAtMax)) repsAtMax = r;
    }
  }

  // For bodyweight, track by reps rather than weight
  const effectiveWeight = isBodyweight && maxWeight === 0 ? 0 : maxWeight;
  if (effectiveWeight <= 0 && !isBodyweight) return;

  const supabase = createServiceRoleClient();

  // Get exercise name and session date
  const { data: exData } = await supabase
    .from("session_exercises")
    .select("name, sessions!inner(date)")
    .eq("id", exerciseId)
    .maybeSingle();

  if (!exData?.name) return;
  const sessions = exData.sessions as any;
  const sessionDate: string = Array.isArray(sessions) ? sessions[0]?.date : sessions?.date;
  if (!sessionDate) return;

  if (isBodyweight && maxWeight === 0) {
    // For bodyweight: check if reps is a new PB
    const { data: existing } = await supabase
      .from("personal_bests")
      .select("reps")
      .eq("athlete_id", athleteId)
      .ilike("exercise_name", exData.name)
      .eq("weight_kg", 0)
      .order("reps", { ascending: false })
      .limit(1)
      .maybeSingle();

    if ((repsAtMax ?? 0) <= (existing?.reps ?? 0)) return;

    await supabase.from("personal_bests").insert({
      athlete_id: athleteId,
      exercise_name: exData.name,
      weight_kg: 0,
      reps: repsAtMax,
      date: sessionDate,
      session_id: sessionId,
    });
  } else {
    // Weighted: check if weight is a new PB
    const { data: existing } = await supabase
      .from("personal_bests")
      .select("weight_kg")
      .eq("athlete_id", athleteId)
      .ilike("exercise_name", exData.name)
      .order("weight_kg", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxWeight <= (existing?.weight_kg ?? 0)) return;

    // Check we haven't already saved a PB for this exercise in this session
    const { data: sessionPB } = await supabase
      .from("personal_bests")
      .select("id, weight_kg")
      .eq("athlete_id", athleteId)
      .eq("session_id", sessionId)
      .ilike("exercise_name", exData.name)
      .maybeSingle();

    if (sessionPB) {
      // Update existing session PB if new weight is higher
      if (maxWeight > sessionPB.weight_kg) {
        await supabase.from("personal_bests").update({ weight_kg: maxWeight, reps: repsAtMax }).eq("id", sessionPB.id);
      }
      return;
    }

    await supabase.from("personal_bests").insert({
      athlete_id: athleteId,
      exercise_name: exData.name,
      weight_kg: maxWeight,
      reps: repsAtMax,
      date: sessionDate,
      session_id: sessionId,
    });
  }
}
