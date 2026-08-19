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

// Sets a coach's athlete_access ('all' | 'assigned', see
// 0064_coach_athlete_access.sql). Goes through the service role for
// the same reason app/api/coaches/archive/route.ts does: the coaches
// table's own RLS only lets a coach update THEIR OWN row (id =
// auth.uid()), so an owner changing a colleague's row needs a
// server-side path with its own explicit ownership check.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const owner = await getOwner(supabase);
  if (!owner) {
    return NextResponse.json({ error: "Only the organisation owner can do this" }, { status: 403 });
  }

  const { coachId, athleteAccess } = await req.json();
  if (!coachId || (athleteAccess !== "all" && athleteAccess !== "assigned")) {
    return NextResponse.json({ error: "Missing coachId or invalid athleteAccess" }, { status: 400 });
  }
  if (coachId === owner.id) {
    return NextResponse.json({ error: "You can't restrict your own access" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data: target } = await service
    .from("coaches")
    .select("id, organisation_id, role")
    .eq("id", coachId)
    .maybeSingle();

  if (!target || target.organisation_id !== owner.organisation_id) {
    return NextResponse.json({ error: "Coach not found" }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json({ error: "An owner always has full access" }, { status: 400 });
  }

  const { data: updated, error } = await service
    .from("coaches")
    .update({ athlete_access: athleteAccess })
    .eq("id", coachId)
    .select("id, athlete_access")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ coach: updated });
}
