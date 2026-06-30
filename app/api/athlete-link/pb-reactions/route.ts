import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

// POST /api/athlete-link/pb-reactions
// Body: { token, pb_id, emoji }
// Adds (or replaces) this athlete's reaction on a PB. Identity is resolved
// server-side from the share token — never trust a client-supplied athlete ID.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, pb_id, emoji } = body;

  if (!token || !pb_id || !emoji) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();

  // Confirm the PB belongs to someone in the athlete's organisation
  const { data: pb } = await supabase
    .from("personal_bests")
    .select("id, athlete_id, athletes!inner(organisation_id)")
    .eq("id", pb_id)
    .single();

  const pbOrgId = (pb as any)?.athletes?.organisation_id;
  if (!pb || pbOrgId !== athlete.organisation_id) {
    return NextResponse.json({ error: "PB not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("pb_reactions")
    .upsert(
      {
        pb_id,
        reactor_type: "athlete",
        reactor_id: athlete.id,
        reactor_name: athlete.name,
        emoji,
      },
      { onConflict: "pb_id,reactor_type,reactor_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reaction: data });
}

// DELETE /api/athlete-link/pb-reactions?token=xxx&pb_id=xxx
// Removes this athlete's reaction on a PB.
export async function DELETE(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const pbId = req.nextUrl.searchParams.get("pb_id");

  if (!token || !pbId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("pb_reactions")
    .delete()
    .eq("pb_id", pbId)
    .eq("reactor_type", "athlete")
    .eq("reactor_id", athlete.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
