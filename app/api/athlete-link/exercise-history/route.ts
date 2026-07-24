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

  // Current PB — could be weighted, bodyweight+reps, or bodyweight+time
  // (see detectPB's docstring in log/route.ts for the three shapes).
  // This endpoint only knows the exercise NAME, not whether it's
  // currently flagged bodyweight, so check all three shapes and use
  // whichever one this exercise actually has data in.
  const pbSelect = "weight_kg, reps, time_seconds, date";
  const pbBase = () =>
    supabase.from("personal_bests").select(pbSelect).eq("athlete_id", athlete.id).ilike("exercise_name", exerciseName);
  const [{ data: weightedPb }, { data: repsPb }, { data: timePb }] = await Promise.all([
    pbBase().not("weight_kg", "is", null).order("weight_kg", { ascending: false }).limit(1).maybeSingle(),
    pbBase().is("weight_kg", null).is("time_seconds", null).order("reps", { ascending: false }).limit(1).maybeSingle(),
    pbBase().not("time_seconds", "is", null).order("time_seconds", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const pbRow = weightedPb ?? repsPb ?? timePb ?? null;

  // Build a per-session summary (best set each session). Shape-agnostic
  // heuristic — compare by weight if any set has one, else by time, else
  // by reps — works because a given exercise only ever populates one of
  // these fields consistently (its fixed prescription shape).
  const history = (exercises ?? [])
    .map((e: any) => {
      const date = sessionDateById.get(e.session_id);
      const doneSets = (e.log ?? []).filter((s: any) => s.done);
      const bestSet = doneSets.reduce((best: any, s: any) => {
        const sw = parseFloat(s.weight) || 0;
        const bw = parseFloat(best?.weight) || 0;
        if (sw > 0 || bw > 0) return sw > bw ? s : best;
        const st = parseFloat(s.time) || 0;
        const bt = parseFloat(best?.time) || 0;
        if (st > 0 || bt > 0) return st > bt ? s : best;
        const sr = parseInt(s.reps) || 0;
        const br = parseInt(best?.reps) || 0;
        return sr > br ? s : best;
      }, doneSets[0] ?? null);
      return { date, bestSet, allSets: e.log ?? [] };
    })
    .filter((h: any) => h.date && h.bestSet)
    .sort((a: any, b: any) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 20);

  return NextResponse.json({ history, pb: pbRow ?? null });
}
