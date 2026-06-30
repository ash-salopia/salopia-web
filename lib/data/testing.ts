import { createClient } from "@/lib/supabase-browser";
import type {
  TestBattery, TestMetric, TestBenchmark, TestSession, TestResult, RagStatus,
} from "@/types";

// ── Batteries ─────────────────────────────────────────────────────────────────

export async function listTestBatteries(): Promise<TestBattery[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("test_batteries")
    .select("*, test_battery_metrics(sort_order, test_metric_id, test_metrics(*))")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((b: any) => ({
    ...b,
    metrics: (b.test_battery_metrics ?? [])
      .sort((a: any, c: any) => a.sort_order - c.sort_order)
      .map((bm: any) => bm.test_metrics)
      .filter(Boolean),
  }));
}

export async function createTestBattery(name: string, description = ""): Promise<TestBattery> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: coach } = await supabase.from("coaches").select("organisation_id").eq("id", user?.id).single();
  const { data, error } = await supabase
    .from("test_batteries")
    .insert({ organisation_id: coach?.organisation_id, name, description })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTestBattery(id: string, patch: { name?: string; description?: string }): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("test_batteries").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteTestBattery(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("test_batteries").delete().eq("id", id);
  if (error) throw error;
}

export async function setBatteryMetrics(batteryId: string, metricIds: string[]): Promise<void> {
  const supabase = createClient();
  await supabase.from("test_battery_metrics").delete().eq("test_battery_id", batteryId);
  if (metricIds.length === 0) return;
  const rows = metricIds.map((test_metric_id, i) => ({ test_battery_id: batteryId, test_metric_id, sort_order: i }));
  const { error } = await supabase.from("test_battery_metrics").insert(rows);
  if (error) throw error;
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export async function listTestMetrics(): Promise<TestMetric[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("test_metrics").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createTestMetric(metric: {
  name: string; unit: string; better_direction: "higher" | "lower";
  requires_bodyweight?: boolean; is_bilateral?: boolean; screening_only?: boolean;
  what_it_measures?: string; why_it_matters?: string;
  commentary_excellent?: string; commentary_good?: string;
  commentary_average?: string; commentary_needs_work?: string;
  notes?: string;
}): Promise<TestMetric> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: coach } = await supabase.from("coaches").select("organisation_id").eq("id", user?.id).single();
  const { data, error } = await supabase
    .from("test_metrics")
    .insert({ organisation_id: coach?.organisation_id, ...metric })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTestMetric(id: string, patch: Partial<TestMetric>): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("test_metrics").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteTestMetric(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("test_metrics").delete().eq("id", id);
  if (error) throw error;
}

// ── Benchmarks ────────────────────────────────────────────────────────────────

export async function listBenchmarksForMetric(metricId: string): Promise<TestBenchmark[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("test_benchmarks")
    .select("*")
    .eq("test_metric_id", metricId);
  if (error) throw error;
  return data ?? [];
}

export async function upsertBenchmark(benchmark: {
  id?: string; test_metric_id: string; benchmark_type: "elite_youth" | "general_population";
  sex: "male" | "female" | null; age_min: number | null; age_max: number | null;
  average_threshold: number; good_threshold: number; excellent_threshold: number;
}): Promise<void> {
  const supabase = createClient();
  if (benchmark.id) {
    const { error } = await supabase.from("test_benchmarks").update(benchmark).eq("id", benchmark.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("test_benchmarks").insert(benchmark);
    if (error) throw error;
  }
}

export async function deleteBenchmark(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("test_benchmarks").delete().eq("id", id);
  if (error) throw error;
}

// ── Test sessions + results ──────────────────────────────────────────────────

export async function listTestSessions(athleteId: string): Promise<TestSession[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("test_sessions")
    .select("*, results:test_results(*)")
    .eq("athlete_id", athleteId)
    .order("date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTestSession(params: {
  athleteId: string; testBatteryId: string | null; date: string;
  bodyweightKg: number | null; notes?: string;
}): Promise<TestSession> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("test_sessions")
    .insert({
      athlete_id: params.athleteId,
      test_battery_id: params.testBatteryId,
      date: params.date,
      bodyweight_kg: params.bodyweightKg,
      notes: params.notes ?? "",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTestSession(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("test_sessions").delete().eq("id", id);
  if (error) throw error;
}

// Bulk-save trial results for one metric within a session — replaces any
// existing trials for that metric+side combo so re-saving from the logging
// UI is idempotent rather than appending duplicates.
export async function saveTrials(params: {
  testSessionId: string; testMetricId: string; side: "left" | "right" | null;
  values: number[]; // one row per trial, in trial order
}): Promise<void> {
  const supabase = createClient();
  let del = supabase
    .from("test_results")
    .delete()
    .eq("test_session_id", params.testSessionId)
    .eq("test_metric_id", params.testMetricId);
  del = params.side ? del.eq("side", params.side) : del.is("side", null);
  const { error: delErr } = await del;
  if (delErr) throw delErr;

  const rows = params.values
    .map((value, i) => ({ value, trial_number: i + 1 }))
    .filter((r) => !isNaN(r.value) && r.value !== null);
  if (rows.length === 0) return;

  const { error } = await supabase.from("test_results").insert(
    rows.map((r) => ({
      test_session_id: params.testSessionId,
      test_metric_id: params.testMetricId,
      side: params.side,
      trial_number: r.trial_number,
      value: r.value,
    }))
  );
  if (error) throw error;
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

// Best trial from a set of results for one metric (+ optional side),
// using the metric's better_direction — not an average, matching the
// original tool's approach.
export function bestTrial(
  results: TestResult[],
  metric: TestMetric,
  side: "left" | "right" | null = null
): number | null {
  const matching = results.filter((r) => r.test_metric_id === metric.id && (r.side ?? null) === side);
  if (matching.length === 0) return null;
  const values = matching.map((r) => r.value);
  return metric.better_direction === "lower" ? Math.min(...values) : Math.max(...values);
}

export function ageInYears(dateOfBirth: string | null, onDate: string): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth + "T00:00:00Z");
  const on = new Date(onDate + "T00:00:00Z");
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

// Picks the most specific matching benchmark for an athlete: prefers a
// benchmark with a matching sex AND age band over a looser one, but falls
// back to "applies to everyone" benchmarks when athlete sex/DOB is missing.
export function matchBenchmark(
  benchmarks: TestBenchmark[],
  benchmarkType: "elite_youth" | "general_population",
  athleteSex: "male" | "female" | null,
  athleteAge: number | null
): TestBenchmark | null {
  const candidates = benchmarks.filter((b) => b.benchmark_type === benchmarkType);
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((b) => {
      let score = 0;
      let eligible = true;
      if (b.sex !== null) {
        if (athleteSex === null || b.sex !== athleteSex) eligible = false;
        else score += 2;
      }
      if (b.age_min !== null || b.age_max !== null) {
        if (athleteAge === null) eligible = false;
        else if ((b.age_min !== null && athleteAge < b.age_min) || (b.age_max !== null && athleteAge > b.age_max)) eligible = false;
        else score += 1;
      }
      return { b, score, eligible };
    })
    .filter((x) => x.eligible)
    .sort((a, c) => c.score - a.score);

  return scored[0]?.b ?? null;
}

// The real report always shows BOTH ratings side by side, never just one —
// a single scale either looks discouraging (elite-only) or meaninglessly
// easy (population-only) on its own. This is the standard lookup used by
// the report: returns both matched benchmarks (either may be null if no
// data exists for that age/sex combination).
export function matchBothBenchmarks(
  benchmarks: TestBenchmark[],
  athleteSex: "male" | "female" | null,
  athleteAge: number | null
): { elite: TestBenchmark | null; population: TestBenchmark | null } {
  return {
    elite: matchBenchmark(benchmarks, "elite_youth", athleteSex, athleteAge),
    population: matchBenchmark(benchmarks, "general_population", athleteSex, athleteAge),
  };
}

// 4-tier rating, matching the original tool exactly: a result worse than
// average_threshold is "needs_work" by elimination — there's no separate
// stored threshold for it. The same function and thresholds are used for
// both elite_youth and general_population benchmark rows; only the
// thresholds differ, never the comparison logic.
export function ragStatus(value: number, metric: TestMetric, benchmark: TestBenchmark): RagStatus {
  const { excellent_threshold, good_threshold, average_threshold } = benchmark;
  if (metric.better_direction === "lower") {
    if (value <= excellent_threshold) return "excellent";
    if (value <= good_threshold) return "good";
    if (value <= average_threshold) return "average";
    return "needs_work";
  }
  if (value >= excellent_threshold) return "excellent";
  if (value >= good_threshold) return "good";
  if (value >= average_threshold) return "average";
  return "needs_work";
}

// Same colour scale for both Elite and Population ratings — ported directly
// from the original tool's brand colours. There is no 5th "Exceptional"
// tier; it was tested and removed for causing parent confusion, and
// collapses into "excellent" (same colour) here too.
export const RAG_COLOR: Record<RagStatus, string> = {
  excellent:   "#2E9E5B",
  good:        "#57B87A",
  average:     "#FB8C00",
  needs_work:  "#E53935",
};

export const RAG_LABEL: Record<RagStatus, string> = {
  excellent: "Excellent", good: "Good", average: "Average", needs_work: "Needs Work",
};

// Single Leg CMJ-style left/right asymmetry index — a property of the PAIR
// of results, not either leg individually. <10% normal, 10-15% monitor,
// >15% clinical concern (Donskov et al. 2021).
export function asymmetryIndex(left: number, right: number): { pct: number; status: "normal" | "monitor" | "concern" } {
  const larger = Math.max(left, right);
  const smaller = Math.min(left, right);
  const pct = larger === 0 ? 0 : ((larger - smaller) / larger) * 100;
  const status = pct > 15 ? "concern" : pct > 10 ? "monitor" : "normal";
  return { pct, status };
}

// ── CSV export ────────────────────────────────────────────────────────────────

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function testResultsToCSV(
  sessions: TestSession[],
  metrics: TestMetric[],
  athleteName: string
): string {
  const metricById = new Map(metrics.map((m) => [m.id, m]));
  const rows: string[] = [
    ["Athlete", "Date", "Metric", "Unit", "Side", "Trial", "Value", "Bodyweight (kg)", "Notes"].join(","),
  ];

  for (const session of sessions) {
    for (const result of session.results ?? []) {
      const metric = metricById.get(result.test_metric_id);
      rows.push(
        [
          csvEscape(athleteName),
          csvEscape(session.date),
          csvEscape(metric?.name ?? result.test_metric_id),
          csvEscape(metric?.unit ?? ""),
          csvEscape(result.side ?? ""),
          csvEscape(result.trial_number),
          csvEscape(result.value),
          csvEscape(session.bodyweight_kg ?? ""),
          csvEscape(session.notes ?? ""),
        ].join(",")
      );
    }
  }
  return rows.join("\n");
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
