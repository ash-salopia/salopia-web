import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { getLiveGroupCaller, firstName } from "@/lib/live-group/server";
import { deviceUpsellMessage } from "@/lib/billing/live-group-limits";

// Live Group device control: open / heartbeat / take over. The plan's
// device limit comes from lib/billing/live-group-limits.ts; the org and
// coach come from the signed-in session. live_group_claim() (0113) does
// the actual claim under a per-org lock.
//
// Response: { status: "active" | "full" | "displaced", activeDevices,
//             displacedBy, upsell, planName, maxDevices }
export async function POST(request: NextRequest) {
  const caller = await getLiveGroupCaller();
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { deviceId?: string; label?: string; mode?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const deviceId = String(body.deviceId ?? "").slice(0, 100);
  const label = String(body.label ?? "").slice(0, 40) || "device";
  const mode = body.mode;
  if (!deviceId || (mode !== "open" && mode !== "heartbeat" && mode !== "takeover")) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data: claim, error } = await service.rpc("live_group_claim", {
    p_org: caller.orgId,
    p_coach: caller.coachId,
    p_device: deviceId,
    p_label: label,
    p_max: caller.limits.maxDevices,
    p_mode: mode,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const status = (claim as { status: string }).status;
  const base = {
    status,
    planName: caller.limits.planName,
    maxDevices: caller.limits.maxDevices,
    upsell: deviceUpsellMessage(caller.limits),
  };
  if (status === "active") return NextResponse.json(base);

  // Names for the modal/banner. Coaches can read colleagues in their
  // own org through RLS, so the caller's client is enough here.
  const { data: coaches } = await caller.supabase
    .from("coaches").select("id, name").eq("organisation_id", caller.orgId);
  const nameOf = (id: string | null | undefined) =>
    firstName(coaches?.find((c) => c.id === id)?.name);

  if (status === "displaced") {
    const c = claim as { by_coach_id: string | null; by_label: string | null };
    return NextResponse.json({
      ...base,
      displacedBy: {
        label: c.by_label ?? "another device",
        otherCoachName: c.by_coach_id && c.by_coach_id !== caller.coachId ? nameOf(c.by_coach_id) : null,
      },
    });
  }

  // "full": list the devices currently in control, longest-running first
  // (that's the one a take-over would displace).
  const { data: rows } = await caller.supabase
    .from("live_group_devices")
    .select("coach_id, device_label, started_at, last_seen_at, displaced_at")
    .eq("organisation_id", caller.orgId)
    .is("displaced_at", null)
    .gt("last_seen_at", new Date(Date.now() - 90_000).toISOString())
    .neq("device_id", deviceId)
    .order("started_at", { ascending: true });
  return NextResponse.json({
    ...base,
    activeDevices: (rows ?? []).map((r) => ({
      label: r.device_label || "device",
      otherCoachName: r.coach_id !== caller.coachId ? nameOf(r.coach_id) : null,
    })),
  });
}
