import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";

// Normalise a raw competition row from Supabase so CompetitionFeed never
// receives null for reactions or comments (supabase-js v2 returns null for
// embedded selects with no matching rows, but the component calls .find()
// and .forEach() on them which crash on null).
function normalise(c: any) {
  return {
    ...c,
    athlete: c.athlete ?? { id: "", name: "Unknown" },
    reactions: c.reactions ?? [],
    comments: c.comments ?? [],
  };
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("competitions")
    .select(`*, athlete:athletes(id, name), reactions:competition_reactions(*), comments:competition_comments(*)`)
    .eq("organisation_id", athlete.organisation_id)
    .order("competition_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ competitions: (data ?? []).map(normalise) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, action, ...rest } = body;

  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();

  if (action === "add_competition") {
    const { title, competition_date, location, notes } = rest;
    if (!title || !competition_date) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    // SECURITY: competitions are always created under the athlete resolved
    // from THEIR OWN token — never a caller-supplied athlete_id. An earlier
    // version accepted an "athlete_id_override" here, which would have let
    // any athlete create a competition entry impersonating a teammate.
    const { data, error } = await supabase
      .from("competitions")
      .insert({
        athlete_id: athlete.id,
        organisation_id: athlete.organisation_id,
        title,
        competition_date,
        location: location ?? null,
        notes: notes ?? null,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ competition: data });
  }

  if (action === "react") {
    const { competition_id, emoji } = rest;
    const { error } = await supabase
      .from("competition_reactions")
      .upsert(
        { competition_id, reactor_id: athlete.id, reactor_type: "athlete", reactor_name: (athlete as any).name ?? "Athlete", emoji },
        { onConflict: "competition_id,reactor_id,reactor_type" }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "comment") {
    const { competition_id, body: commentBody } = rest;
    if (!commentBody?.trim()) return NextResponse.json({ error: "Empty comment" }, { status: 400 });
    const { data, error } = await supabase
      .from("competition_comments")
      .insert({
        competition_id,
        author_id: athlete.id,
        author_type: "athlete",
        author_name: (athlete as any).name ?? "Athlete",
        body: commentBody.trim(),
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ comment: data });
  }

  if (action === "delete_comment") {
    const { comment_id } = rest;
    const { error } = await supabase
      .from("competition_comments")
      .delete()
      .eq("id", comment_id)
      .eq("author_id", athlete.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
