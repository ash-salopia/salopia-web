import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// Autosave endpoint for the Group Testing grid. One call per cell edit,
// routed through lib/save-queue.ts's saveWithRetry so a dropped
// connection queues the write and retries it rather than losing it.
//
// Uses the RLS-scoped server client (the logged-in coach's session) —
// the test_sessions / test_results policies from 0005 already scope
// every read/write to the coach's own organisation, so there's no
// extra ownership check to do here beyond "are you a signed-in coach".

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { kind, testSessionId } = body;
  if (!testSessionId) return NextResponse.json({ error: "Missing testSessionId" }, { status: 400 });

  try {
    if (kind === "bodyweight") {
      const kg = body.bodyweightKg;
      const value = kg === null || kg === "" || kg === undefined ? null : Number(kg);
      if (value !== null && !isFinite(value)) {
        return NextResponse.json({ error: "Invalid bodyweight" }, { status: 400 });
      }
      const { error } = await supabase
        .from("test_sessions")
        .update({ bodyweight_kg: value })
        .eq("id", testSessionId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (kind === "trials") {
      const { testMetricId, side } = body;
      const sideVal: "left" | "right" | null = side === "left" || side === "right" ? side : null;
      if (!testMetricId) return NextResponse.json({ error: "Missing testMetricId" }, { status: 400 });

      const values: number[] = Array.isArray(body.values)
        ? body.values.map((v: unknown) => Number(v)).filter((v: number) => isFinite(v))
        : [];

      // Idempotent replace — clear this metric+side's trials for the
      // session, then re-insert. Mirrors lib/data/testing.ts saveTrials.
      let del = supabase
        .from("test_results")
        .delete()
        .eq("test_session_id", testSessionId)
        .eq("test_metric_id", testMetricId);
      del = sideVal ? del.eq("side", sideVal) : del.is("side", null);
      const { error: delErr } = await del;
      if (delErr) throw delErr;

      if (values.length) {
        const { error: insErr } = await supabase.from("test_results").insert(
          values.map((value, i) => ({
            test_session_id: testSessionId,
            test_metric_id: testMetricId,
            side: sideVal,
            trial_number: i + 1,
            value,
          }))
        );
        if (insErr) throw insErr;
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
