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

  // Two separate queries rather than an embedded `sessions!inner(date)`
  // join — that pattern has previously caused silent failures here
  // (see detectPBAsync's docstring in app/api/athlete-link/log/route.ts
  // for the same lesson learned the hard way).
  const { data: athleteSessions, error: sessErr } = await supabase
    .from("sessions")
    .select("id, date")
    .eq("athlete_id", athlete.id)
    .order("date", { ascending: false })
    .limit(500);
  if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 });

  const sessionDateById = new Map((athleteSessions ?? []).map((s) => [s.id, s.date]));
  const sessionIds = [...sessionDateById.keys()];

  const { data: exercises, error } = sessionIds.length
    ? await supabase
        .from("session_exercises")
        .select("session_id, log")
        .in("session_id", sessionIds)
        .ilike("name", exerciseName)
    : { data: [], error: null };

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
  const history = (exercises ?? [])
    .map((e: any) => {
      const date = sessionDateById.get(e.session_id);
      const doneSets = (e.log ?? []).filter((s: any) => s.done);
      const bestSet = doneSets.reduce((best: any, s: any) => {
        const w = parseFloat(s.weight) || 0;
        return w > (parseFloat(best?.weight) || 0) ? s : best;
      }, doneSets[0] ?? null);
      return { date, bestSet, allSets: e.log ?? [] };
    })
    .filter((h: any) => h.date && h.bestSet)
    .sort((a: any, b: any) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 20);

  return NextResponse.json({ history, pb: pbRow ?? null });
}
