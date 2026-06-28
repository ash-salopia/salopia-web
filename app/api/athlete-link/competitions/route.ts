import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("competitions")
    .select(`
      *,
      athlete:athletes(id, name),
      reactions:competition_reactions(*),
      comments:competition_comments(* )
    `)
    .eq("organisation_id", athlete.organisation_id)
    .order("competition_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ competitions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, action, ...rest } = body;

  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = await createClient();

  // Add a competition
  if (action === "add_competition") {
    const { title, competition_date, location, notes, athlete_id_override } = rest;
    if (!title || !competition_date) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    // Allow coach to add a competition for a different athlete in the same org
    let targetAthleteId = athlete.id;
    if (athlete_id_override && athlete_id_override !== athlete.id) {
      // Verify the override athlete is in the same organisation
      const { data: overrideAthlete } = await supabase
        .from("athletes")
        .select("id, organisation_id")
        .eq("id", athlete_id_override)
        .eq("organisation_id", athlete.organisation_id)
        .single();
      if (overrideAthlete) targetAthleteId = overrideAthlete.id;
    }

    const { data, error } = await supabase
      .from("competitions")
      .insert({ athlete_id: targetAthleteId, organisation_id: athlete.organisation_id, title, competition_date, location: location ?? null, notes: notes ?? null })
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ competition: data });
  }

  // React to a competition
  if (action === "react") {
    const { competition_id, emoji } = rest;
    const { error } = await supabase
      .from("competition_reactions")
      .upsert({ competition_id, reactor_id: athlete.id, reactor_type: "athlete", reactor_name: (athlete as any).name ?? "Athlete", emoji })
      .select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Comment on a competition
  if (action === "comment") {
    const { competition_id, body: commentBody } = rest;
    if (!commentBody?.trim()) return NextResponse.json({ error: "Empty comment" }, { status: 400 });
    const { data, error } = await supabase
      .from("competition_comments")
      .insert({ competition_id, author_id: athlete.id, author_type: "athlete", author_name: (athlete as any).name ?? "Athlete", body: commentBody.trim() })
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ comment: data });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
