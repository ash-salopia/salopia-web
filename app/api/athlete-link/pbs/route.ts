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

  const { data: groupMemberships } = await supabase
    .from("group_members").select("group_id").eq("athlete_id", athlete.id);
  const groupIds = (groupMemberships ?? []).map((m: any) => m.group_id);

  let athleteIds: string[] = [athlete.id];
  if (groupIds.length > 0) {
    const { data: groupAthletes } = await supabase
      .from("group_members").select("athlete_id").in("group_id", groupIds);
    athleteIds = [...new Set([athlete.id, ...(groupAthletes ?? []).map((m: any) => m.athlete_id)])];
  }

  const { data, error } = await supabase
    .from("personal_bests")
    .select("*, athlete:athletes(id, name), reactions:pb_reactions(*)")
    .in("athlete_id", athleteIds)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pbs: data ?? [] });
}
