import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { feedDisplayName } from "@/lib/feed-name";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();

  const { data: orgAthletes } = await supabase
    .from("athletes")
    .select("id")
    .eq("organisation_id", athlete.organisation_id);
  const athleteIds = (orgAthletes ?? []).map((a: any) => a.id);

  const { data, error } = await supabase
    .from("personal_bests")
    .select("*, athlete:athletes(id, name, hide_pbs_from_feed, feed_first_name_only), reactions:pb_reactions(*), comments:pb_comments(*)")
    .in("athlete_id", athleteIds.length ? athleteIds : [athlete.id])
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // "Hide my PBs from feed" hides them from other athletes only — the
  // athlete can still see their own in their own feed. Name display
  // preference is applied per-PB-owner regardless of who's viewing.
  const visible = (data ?? [])
    .filter((pb: any) => {
      const a = Array.isArray(pb.athlete) ? pb.athlete[0] : pb.athlete;
      return !a?.hide_pbs_from_feed || a.id === athlete.id;
    })
    .map((pb: any) => {
      const a = Array.isArray(pb.athlete) ? pb.athlete[0] : pb.athlete;
      return { ...pb, athlete: a ? { id: a.id, name: feedDisplayName(a.name, a.feed_first_name_only) } : a };
    });

  return NextResponse.json({ pbs: visible });
}

export async function DELETE(req: NextRequest) {
  const { token, pb_id } = await req.json();
  if (!token || !pb_id) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();

  // Athletes can only delete their own PBs
  const { error } = await supabase
    .from("personal_bests")
    .delete()
    .eq("id", pb_id)
    .eq("athlete_id", athlete.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
