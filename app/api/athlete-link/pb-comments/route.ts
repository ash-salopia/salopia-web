import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

export async function POST(req: NextRequest) {
  const reqBody = await req.json();
  const { token, pb_id, body: commentBody } = reqBody;

  if (!token || !pb_id || !commentBody?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();

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

export async function DELETE(req: NextRequest) {
  const { token, comment_id } = await req.json();
  if (!token || !comment_id) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();

  // Athlete can only delete their own comments
  const { error } = await supabase
    .from("pb_comments")
    .delete()
    .eq("id", comment_id)
    .eq("author_id", athlete.id)
    .eq("author_type", "athlete");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
