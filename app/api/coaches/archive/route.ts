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

// Non-destructive access toggle for an already-accepted coach -- see
// my_organisation_id() in 0051_coach_archive.sql for how `archived`
// actually locks them out. This never touches auth.users or cascades
// any deletes, unlike removing a coach via the Supabase dashboard.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const owner = await getOwner(supabase);
  if (!owner) {
    return NextResponse.json({ error: "Only the organisation owner can do this" }, { status: 403 });
  }

  const { coachId, archived } = await req.json();
  if (!coachId || typeof archived !== "boolean") {
    return NextResponse.json({ error: "Missing coachId or archived" }, { status: 400 });
  }
  if (coachId === owner.id) {
    return NextResponse.json({ error: "You can't archive your own account" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data: target } = await service
    .from("coaches")
    .select("id, organisation_id, role, accepted_at")
    .eq("id", coachId)
    .maybeSingle();

  if (!target || target.organisation_id !== owner.organisation_id) {
    return NextResponse.json({ error: "Coach not found" }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json({ error: "An owner can't be archived" }, { status: 400 });
  }
  if (!target.accepted_at) {
    return NextResponse.json(
      { error: "This is still a pending invite -- revoke it instead of archiving" },
      { status: 400 }
    );
  }

  const { data: updated, error } = await service
    .from("coaches")
    .update({ archived })
    .eq("id", coachId)
    .select("id, name, email, role, accepted_at, archived")
    .single();

  if (error) {
    // Raised by the enforce_coach_seat_limit_reactivate trigger
    // (0051_coach_archive.sql) when reactivating would exceed the
    // organisation's coach_seat_limit.
    if (error.message.includes("COACH_SEAT_LIMIT_REACHED")) {
      return NextResponse.json(
        { error: "You've reached the coach limit for your current plan. Archive another coach to free a seat, or contact support to upgrade." },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ coach: updated });
}
