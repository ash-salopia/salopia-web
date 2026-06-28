import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";

// GET /api/athlete-link/reflections?token=xxx&week=YYYY-MM-DD
// Returns the reflection for a given week_start (Monday), or null if none yet.
// Also returns org reflection config so the form knows what to show.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const week  = req.nextUrl.searchParams.get("week"); // YYYY-MM-DD (Monday)

  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = await createClient();

  // Fetch org settings for reflection config
  const { data: org } = await supabase
    .from("organisations")
    .select("settings")
    .eq("id", athlete.organisation_id)
    .single();

  const settings = org?.settings as any ?? {};

  const config = {
    reflection_enabled:       settings.reflection_enabled !== false,
    reflection_metrics:       settings.reflection_metrics       ?? null, // null = use default
    reflection_good_prompt:   settings.reflection_good_prompt   ?? "What went well this week?",
    reflection_better_prompt: settings.reflection_better_prompt ?? "What could have been better?",
    reflection_how_prompt:    settings.reflection_how_prompt    ?? "How will you improve next week?",
  };

  if (!week) return NextResponse.json({ config, reflection: null });

  // Fetch reflection for this specific week
  const { data: reflection } = await supabase
    .from("weekly_reflections")
    .select("*")
    .eq("athlete_id", athlete.id)
    .eq("week_start", week)
    .single();

  return NextResponse.json({ config, reflection: reflection ?? null });
}

// POST /api/athlete-link/reflections
// Body: { token, week_start, scores: {key: 1-5}, good, better, how }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, week_start, scores, good, better, how } = body;

  if (!token || !week_start) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("weekly_reflections")
    .upsert({
      athlete_id:      athlete.id,
      organisation_id: athlete.organisation_id,
      week_start,
      scores:  scores  ?? {},
      good:    good    ?? "",
      better:  better  ?? "",
      how:     how     ?? "",
    }, { onConflict: "athlete_id,week_start" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reflection: data });
}
