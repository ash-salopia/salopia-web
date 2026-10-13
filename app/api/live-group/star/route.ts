import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { getLiveGroupCaller } from "@/lib/live-group/server";
import { athleteCapMessage } from "@/lib/billing/live-group-limits";

// Adds an athlete to (or removes them from) the org's Live Group,
// enforcing the plan's athlete cap. Adding is server-only — the
// guard_live_group_star trigger (0113) blocks the browser from setting
// in_live_group directly — so this route is the one way in.
export async function POST(request: NextRequest) {
  const caller = await getLiveGroupCaller();
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { athleteId?: string; starred?: boolean };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const { athleteId, starred } = body;
  if (!athleteId || typeof starred !== "boolean") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Read through the caller's own RLS — confirms they can see this
  // athlete (same org, and assigned to them if access is restricted).
  const { data: athlete } = await caller.supabase
    .from("athletes").select("id, organisation_id, in_live_group")
    .eq("id", athleteId).eq("organisation_id", caller.orgId).maybeSingle();
  if (!athlete) return NextResponse.json({ error: "Athlete not found" }, { status: 404 });

  if (!starred) {
    // Removing is allowed straight through the caller's RLS client.
    const { error } = await caller.supabase.from("athletes").update({ in_live_group: false }).eq("id", athleteId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (athlete.in_live_group) return NextResponse.json({ ok: true });

  const service = createServiceRoleClient();
  const max = caller.limits.maxAthletes;
  if (max != null) {
    // Same count Live Group shows: starred, non-archived, whole org.
    const { count, error: countErr } = await service
      .from("athletes").select("id", { count: "exact", head: true })
      .eq("organisation_id", caller.orgId).eq("in_live_group", true).eq("archived", false);
    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
    if ((count ?? 0) >= max) {
      return NextResponse.json(
        { error: athleteCapMessage(caller.limits), code: "LIVE_GROUP_ATHLETE_CAP" },
        { status: 409 }
      );
    }
  }

  const { error } = await service
    .from("athletes").update({ in_live_group: true })
    .eq("id", athleteId).eq("organisation_id", caller.orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
