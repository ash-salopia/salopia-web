import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { DEFAULT_SETTINGS, type OrgSettings } from "@/lib/data/settings";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { estimateOneRM, type OneRMFormula } from "@/lib/one-rm";

async function getOrgSettingsForAthlete(athleteId: string): Promise<OrgSettings> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("athletes")
    .select("organisation_id, organisations(settings)")
    .eq("id", athleteId)
    .single();
  const org = Array.isArray(data?.organisations) ? data.organisations[0] : (data?.organisations as any);
  return { ...DEFAULT_SETTINGS, ...(org?.settings ?? {}) };
}

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

  const goalsWithProgress = await Promise.all(
    (goals ?? []).map(async (goal: any) => {
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
  const rawTargetKg = goalData.target_kg;
  const safeTargetKg = (rawTargetKg !== null && rawTargetKg !== undefined && !isNaN(Number(rawTargetKg)))
    ? Number(rawTargetKg)
    : null;

  // Validate goal_type to avoid check-constraint rejection
  const validGoalTypes = ["exercise", "weight", "time", "text"] as const;
  const safeGoalType = validGoalTypes.includes(goalData.goal_type) ? goalData.goal_type : "text";

  const { data, error } = await supabase
    .from("athlete_goals")
    .insert({
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
    })
    .select()
    .single();

  if (error) {
    console.error("[goals POST] Supabase error:", error);
    return NextResponse.json({ error: error.message, detail: error.details }, { status: 500 });
  }
  return NextResponse.json({ goal: data });
}

// ── PATCH — star / unstar ─────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { token, goalId, starred } = body;
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

  const { error } = await supabase
    .from("athlete_goals")
    .update({ starred: !!starred })
    .eq("id", goalId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
