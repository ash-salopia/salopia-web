import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken, getOrgSettingsForAthlete } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { resolveTrackedMetrics, normalizePSLog, bestPSValue, PS_METRIC_META, type PSMetricKey } from "@/lib/ps-metrics";

// GET /api/athlete-link/exercise-history?token=...&exercise_name=...
// Returns this athlete's logged sets for a given exercise across all sessions,
// plus their current PB for it.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const exerciseName = req.nextUrl.searchParams.get("exercise_name");

  if (!token || !exerciseName) {
    return NextResponse.json({ error: "Missing token or exercise_name" }, { status: 400 });
  }

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();

  // Two separate queries rather than an embedded `sessions!inner(date)`
  // join — that pattern has previously caused silent failures here
  // (see detectPBAsync's docstring in app/api/athlete-link/log/route.ts
  // for the same lesson learned the hard way).
  const { data: athleteSessions, error: sessErr } = await supabase
    .from("sessions")
    .select("id, date, type")
    .eq("athlete_id", athlete.id)
    .order("date", { ascending: false })
    .limit(500);
  if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 });

  const sessionDateById = new Map((athleteSessions ?? []).map((s) => [s.id, s.date]));
  const sessionTypeById = new Map((athleteSessions ?? []).map((s) => [s.id, s.type]));
  const sessionIds = [...sessionDateById.keys()];

  const { data: exercises, error } = sessionIds.length
    ? await supabase
        .from("session_exercises")
        .select("session_id, log, reps, ps_tracked_metrics, tempo, intensity_label")
        .in("session_id", sessionIds)
        .ilike("name", exerciseName)
    : { data: [], error: null };

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 0073 — skip the PB fetch entirely when PB tracking is off for this
  // athlete (org setting or their own override).
  const orgSettings = await getOrgSettingsForAthlete(athlete.id);
  const pbEnabled = orgSettings.pb_enabled !== false && (athlete as any).pb_enabled !== false;

  // Current PB — could be weighted, bodyweight+reps, or bodyweight+time
  // (see detectPB's docstring in log/route.ts for the three shapes).
  // This endpoint only knows the exercise NAME, not whether it's
  // currently flagged bodyweight, so check all three shapes and use
  // whichever one this exercise actually has data in.
  let pbRow: { weight_kg: number | null; reps: number | null; time_seconds: number | null; date: string } | null = null;
  if (pbEnabled) {
    // Explicit pb_type ('weight'/'bw_reps'/'bw_time') rather than
    // inferring the shape from which columns are null (0110 added
    // 'e1rm'/'volume' lanes that can ALSO have weight_kg/reps/time_seconds
    // null in various combinations, so null-pattern matching here would
    // risk picking up one of those instead of the intended shape).
    const pbSelect = "weight_kg, reps, time_seconds, date";
    const pbBase = () =>
      supabase.from("personal_bests").select(pbSelect).eq("athlete_id", athlete.id).ilike("exercise_name", exerciseName);
    const [{ data: weightedPb }, { data: repsPb }, { data: timePb }] = await Promise.all([
      pbBase().eq("pb_type", "weight").order("weight_kg", { ascending: false }).limit(1).maybeSingle(),
      pbBase().eq("pb_type", "bw_reps").order("reps", { ascending: false }).limit(1).maybeSingle(),
      pbBase().eq("pb_type", "bw_time").order("time_seconds", { ascending: false }).limit(1).maybeSingle(),
    ]);
    pbRow = weightedPb ?? repsPb ?? timePb ?? null;
  }

  // Build a per-session summary (best set each session).
  //
  // Power/Speed exercises log a completely different shape (PSSetLog:
  // set_metrics/rep_metrics per tracked metric, not weight/reps/time),
  // which the shape-agnostic heuristic below would silently misread as
  // empty/bodyweight sets - detected from the session's own type
  // (0108), not the log's shape, since a freshly-created exercise can
  // still be sitting on the generic {weight,reps,done} default shape
  // until first touched. normalizePSLog handles any input shape safely
  // either way.
  const history = (exercises ?? [])
    .map((e: any) => {
      const date = sessionDateById.get(e.session_id);
      const isPS = sessionTypeById.get(e.session_id) === "power_speed";

      if (isPS) {
        const tracked = resolveTrackedMetrics(e.ps_tracked_metrics, e.tempo, e.intensity_label);
        const doneSets = normalizePSLog(e.log, parseInt(String(e.reps ?? "")) || 4, tracked).filter((s) => s.done);
        const setLabels = doneSets.map((s) =>
          tracked
            .map((k) => {
              const v = bestPSValue(s, k);
              return v == null ? null : `${PS_METRIC_META[k].short} ${v}${PS_METRIC_META[k].unit}`;
            })
            .filter(Boolean)
            .join(" / ")
        ).filter((label) => label.length > 0);
        // Session "peak" — the best value per tracked metric across
        // every done set that session, same direction (lowerBetter)
        // logic PowerSpeedSummaryBar/bestPSValue already use.
        const peakParts = tracked.map((k) => {
          let best: number | null = null;
          for (const s of doneSets) {
            const v = bestPSValue(s, k);
            if (v == null) continue;
            best = best == null ? v : (PS_METRIC_META[k].lowerBetter ? Math.min(best, v) : Math.max(best, v));
          }
          return best == null ? null : `${PS_METRIC_META[k].short} ${best}${PS_METRIC_META[k].unit}`;
        }).filter(Boolean);
        return { date, kind: "ps" as const, peakLabel: peakParts.join(" / "), setLabels, hasData: setLabels.length > 0 };
      }

      // Shape-agnostic heuristic — compare by weight if any set has
      // one, else by time, else by reps — works because a given
      // exercise only ever populates one of these fields consistently
      // (its fixed prescription shape).
      const doneSets = (e.log ?? []).filter((s: any) => s.done);
      const bestSet = doneSets.reduce((best: any, s: any) => {
        const sw = parseFloat(s.weight) || 0;
        const bw = parseFloat(best?.weight) || 0;
        if (sw > 0 || bw > 0) return sw > bw ? s : best;
        const st = parseFloat(s.time) || 0;
        const bt = parseFloat(best?.time) || 0;
        if (st > 0 || bt > 0) return st > bt ? s : best;
        const sr = parseInt(s.reps) || 0;
        const br = parseInt(best?.reps) || 0;
        return sr > br ? s : best;
      }, doneSets[0] ?? null);
      return { date, kind: "strength" as const, bestSet, allSets: e.log ?? [], hasData: !!bestSet };
    })
    .filter((h: any) => h.date && h.hasData)
    .sort((a: any, b: any) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 20);

  return NextResponse.json({ history, pb: pbRow ?? null });
}
