import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken, getOrgSettingsForAthlete } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { estimateOneRM, type OneRMFormula } from "@/lib/one-rm";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseRepsStr(s: string | null | undefined): number {
  if (!s) return 0;
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

// Calculates the best estimated 1RM (or NRM best) for a given exercise.
// For 1RM goals: uses the org's selected formula to estimate from all logged sets.
// For NRM goals (N > 1): finds best weight where logged reps >= N.
async function calculateProgress(
  athleteId: string,
  exerciseName: string,
  repMax: number,
  targetKg: number,
  formula: OneRMFormula,
  supabase: any
): Promise<{
  currentBestKg: number | null;
  estimatedOneRMKg: number | null;
  isEstimated: boolean;
  repsUsed: number | null;
}> {
  const { data } = await supabase
    .from("session_exercises")
    .select("log, reps, sessions!inner(athlete_id)")
    .ilike("name", exerciseName)
    .eq("sessions.athlete_id", athleteId);

  if (!data?.length) {
    return { currentBestKg: null, estimatedOneRMKg: null, isEstimated: false, repsUsed: null };
  }

  let bestForGoal = 0;       // best weight meeting the rep criteria
  let bestRepsUsed: number | null = null;
  let bestEstimatedRM = 0;   // best estimated 1RM across all sets (for 1RM goals)

  for (const ex of data) {
    const prescribedReps = parseRepsStr(ex.reps);
    const log: Array<{ weight: string; reps: string; done: boolean }> = ex.log ?? [];

    for (const set of log) {
      if (!set.done) continue;
      const w = parseFloat(set.weight);
      if (isNaN(w) || w <= 0) continue;
      const r = parseRepsStr(set.reps) || prescribedReps || 1;

      // Always calculate estimated 1RM from this set
      const est = estimateOneRM(w, r, formula);
      if (est !== null && est > bestEstimatedRM) bestEstimatedRM = est;

      // For the goal-specific best:
      if (repMax === 1) {
        // 1RM goal: any completed set contributes (via estimation)
        // We track best weight directly here for display
        if (r === 1 && w > bestForGoal) { bestForGoal = w; bestRepsUsed = 1; }
      } else {
        // NRM goal: best weight where reps >= N
        if (r >= repMax && w > bestForGoal) { bestForGoal = w; bestRepsUsed = r; }
      }
    }
  }

  if (repMax === 1) {
    // For 1RM goals, show the estimated 1RM as the "current best"
    const estimated = bestEstimatedRM > 0 ? bestEstimatedRM : null;
    return {
      currentBestKg: estimated,
      estimatedOneRMKg: estimated,
      isEstimated: true,
      repsUsed: null,
    };
  }

  return {
    currentBestKg: bestForGoal > 0 ? bestForGoal : null,
    estimatedOneRMKg: bestEstimatedRM > 0 ? bestEstimatedRM : null,
    isEstimated: false,
    repsUsed: bestRepsUsed,
  };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

    const [supabase, orgSettings] = await Promise.all([
      Promise.resolve(createServiceRoleClient()),
      getOrgSettingsForAthlete(athlete.id),
    ]);

    const { data: goals, error } = await supabase
      .from("athlete_goals")
      .select("*")
      .eq("athlete_id", athlete.id)
      .order("starred", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const formula = orgSettings.one_rm_formula;
  const unit = orgSettings.weight_unit;

  // Test-metric goals: pull the athlete's test history + metric defs once,
  // then resolve each goal's current best value below.
  const testGoals = (goals ?? []).filter((g: any) => g.goal_type === "test" && g.test_metric_id);
  const testLatest: Record<string, { value: number; date: string }> = {};
  const testMetricInfo: Record<string, { unit: string; better_direction: "higher" | "lower"; name: string }> = {};
  if (testGoals.length) {
    const metricIds = Array.from(new Set(testGoals.map((g: any) => g.test_metric_id as string)));
    const [metricsRes, sessionsRes] = await Promise.all([
      supabase.from("test_metrics").select("id, name, unit, better_direction").in("id", metricIds),
      supabase
        .from("test_sessions")
        .select("date, results:test_results(test_metric_id, value)")
        .eq("athlete_id", athlete.id)
        .order("date", { ascending: false }),
    ]);
    for (const m of metricsRes.data ?? []) {
      testMetricInfo[m.id as string] = {
        unit: (m.unit as string) ?? "",
        better_direction: m.better_direction as "higher" | "lower",
        name: m.name as string,
      };
    }
    for (const sess of sessionsRes.data ?? []) {
      for (const mid of metricIds) {
        if (testLatest[mid]) continue;
        const dir = testMetricInfo[mid]?.better_direction ?? "higher";
        const vals = ((sess.results ?? []) as { test_metric_id: string; value: number }[])
          .filter((r) => r.test_metric_id === mid)
          .map((r) => Number(r.value))
          .filter((n) => Number.isFinite(n));
        if (!vals.length) continue;
        testLatest[mid] = { value: dir === "lower" ? Math.min(...vals) : Math.max(...vals), date: sess.date as string };
      }
    }
  }

  const goalsWithProgress = await Promise.all(
    (goals ?? []).map(async (goal: any) => {
      if (goal.goal_type === "test" && goal.test_metric_id && goal.target_value != null) {
        const info = testMetricInfo[goal.test_metric_id];
        const dir = info?.better_direction ?? "higher";
        const current = testLatest[goal.test_metric_id]?.value ?? null;
        const start = goal.start_value != null ? Number(goal.start_value) : null;
        const target = Number(goal.target_value);
        const improved = dir === "lower" ? "down" : "up";
        const achieved = current != null && (improved === "up" ? current >= target : current <= target);
        // Progress across the start→target span (0 at baseline, 100 at target).
        let progress_pct = 0;
        if (current != null) {
          if (achieved) progress_pct = 100;
          else if (start != null && start !== target) {
            progress_pct = Math.max(0, Math.min(100, Math.round(((current - start) / (target - start)) * 100)));
          }
        }
        return {
          ...goal,
          test_metric_name: info?.name ?? null,
          test_unit: info?.unit ?? goal.unit ?? "",
          better_direction: dir,
          current_value: current,
          current_value_date: testLatest[goal.test_metric_id]?.date ?? null,
          test_achieved: achieved,
          progress_pct,
          display_unit: unit,
        };
      }

      if (goal.goal_type !== "exercise" || !goal.exercise_name || !goal.rep_max || !goal.target_kg) {
        return {
          ...goal,
          current_best_kg: null,
          estimated_one_rm_kg: null,
          is_estimated: false,
          gap_kg: null,
          gap_pct: null,
          progress_pct: 0,
          // Pass unit/formula for display
          display_unit: unit,
        };
      }

      const { currentBestKg, estimatedOneRMKg, isEstimated, repsUsed } =
        await calculateProgress(
          athlete.id,
          goal.exercise_name,
          goal.rep_max,
          parseFloat(goal.target_kg),
          formula,
          supabase
        );

      const target = parseFloat(goal.target_kg);
      const current = currentBestKg;
      const gap_kg = current !== null ? Math.max(0, Math.round((target - current) * 10) / 10) : null;
      const gap_pct = current !== null ? Math.max(0, Math.round(((target - current) / target) * 100)) : null;
      const progress_pct = current !== null ? Math.min(100, Math.round((current / target) * 100)) : 0;

      return {
        ...goal,
        current_best_kg: current,
        estimated_one_rm_kg: estimatedOneRMKg,
        is_estimated: isEstimated,
        reps_used: repsUsed,
        gap_kg,
        gap_pct,
        progress_pct,
        display_unit: unit,
        formula_used: formula,
      };
    })
  );

  return NextResponse.json({ goals: goalsWithProgress, settings: { unit, formula } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

// ── POST — athlete creates a goal ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { token, ...goalData } = body;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();

  // Sanitise numeric fields — JSON.stringify converts NaN→null, but
  // parseFloat("abc") = NaN which Supabase rejects for numeric columns.
  const num = (v: any): number | null =>
    (v !== null && v !== undefined && v !== "" && !isNaN(Number(v))) ? Number(v) : null;
  const safeTargetKg = num(goalData.target_kg);

  // Validate goal_type to avoid check-constraint rejection
  const validGoalTypes = ["exercise", "weight", "time", "text", "test"] as const;
  const safeGoalType = validGoalTypes.includes(goalData.goal_type) ? goalData.goal_type : "text";

  const insert: Record<string, any> = {
    athlete_id: athlete.id,
    label: (goalData.label ?? "").trim() || "Goal",
    goal_type: safeGoalType,
    exercise_name: goalData.exercise_name ?? null,
    rep_max: goalData.rep_max ? Number(goalData.rep_max) : null,
    target_kg: safeTargetKg,
    target_time: goalData.target_time ?? "",
    target_text: goalData.target_text ?? "",
    unit: goalData.unit ?? "",
    starred: false,
    notes: goalData.notes ?? "",
    created_by: "athlete",
    target_date: goalData.target_date || null,
    show_on_calendar: !!goalData.show_on_calendar,
  };

  // Test-metric goals: only when the org lets athletes self-serve, and
  // the baseline is snapshotted server-side from the athlete's own test
  // history (never trusted from the client).
  if (safeGoalType === "test") {
    const orgSettings = await getOrgSettingsForAthlete(athlete.id);
    if (orgSettings.test_goals_athlete_editable !== true) {
      return NextResponse.json({ error: "Your coach sets testing goals for you." }, { status: 403 });
    }
    const metricId = goalData.test_metric_id;
    const targetValue = num(goalData.target_value);
    if (!metricId || targetValue == null) {
      return NextResponse.json({ error: "Pick a test and a target value." }, { status: 400 });
    }
    const [{ data: metric }, { data: sessions }] = await Promise.all([
      supabase.from("test_metrics").select("id, unit, better_direction, organisation_id").eq("id", metricId).single(),
      supabase
        .from("test_sessions")
        .select("date, results:test_results(test_metric_id, value)")
        .eq("athlete_id", athlete.id)
        .order("date", { ascending: false }),
    ]);
    if (!metric || metric.organisation_id !== athlete.organisation_id) {
      return NextResponse.json({ error: "Unknown test metric." }, { status: 400 });
    }
    let start: { value: number; date: string } | null = null;
    for (const sess of sessions ?? []) {
      const vals = ((sess.results ?? []) as { test_metric_id: string; value: number }[])
        .filter((r) => r.test_metric_id === metricId)
        .map((r) => Number(r.value))
        .filter((n) => Number.isFinite(n));
      if (vals.length) {
        start = { value: metric.better_direction === "lower" ? Math.min(...vals) : Math.max(...vals), date: sess.date as string };
        break;
      }
    }
    insert.test_metric_id = metricId;
    insert.target_value = targetValue;
    insert.unit = (metric.unit as string) ?? "";
    insert.start_value = start?.value ?? null;
    insert.start_value_date = start?.date ?? null;
    insert.target_kg = null;
  }

  const { data, error } = await supabase
    .from("athlete_goals")
    .insert(insert)
    .select()
    .single();

  if (error) {
    console.error("[goals POST] Supabase error:", error);
    return NextResponse.json({ error: error.message, detail: error.details }, { status: 500 });
  }
  return NextResponse.json({ goal: data });
}

// ── PATCH — star / unstar, or toggle the calendar milestone ───────────────────

export async function PATCH(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { token, goalId, starred, show_on_calendar } = body;
  if (!token || !goalId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();
  const { data: goal } = await supabase
    .from("athlete_goals")
    .select("athlete_id")
    .eq("id", goalId)
    .single();

  if (!goal || goal.athlete_id !== athlete.id) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  const patch: Record<string, any> = {};
  if (typeof starred === "boolean") patch.starred = starred;
  if (typeof show_on_calendar === "boolean") patch.show_on_calendar = show_on_calendar;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await supabase.from("athlete_goals").update(patch).eq("id", goalId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
