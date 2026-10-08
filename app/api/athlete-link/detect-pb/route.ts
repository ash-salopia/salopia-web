import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { detectPB } from "@/lib/pb-detect";
import type { SetLog } from "@/types";

// Called from the coach session page after logging sets — detects PBs
// the same way the athlete-link/log route does for the athlete app
// (both call the shared detectPB in lib/pb-detect.ts).
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
    .select("id, organisation_id, pb_enabled")
    .eq("id", athleteId)
    .eq("organisation_id", coach.organisation_id)
    .maybeSingle();
  if (!athlete) return NextResponse.json({ error: "Athlete not found in your organisation" }, { status: 404 });

  // 0073 — PB tracking off (org setting or this athlete's override)
  // skips detection entirely, mirroring the athlete-app log route.
  const { data: org } = await supabase.from("organisations").select("settings").eq("id", coach.organisation_id).single();
  const pbEnabled = (org?.settings as any)?.pb_enabled !== false && (athlete as any).pb_enabled !== false;
  if (!pbEnabled) return NextResponse.json({ ok: true, skipped: true });

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
    const pbs = await detectPB(athleteId, exerciseId, sessionId, log);
    return NextResponse.json({ ok: true, pbs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "PB detection failed" }, { status: 500 });
  }
}
