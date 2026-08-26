import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceRoleClient } from "@/lib/supabase-service";

// SECURITY NOTE: this route previously trusted author_id/author_name
// straight from the request body with no auth check on the insert side,
// and no ownership check at all on delete. Since it uses the service-role
// client (which bypasses RLS), that meant:
//   - POST: any logged-in coach could post a comment on ANY organisation's
//     athlete's PB, impersonating any name they chose.
//   - DELETE: any logged-in coach could delete ANY comment from ANY
//     organisation, with zero ownership check.
// Fixed by requiring a real coach session, deriving identity from the
// coaches table (never trusting body-supplied author fields), and
// verifying the target PB/comment belongs to an athlete in the coach's
// own organisation before allowing the write.

async function getCoach(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: coach } = await supabase
    .from("coaches")
    .select("id, name, organisation_id")
    .eq("id", user.id)
    .single();
  return coach;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const coach = await getCoach(supabase);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pb_id, body: commentBody } = await req.json();
  if (!pb_id || !commentBody?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const service = createServiceRoleClient();

  // 0073 — feature's off org-wide, this is just a dead UI path once the
  // entry point is hidden; no-op rather than error.
  const { data: org } = await service.from("organisations").select("settings").eq("id", coach.organisation_id).single();
  if ((org?.settings as any)?.pb_enabled === false) {
    return NextResponse.json({ error: "Personal Bests are disabled" }, { status: 403 });
  }

  // Verify the PB belongs to an athlete in THIS coach's organisation
  // before allowing the comment - stops cross-organisation writes.
  const { data: pb } = await service
    .from("personal_bests")
    .select("id, athletes!inner(organisation_id)")
    .eq("id", pb_id)
    .maybeSingle();
  const pbOrgId = Array.isArray((pb as any)?.athletes) ? (pb as any).athletes[0]?.organisation_id : (pb as any)?.athletes?.organisation_id;
  if (!pb || pbOrgId !== coach.organisation_id) {
    return NextResponse.json({ error: "PB not found" }, { status: 404 });
  }

  const { data, error } = await service
    .from("pb_comments")
    .insert({
      pb_id,
      author_id: coach.id,        // always the real, verified coach — never body-supplied
      author_type: "coach",
      author_name: coach.name,    // always the real coach name — never body-supplied
      body: commentBody.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const coach = await getCoach(supabase);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { comment_id } = await req.json();
  if (!comment_id) return NextResponse.json({ error: "Missing comment_id" }, { status: 400 });

  const service = createServiceRoleClient();

  // Verify the comment belongs to a PB whose athlete is in THIS coach's
  // organisation before deleting - coaches can moderate any comment
  // within their own org (matches the pattern on the community page),
  // but never another organisation's data.
  const { data: comment } = await service
    .from("pb_comments")
    .select("id, personal_bests!inner(athlete_id, athletes!inner(organisation_id))")
    .eq("id", comment_id)
    .maybeSingle();

  const pbData = (comment as any)?.personal_bests;
  const pbRow = Array.isArray(pbData) ? pbData[0] : pbData;
  const athletesData = pbRow?.athletes;
  const orgId = Array.isArray(athletesData) ? athletesData[0]?.organisation_id : athletesData?.organisation_id;

  if (!comment || orgId !== coach.organisation_id) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  const { error } = await service.from("pb_comments").delete().eq("id", comment_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
