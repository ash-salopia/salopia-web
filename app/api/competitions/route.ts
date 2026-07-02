import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// Coach-authenticated competitions endpoint.
// Uses the cookie-based auth client — RLS my_organisation_id() works for coaches.

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competitions")
    .select(`*, athlete:athletes(id, name), reactions:competition_reactions(*), comments:competition_comments(*)`)
    .order("competition_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ competitions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: coach } = await supabase.from("coaches").select("id, name, organisation_id").eq("id", user.id).single();
  if (!coach) return NextResponse.json({ error: "Not a coach" }, { status: 403 });

  const body = await req.json();
  const { action, ...rest } = body;

  if (action === "add_competition") {
    const { athlete_id, title, competition_date, location, notes } = rest;
    if (!athlete_id || !title || !competition_date) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    const { data, error } = await supabase
      .from("competitions")
      .insert({ athlete_id, organisation_id: coach.organisation_id, title, competition_date, location: location ?? null, notes: notes ?? null })
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ competition: data });
  }

  if (action === "delete_competition") {
    const { competition_id } = rest;
    const { error } = await supabase.from("competitions").delete().eq("id", competition_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "react") {
    const { competition_id, emoji } = rest;
    const { error } = await supabase
      .from("competition_reactions")
      .upsert({ competition_id, reactor_id: coach.id, reactor_type: "coach", reactor_name: coach.name, emoji });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "remove_react") {
    const { competition_id } = rest;
    const { error } = await supabase.from("competition_reactions").delete()
      .eq("competition_id", competition_id).eq("reactor_id", coach.id).eq("reactor_type", "coach");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "comment") {
    const { competition_id, body: commentBody } = rest;
    if (!commentBody?.trim()) return NextResponse.json({ error: "Empty comment" }, { status: 400 });
    const { data, error } = await supabase
      .from("competition_comments")
      .insert({ competition_id, author_id: coach.id, author_type: "coach", author_name: coach.name, body: commentBody.trim() })
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ comment: data });
  }

  if (action === "delete_comment") {
    const { comment_id } = rest;
    // Coaches can delete any comment in their org (moderation)
    const { error } = await supabase.from("competition_comments").delete().eq("id", comment_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
