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

  const { data: memberships } = await supabase
    .from("group_members").select("group_id").eq("athlete_id", athlete.id);
  const groupIds = (memberships ?? []).map((m: any) => m.group_id);

  let query = supabase
    .from("announcements")
    .select("*, group:groups(id, name), coach:coaches(name)")
    .eq("organisation_id", athlete.organisation_id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (groupIds.length > 0) {
    query = query.or(`group_id.is.null,group_id.in.(${groupIds.join(",")})`);
  } else {
    query = query.is("group_id", null);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ announcements: data ?? [] });
}
