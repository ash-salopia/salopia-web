import { NextRequest, NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

// Recurring per-exercise setup notes (0125) - the athlete's own
// "seat 4, pin 6" for an exercise, shown every time it appears.
// GET  ?token=xxx                         -> all of this athlete's setups
// POST { token, exerciseName, note }       -> save (empty note deletes)

const keyFor = (name: string) => name.trim().toLowerCase();

export async function GET(req: NextRequest) {
  noStore();
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  const { data, error } = await createServiceRoleClient()
    .from("athlete_exercise_setups")
    .select("exercise_key, exercise_name, note, updated_at")
    .eq("athlete_id", athlete.id);
  if (error) return NextResponse.json({ setups: [] }); // 0125 not run yet
  return NextResponse.json({ setups: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = body?.token;
  const exerciseName = typeof body?.exerciseName === "string" ? body.exerciseName.trim().slice(0, 120) : "";
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (!token || !exerciseName) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();
  const key = keyFor(exerciseName);
  if (!note) {
    const { error } = await supabase.from("athlete_exercise_setups").delete().eq("athlete_id", athlete.id).eq("exercise_key", key);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, setup: null });
  }
  const { data, error } = await supabase
    .from("athlete_exercise_setups")
    .upsert(
      {
        organisation_id: (athlete as any).organisation_id,
        athlete_id: athlete.id,
        exercise_key: key,
        exercise_name: exerciseName,
        note,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "athlete_id,exercise_key" }
    )
    .select("exercise_key, exercise_name, note, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, setup: data });
}
