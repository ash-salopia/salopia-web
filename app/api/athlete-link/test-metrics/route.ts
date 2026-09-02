import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken, getOrgSettingsForAthlete } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

// GET /api/athlete-link/test-metrics?token=xxx
// The athlete's testing metrics that have at least one recorded result,
// each with the latest best value + test date — powers the goals page's
// "set a goal off a test result" picker. `athlete_editable` says whether
// the org lets athletes create these goals themselves (coach-only when
// false; they still see coach-set test goals either way).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();
  const [orgSettings, metricsRes, sessionsRes] = await Promise.all([
    getOrgSettingsForAthlete(athlete.id),
    supabase
      .from("test_metrics")
      .select("id, name, unit, better_direction")
      .eq("organisation_id", athlete.organisation_id),
    supabase
      .from("test_sessions")
      .select("date, results:test_results(test_metric_id, value)")
      .eq("athlete_id", athlete.id)
      .order("date", { ascending: false }),
  ]);

  const metrics = metricsRes.data ?? [];
  const sessions = sessionsRes.data ?? [];

  // Newest-first walk: first session with a trial for a metric wins.
  const latest: Record<string, { value: number; date: string }> = {};
  for (const sess of sessions) {
    for (const m of metrics) {
      if (latest[m.id]) continue;
      const vals = ((sess.results ?? []) as { test_metric_id: string; value: number }[])
        .filter((r) => r.test_metric_id === m.id)
        .map((r) => Number(r.value))
        .filter((n) => Number.isFinite(n));
      if (!vals.length) continue;
      latest[m.id] = {
        value: m.better_direction === "lower" ? Math.min(...vals) : Math.max(...vals),
        date: sess.date as string,
      };
    }
  }

  const out = metrics
    .map((m) => ({
      metric_id: m.id as string,
      name: m.name as string,
      unit: (m.unit as string) ?? "",
      better_direction: m.better_direction as "higher" | "lower",
      current_value: latest[m.id]?.value ?? null,
      current_value_date: latest[m.id]?.date ?? null,
    }))
    .filter((m) => m.current_value !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    metrics: out,
    athlete_editable: orgSettings.test_goals_athlete_editable === true,
  });
}
