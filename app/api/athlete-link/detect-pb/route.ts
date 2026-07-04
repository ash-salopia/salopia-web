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

async function detectPB(athleteId: string, exerciseId: string, sessionId: string, log: SetLog[]) {
  let maxWeight = 0;
  let repsAtMax: number | null = null;
  let hasBodyweight = false;
  for (const set of log) {
    if (!set.done) continue;
    const w = parseFloat(String(set.weight));
    if (!isNaN(w) && w > 0 && w > maxWeight) { maxWeight = w; repsAtMax = parseInt(String(set.reps)) || null; }
    if (set.done && (!set.weight || set.weight === "" || w === 0)) {
      hasBodyweight = true;
      repsAtMax = parseInt(String(set.reps)) || null;
    }
  }
  if (maxWeight <= 0 && !hasBodyweight) return;

  const supabase = createServiceRoleClient();

  const { data: exData, error: exErr } = await supabase
    .from("session_exercises")
    .select("name, session_id")
    .eq("id", exerciseId)
    .maybeSingle();
  if (exErr || !exData?.name) { console.error("[detectPB coach] exercise lookup failed", exErr); return; }

  const { data: sessData, error: sessErr } = await supabase
    .from("sessions")
    .select("date")
    .eq("id", exData.session_id)
    .maybeSingle();
  if (sessErr || !sessData?.date) { console.error("[detectPB coach] session lookup failed", sessErr); return; }

  const { data: existing } = await supabase
    .from("personal_bests")
    .select("weight_kg")
    .eq("athlete_id", athleteId)
    .ilike("exercise_name", exData.name)
    .order("weight_kg", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxWeight <= (existing?.weight_kg ?? 0)) return;

  const { error: insertErr } = await supabase.from("personal_bests").insert({
    athlete_id: athleteId,
    exercise_name: exData.name,
    weight_kg: maxWeight,
    reps: repsAtMax,
    date: sessData.date,
    session_id: sessionId,
  });
  if (insertErr) console.error("[detectPB coach] insert failed", insertErr);
}
