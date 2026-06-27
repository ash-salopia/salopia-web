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
  const { token, action, athlete_id: bodyAthleteId, organisation_id: bodyOrgId, actor_id, actor_name, actor_type, ...rest } = body;

  const supabase = await createClient();
  let resolvedAthleteId: string;
  let resolvedOrgId: string;
  let resolvedActorId: string;
  let resolvedActorName: string;
  let resolvedActorType: string;

  if (token) {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    resolvedAthleteId = athlete.id;
    resolvedOrgId = athlete.organisation_id;
    resolvedActorId = athlete.id;
    resolvedActorName = (athlete as any).name ?? "Athlete";
    resolvedActorType = "athlete";
  } else if (bodyOrgId && actor_id) {
    resolvedAthleteId = bodyAthleteId ?? "";
    resolvedOrgId = bodyOrgId;
    resolvedActorId = actor_id;
    resolvedActorName = actor_name ?? "Coach";
    resolvedActorType = actor_type ?? "coach";
  } else {
    return NextResponse.json({ error: "Missing token or identity" }, { status: 400 });
  }

  // Add a competition
  if (action === "add_competition") {
    const { title, competition_date, location, notes } = rest;
    if (!title || !competition_date) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    const { data, error } = await supabase
      .from("competitions")
      .insert({ athlete_id: resolvedAthleteId || null, organisation_id: resolvedOrgId, title, competition_date, location: location ?? null, notes: notes ?? null })
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ competition: data });
  }

  // React to a competition
  if (action === "react") {
    const { competition_id, emoji } = rest;
    const { error } = await supabase
      .from("competition_reactions")
      .upsert({ competition_id, reactor_id: resolvedActorId, reactor_type: resolvedActorType, reactor_name: resolvedActorName, emoji })
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
      .insert({ competition_id, author_id: resolvedActorId, author_type: resolvedActorType, author_name: resolvedActorName, body: commentBody.trim() })
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ comment: data });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
