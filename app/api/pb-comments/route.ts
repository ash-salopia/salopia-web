import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-service";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { pb_id, body: commentBody, author_id, author_name, author_type } = body;

  if (!pb_id || !commentBody?.trim() || !author_id || !author_name) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("pb_comments")
    .insert({
      pb_id,
      author_id,
      author_type: author_type ?? "coach",
      author_name,
      body: commentBody.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data });
}

export async function DELETE(req: NextRequest) {
  const { comment_id } = await req.json();
  if (!comment_id) return NextResponse.json({ error: "Missing comment_id" }, { status: 400 });

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("pb_comments").delete().eq("id", comment_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
