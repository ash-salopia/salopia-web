import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

// GET /api/athlete-link/exercise-history?token=...&exercise_name=...
// Returns this athlete's logged sets for a given exercise across all sessions,
// plus their current PB for it.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const exerciseName = req.nextUrl.searchParams.get("exercise_name");

  if (!token || !exerciseName) {
    return NextResponse.json({ error: "Missing token or exercise_name" }, { status: 400 });
  }

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();

  // Past sets — ilike so casing differences don't break it
  const { data: exercises, error } = await supabase
    .from("session_exercises")
    .select("name, log, sessions!inner(date)")
    .eq("sessions.athlete_id", athlete.id)
    .ilike("name", exerciseName)
    .order("sessions(date)", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Current PB
  const { data: pbRow } = await supabase
    .from("personal_bests")
    .select("weight_kg, reps, date")
    .eq("athlete_id", athlete.id)
    .ilike("exercise_name", exerciseName)
    .order("weight_kg", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Build a per-session summary (best set each session)
  const history = (exercises ?? []).map((e: any) => {
    const sessions = e.sessions;
    const date = Array.isArray(sessions) ? sessions[0]?.date : sessions?.date;
    const doneSets = (e.log ?? []).filter((s: any) => s.done);
    const bestSet = doneSets.reduce((best: any, s: any) => {
      const w = parseFloat(s.weight) || 0;
      return w > (parseFloat(best?.weight) || 0) ? s : best;
    }, doneSets[0] ?? null);
    return { date, bestSet, allSets: e.log ?? [] };
  }).filter((h: any) => h.date && h.bestSet);

  return NextResponse.json({ history, pb: pbRow ?? null });
}
