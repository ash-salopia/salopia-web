import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

// POST /api/athlete-link/pb-comments
// Body: { token, pb_id, body }
// Adds a comment from this athlete on a PB. Identity is resolved server-side
// from the share token — this is the secure, token-validated counterpart to
// the coach-side /api/pb-comments route (which trusts an authenticated coach
// session instead).
export async function POST(req: NextRequest) {
  const reqBody = await req.json();
  const { token, pb_id, body: commentBody } = reqBody;

  if (!token || !pb_id || !commentBody?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();

  // Confirm the PB belongs to someone in the athlete's organisation
  const { data: pb } = await supabase
    .from("personal_bests")
    .select("id, athletes!inner(organisation_id)")
    .eq("id", pb_id)
    .single();

  const pbOrgId = (pb as any)?.athletes?.organisation_id;
  if (!pb || pbOrgId !== athlete.organisation_id) {
    return NextResponse.json({ error: "PB not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("pb_comments")
    .insert({
      pb_id,
      author_id: athlete.id,
      author_type: "athlete",
      author_name: athlete.name,
      body: commentBody.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data });
}
