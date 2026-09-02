import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

// GET /api/athlete-link/goal-milestones?token=xxx
// Goals the coach (or the athlete) flagged to show on the calendar, as
// { date, label, goal_type } markers — rendered as 🎯 chips on the
// athlete-app calendar.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("athlete_goals")
    .select("id, label, goal_type, target_date")
    .eq("athlete_id", athlete.id)
    .eq("show_on_calendar", true)
    .not("target_date", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const milestones = (data ?? []).map((g) => ({
    id: g.id as string,
    label: g.label as string,
    goal_type: g.goal_type as string,
    date: g.target_date as string,
  }));
  return NextResponse.json({ milestones });
}
