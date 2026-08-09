import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceRoleClient } from "@/lib/supabase-service";

async function getOwner(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: coach } = await supabase
    .from("coaches")
    .select("id, organisation_id, role")
    .eq("id", user.id)
    .single();
  if (!coach || coach.role !== "owner") return null;
  return coach;
}

// Cancels a PENDING invite only - removing an already-active coach is
// a separate, not-yet-built feature. Deletes the underlying auth user
// too, since inviteUserByEmail has no supported resend path once an
// auth.users row exists for an email; this is what lets the owner
// revoke and then re-invite the same email cleanly.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const owner = await getOwner(supabase);
  if (!owner) {
    return NextResponse.json({ error: "Only the organisation owner can revoke invites" }, { status: 403 });
  }

  const { coachId } = await req.json();
  if (!coachId) return NextResponse.json({ error: "Missing coachId" }, { status: 400 });

  const service = createServiceRoleClient();
  const { data: target } = await service
    .from("coaches")
    .select("id, organisation_id, accepted_at")
    .eq("id", coachId)
    .maybeSingle();

  if (!target || target.organisation_id !== owner.organisation_id) {
    return NextResponse.json({ error: "Coach not found" }, { status: 404 });
  }
  if (target.accepted_at) {
    return NextResponse.json({ error: "This coach has already accepted - they can't be revoked this way" }, { status: 400 });
  }

  const { error: deleteError } = await service.from("coaches").delete().eq("id", coachId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  await service.auth.admin.deleteUser(coachId);

  return NextResponse.json({ ok: true });
}
