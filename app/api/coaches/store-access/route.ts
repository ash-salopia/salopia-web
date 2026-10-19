import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceRoleClient } from "@/lib/supabase-service";

// Owner switches Online Store access on/off for a coach
// (coaches.can_manage_store, 0126). Service role for the same reason as
// athlete-access/route.ts: a coach can't update a colleague's row, and
// 0126's guard trigger blocks signed-in coaches changing this column
// directly - this route is the only way in, with its own owner check.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: owner } = await supabase.from("coaches").select("id, organisation_id, role").eq("id", user.id).single();
  if (!owner || owner.role !== "owner") {
    return NextResponse.json({ error: "Only the organisation owner can do this" }, { status: 403 });
  }

  const { coachId, canManageStore } = await req.json().catch(() => ({}));
  if (!coachId || typeof canManageStore !== "boolean") {
    return NextResponse.json({ error: "Missing coachId or canManageStore" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data: target } = await service.from("coaches").select("id, organisation_id, role").eq("id", coachId).maybeSingle();
  if (!target || target.organisation_id !== owner.organisation_id) {
    return NextResponse.json({ error: "Coach not found" }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json({ error: "An owner always has store access" }, { status: 400 });
  }

  const { data: updated, error } = await service
    .from("coaches")
    .update({ can_manage_store: canManageStore })
    .eq("id", coachId)
    .select("id, can_manage_store")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ coach: updated });
}
