import { NextRequest, NextResponse } from "next/server";
import { getLiveGroupCaller } from "@/lib/live-group/server";
import { exerciseDefaults, type NewExerciseInput } from "@/lib/data/sessions";

// Every Live Group save goes through here, so the device limit is
// enforced on the server: a device that isn't (or wasn't, at the time
// the change was made) in control of Live Group gets 409
// NOT_ACTIVE_DEVICE, which the page treats as "switch to view-only",
// not as an error.
//
// The actual writes use the caller's own Supabase client, so normal RLS
// still decides which athletes/sessions this coach may touch. Only Live
// Group's own coach page calls this — the athlete share-link app
// (/api/athlete-link/*) writes through its own routes and is unaffected.
//
// Set edits change ONE set (live_group_patch_set etc., 0113) rather than
// rewriting the whole log, so a device reconnecting with queued saves
// can't overwrite sets another device logged in the meantime.

type Op =
  | { kind: "patchSet"; exerciseId: string; setIndex: number; patch: Record<string, unknown> }
  | { kind: "appendSet"; exerciseId: string; expectedLength: number; set: Record<string, unknown> }
  | { kind: "removeLastSet"; exerciseId: string; expectedLength: number }
  | { kind: "replaceLog"; exerciseId: string; log: unknown[] }
  | { kind: "exercise"; exerciseId: string; patch: Record<string, unknown> }
  | { kind: "session"; sessionId: string; patch: Record<string, unknown> }
  | { kind: "addExercise"; sessionId: string; exercise: NewExerciseInput };

const SET_FIELDS = ["weight", "reps", "time", "velocity", "pause", "done"];
const EXERCISE_FIELDS = ["progress", "notes", "name", "sets", "rest", "target_load", "reps", "time"];
const SESSION_FIELDS = ["session_notes", "hyrox_config", "cardio_config"];

function pick(obj: Record<string, unknown> | undefined, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (obj && k in obj) out[k] = obj[k];
  return out;
}

export async function POST(request: NextRequest) {
  const caller = await getLiveGroupCaller();
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { deviceId?: string; loggedAt?: string; op?: Op };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const { deviceId, op } = body;
  const loggedAt = body.loggedAt && !isNaN(Date.parse(body.loggedAt)) ? body.loggedAt : new Date().toISOString();
  if (!deviceId || !op?.kind) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const { supabase } = caller;

  // Unlimited-device plans (incl. trial) skip the check entirely —
  // there's nothing to enforce and no way to lock anyone out.
  if (caller.limits.maxDevices != null) {
    const { data: allowed, error } = await supabase.rpc("live_group_can_write", {
      p_device: deviceId,
      p_logged_at: loggedAt,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!allowed) {
      return NextResponse.json(
        { error: "Live Group is being controlled on another device", code: "NOT_ACTIVE_DEVICE" },
        { status: 409 }
      );
    }
  }

  switch (op.kind) {
    case "patchSet": {
      const patch = pick(op.patch, SET_FIELDS);
      const { data, error } = await supabase.rpc("live_group_patch_set", {
        p_exercise: op.exerciseId, p_index: op.setIndex, p_patch: patch,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, log: data });
    }
    case "appendSet": {
      const { data, error } = await supabase.rpc("live_group_append_set", {
        p_exercise: op.exerciseId, p_expected_len: op.expectedLength, p_set: pick(op.set, SET_FIELDS),
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, log: data });
    }
    case "removeLastSet": {
      const { data, error } = await supabase.rpc("live_group_remove_last_set", {
        p_exercise: op.exerciseId, p_expected_len: op.expectedLength,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, log: data });
    }
    case "replaceLog": {
      // Power/Speed logs (nested per-rep metrics) — whole-log write, the
      // same as before this route existed.
      if (!Array.isArray(op.log)) return NextResponse.json({ error: "Invalid log" }, { status: 400 });
      const { data, error } = await supabase
        .from("session_exercises").update({ log: op.log }).eq("id", op.exerciseId).select("id");
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (!data?.length) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    case "exercise": {
      const patch = pick(op.patch, EXERCISE_FIELDS);
      const { data, error } = await supabase
        .from("session_exercises").update(patch).eq("id", op.exerciseId).select("id");
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (!data?.length) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    case "session": {
      const patch = pick(op.patch, SESSION_FIELDS);
      const { data, error } = await supabase
        .from("sessions").update(patch).eq("id", op.sessionId).select("id");
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (!data?.length) return NextResponse.json({ error: "Session not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    case "addExercise": {
      const { data: existing } = await supabase
        .from("session_exercises").select("sort_order").eq("session_id", op.sessionId)
        .order("sort_order", { ascending: false }).limit(1);
      const sortOrder = ((existing?.[0] as { sort_order?: number } | undefined)?.sort_order ?? -1) + 1;
      const { data, error } = await supabase
        .from("session_exercises")
        .insert({ session_id: op.sessionId, ...exerciseDefaults(op.exercise), sort_order: sortOrder })
        .select();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, exercises: data ?? [] });
    }
    default:
      return NextResponse.json({ error: "Unknown operation" }, { status: 400 });
  }
}
