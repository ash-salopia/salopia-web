import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { getAthleteByShareToken, getOrgSettingsForAthlete } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { buildLeaderboards, ageInYears, leaderboardAgeBands, bandForAge, type LbAthlete, type LbSquad } from "@/lib/leaderboards";
import { resolveBranding, DEFAULT_BRANDING } from "@/types/branding";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  noStore();
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const settings = await getOrgSettingsForAthlete(athlete.id);
  if (!settings.leaderboards_enabled) return NextResponse.json({ enabled: false, boards: [], bands: [], squads: [] });

  const supabase = createServiceRoleClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: orgAthletes }, { data: orgMetrics }] = await Promise.all([
    supabase.from("athletes")
      .select("id, name, sex, date_of_birth, bodyweight_kg, hide_pbs_from_feed, feed_first_name_only")
      .eq("organisation_id", athlete.organisation_id).eq("archived", false),
    supabase.from("test_metrics").select("id").eq("organisation_id", athlete.organisation_id),
  ]);

  const athletes: LbAthlete[] = (orgAthletes ?? []).map((a) => ({
    id: a.id as string,
    name: (a.name as string) ?? "",
    sex: (a.sex as "male" | "female" | null) ?? null,
    age: ageInYears(a.date_of_birth as string | null, today),
    bodyweightKg: (a.bodyweight_kg as number | null) ?? null,
    hideFromFeed: !!a.hide_pbs_from_feed,
    firstNameOnly: !!a.feed_first_name_only,
  }));
  const athleteIds = athletes.map((a) => a.id);
  const picked = settings.leaderboards.test_metrics;
  // Scope the service-role read to the org's metrics, narrowed to the coach's
  // picked subset when there is one.
  let metricIds = (orgMetrics ?? []).map((m) => m.id as string);
  if (picked) metricIds = metricIds.filter((id) => picked.includes(id));

  const { boards, bands } = await buildLeaderboards(
    supabase,
    {
      strengthExercises: settings.leaderboards.strength_exercises,
      testMetrics: picked,
    },
    athletes,
    { athleteIds, metricIds: metricIds.length ? metricIds : ["00000000-0000-0000-0000-000000000000"] }
  );

  // The viewer's own bucket, so the app can default the filters.
  const me = athletes.find((a) => a.id === athlete.id);
  const myBand = me ? bandForAge(me.age, bands) : null;

  // Squads the athlete belongs to — the "Squads" view only offers these.
  // Separate queries, not an embedded join (see detectPB's docstring).
  const { data: myMemberships } = await supabase
    .from("group_members").select("group_id").eq("athlete_id", athlete.id);
  const myGroupIds = Array.from(new Set((myMemberships ?? []).map((m) => m.group_id as string)));
  let squads: LbSquad[] = [];
  if (myGroupIds.length) {
    const [{ data: groupRows }, { data: memberRows }] = await Promise.all([
      supabase.from("groups").select("id, name").in("id", myGroupIds).order("name"),
      supabase.from("group_members").select("group_id, athlete_id").in("group_id", myGroupIds),
    ]);
    squads = (groupRows ?? []).map((g) => ({
      id: g.id as string,
      name: g.name as string,
      athleteIds: (memberRows ?? []).filter((m) => m.group_id === g.id).map((m) => m.athlete_id as string),
    }));
  }

  // Org branding for the printable leaderboard header/footer — same
  // resolution as app/a/[token]/page.tsx, so a premium org's logo/name/
  // colour shows on the print the same way it does everywhere else.
  const { data: org } = await supabase
    .from("organisations")
    .select("name, tier, branding")
    .eq("id", athlete.organisation_id)
    .single();
  const branding = org
    ? resolveBranding({ name: org.name, tier: org.tier ?? "standard", branding: org.branding ?? {} })
    : DEFAULT_BRANDING;

  return NextResponse.json({
    enabled: true,
    boards,
    bands,
    squads,
    branding,
    me: { id: athlete.id, sex: me?.sex ?? null, bandLabel: myBand?.label ?? null },
  });
}
