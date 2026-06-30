import { NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();

  // Show all PBs from athletes in the same organisation
  const { data: orgAthletes } = await supabase
    .from("athletes")
    .select("id")
    .eq("organisation_id", athlete.organisation_id);
  const athleteIds = (orgAthletes ?? []).map((a: any) => a.id);

  const { data, error } = await supabase
    .from("personal_bests")
    .select("*, athlete:athletes(id, name), reactions:pb_reactions(*), comments:pb_comments(*)")
    .in("athlete_id", athleteIds.length ? athleteIds : [athlete.id])
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pbs: data ?? [] });
}
