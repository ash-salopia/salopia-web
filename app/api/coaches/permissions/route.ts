import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceRoleClient } from "@/lib/supabase-service";

// Owner switches a per-coach permission (0134): can_export ("let this
// coach download data" while the account is on Owner only) or
// can_message (1-to-1 messages, group chat, announcements). Service
// role for the same reason as store-access/route.ts: the coaches guard
// trigger blocks signed-in coaches changing these columns directly.
const FIELDS = ["can_export", "can_message"] as const;
type Field = (typeof FIELDS)[number];

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

  const { coachId, field, value } = await req.json().catch(() => ({}));
  if (!coachId || !FIELDS.includes(field) || typeof value !== "boolean") {
    return NextResponse.json({ error: "Missing coachId, field or value" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data: target } = await service.from("coaches").select("id, organisation_id, role").eq("id", coachId).maybeSingle();
  if (!target || target.organisation_id !== owner.organisation_id) {
    return NextResponse.json({ error: "Coach not found" }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json({ error: "The owner always has every permission" }, { status: 400 });
  }

  const { data: updated, error } = await service
    .from("coaches")
    .update({ [field as Field]: value })
    .eq("id", coachId)
    .select("id, can_export, can_message")
    .single();
  if (error) {
    const missing = error.code === "42703" || error.code === "PGRST204";
    return NextResponse.json(
      { error: missing ? "Run migration 0134 in Supabase first." : error.message },
      { status: missing ? 503 : 500 }
    );
  }
  return NextResponse.json({ coach: updated });
}
