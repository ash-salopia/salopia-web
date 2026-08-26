import { NextResponse } from "next/server";
import { getAthleteByShareToken, getOrgSettingsForAthlete } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

// GET /api/athlete-link/challenges?token=...
// Returns this athlete's saved challenges to log into, their own
// group(s) (with member names, for the leaderboard), and every logged
// result for those groups' members - the client ranks with
// rankChallengeResults(), same as the coach page does.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const orgSettings = await getOrgSettingsForAthlete(athlete.id);
  const challengesEnabled = orgSettings.challenges_enabled !== false && (athlete as any).challenges_enabled !== false;
  if (!challengesEnabled) {
    return NextResponse.json({ challengesEnabled: false, challenges: [], groups: [], results: [] });
  }

  const supabase = createServiceRoleClient();

  const { data: challenges, error: chErr } = await supabase
    .from("challenges")
    .select("*")
    .eq("organisation_id", athlete.organisation_id)
    .eq("is_saved", true)
    .order("created_at", { ascending: false });
  if (chErr) return NextResponse.json({ error: chErr.message }, { status: 500 });

  // This athlete's own group(s) - two separate queries rather than an
  // embedded join, same lesson learned the hard way documented on
  // detectPB's docstring for this exact pattern.
  const { data: myMemberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("athlete_id", athlete.id);
  const groupIds = (myMemberships ?? []).map((m) => m.group_id);

  if (!groupIds.length) {
    return NextResponse.json({ challengesEnabled: true, challenges: challenges ?? [], groups: [], results: [] });
  }

  const { data: groupRows } = await supabase.from("groups").select("id, name").in("id", groupIds);
  const { data: allMemberRows } = await supabase
    .from("group_members")
    .select("group_id, athlete_id, athletes(name)")
    .in("group_id", groupIds);

  const groups = (groupRows ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    members: (allMemberRows ?? [])
      .filter((m: any) => m.group_id === g.id)
      .map((m: any) => ({
        athleteId: m.athlete_id,
        athleteName: (Array.isArray(m.athletes) ? m.athletes[0]?.name : m.athletes?.name) ?? "Athlete",
      })),
  }));

  const memberAthleteIds = Array.from(new Set((allMemberRows ?? []).map((m: any) => m.athlete_id)));
  const challengeIds = (challenges ?? []).map((c) => c.id);

  const { data: results } = memberAthleteIds.length && challengeIds.length
    ? await supabase
        .from("challenge_results")
        .select("id, challenge_id, athlete_id, value, logged_by, logged_at")
        .in("challenge_id", challengeIds)
        .in("athlete_id", memberAthleteIds)
    : { data: [] };

  return NextResponse.json({ challengesEnabled: true, challenges: challenges ?? [], groups, results: results ?? [] });
}
