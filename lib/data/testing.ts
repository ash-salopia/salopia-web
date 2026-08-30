import { createClient } from "@/lib/supabase-browser";
import type {
  TestBattery, TestMetric, TestBenchmark, TestSession, TestResult, RagStatus, GroupTestSession,
} from "@/types";

async function myOrganisationId(): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: coach, error } = await supabase
    .from("coaches").select("organisation_id").eq("id", user?.id).single();
  if (error) throw error;
  return coach.organisation_id;
}

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

export async function updateTestSession(id: string, params: {
  testBatteryId: string | null; date: string;
  bodyweightKg: number | null; notes?: string;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("test_sessions")
    .update({
      test_battery_id: params.testBatteryId,
      date: params.date,
      bodyweight_kg: params.bodyweightKg,
      notes: params.notes ?? "",
    })
    .eq("id", id);
  if (error) throw error;
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

// Targeted bodyweight update — the general updateTestSession above also
// needs battery/date/notes, which the group grid doesn't have to hand.
export async function setTestSessionBodyweight(testSessionId: string, kg: number | null): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("test_sessions")
    .update({ bodyweight_kg: kg })
    .eq("id", testSessionId);
  if (error) throw error;
}

// ── Group test sessions (0080) ───────────────────────────────────────────────
// A thin named parent over per-athlete test_sessions. See the migration
// for why this doesn't touch test_results at all.

export interface GroupTestSessionSummary extends GroupTestSession {
  battery_name: string | null;
  athlete_count: number;
  filled_count: number; // # of (athlete, metric+side) cells with at least one trial
}

export async function listGroupTestSessions(): Promise<GroupTestSessionSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("group_test_sessions")
    .select("*, test_batteries(name), test_sessions(id, results:test_results(test_metric_id, side))")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((g: any) => {
    const sessions = g.test_sessions ?? [];
    let filled = 0;
    for (const s of sessions) {
      const seen = new Set<string>();
      for (const r of s.results ?? []) seen.add(`${r.test_metric_id}:${r.side ?? ""}`);
      filled += seen.size;
    }
    return {
      id: g.id,
      organisation_id: g.organisation_id,
      name: g.name,
      test_battery_id: g.test_battery_id,
      date: g.date,
      created_at: g.created_at,
      battery_name: g.test_batteries?.name ?? null,
      athlete_count: sessions.length,
      filled_count: filled,
    };
  });
}

export interface GroupTestAthlete {
  id: string;
  name: string;
  sex: "male" | "female" | null;
  date_of_birth: string | null;
  bodyweight_kg: number | null;
  group: string;
}

export interface GroupTestSessionDetail {
  groupSession: GroupTestSession;
  battery: TestBattery | null;
  sessions: TestSession[];   // one per athlete, with results
  athletes: GroupTestAthlete[];
}

export async function getGroupTestSession(id: string): Promise<GroupTestSessionDetail> {
  const supabase = createClient();

  const { data: g, error: gErr } = await supabase
    .from("group_test_sessions").select("*").eq("id", id).single();
  if (gErr) throw gErr;

  let battery: TestBattery | null = null;
  if (g.test_battery_id) {
    const { data: b } = await supabase
      .from("test_batteries")
      .select("*, test_battery_metrics(sort_order, test_metric_id, test_metrics(*))")
      .eq("id", g.test_battery_id)
      .maybeSingle();
    if (b) {
      battery = {
        ...b,
        metrics: (b.test_battery_metrics ?? [])
          .sort((a: any, c: any) => a.sort_order - c.sort_order)
          .map((bm: any) => bm.test_metrics)
          .filter(Boolean),
      } as TestBattery;
    }
  }

  const { data: sessions, error: sErr } = await supabase
    .from("test_sessions")
    .select("*, results:test_results(*), athletes(id, name, sex, date_of_birth, bodyweight_kg, \"group\")")
    .eq("group_test_session_id", id);
  if (sErr) throw sErr;

  const rows = (sessions ?? []) as any[];
  const athletes: GroupTestAthlete[] = rows
    .map((s) => s.athletes)
    .filter(Boolean)
    .map((a: any) => ({
      id: a.id, name: a.name, sex: a.sex, date_of_birth: a.date_of_birth,
      bodyweight_kg: a.bodyweight_kg, group: a.group ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const cleanSessions: TestSession[] = rows
    .map(({ athletes: _a, ...s }) => s as TestSession)
    .sort((a, b) => {
      const na = athletes.find((x) => x.id === a.athlete_id)?.name ?? "";
      const nb = athletes.find((x) => x.id === b.athlete_id)?.name ?? "";
      return na.localeCompare(nb);
    });

  return { groupSession: g as GroupTestSession, battery, sessions: cleanSessions, athletes };
}

// Inserts the wrapper + one test_sessions row per athlete (result-less
// is a valid state — same as a "Log Session" with nothing filled in).
export async function createGroupTestSession(params: {
  name: string;
  testBatteryId: string | null;
  date: string;
  athletes: { id: string; bodyweightKg: number | null }[];
}): Promise<string> {
  const supabase = createClient();
  const organisation_id = await myOrganisationId();

  const { data: g, error } = await supabase
    .from("group_test_sessions")
    .insert({ organisation_id, name: params.name, test_battery_id: params.testBatteryId, date: params.date })
    .select()
    .single();
  if (error) throw error;

  if (params.athletes.length) {
    const { error: sErr } = await supabase.from("test_sessions").insert(
      params.athletes.map((a) => ({
        athlete_id: a.id,
        test_battery_id: params.testBatteryId,
        date: params.date,
        bodyweight_kg: a.bodyweightKg,
        notes: "",
        group_test_session_id: g.id,
      }))
    );
    if (sErr) throw sErr;
  }
  return g.id;
}

export async function addAthletesToGroupTestSession(
  id: string,
  athletes: { id: string; bodyweightKg: number | null }[]
): Promise<void> {
  if (!athletes.length) return;
  const supabase = createClient();
  const { data: g, error: gErr } = await supabase
    .from("group_test_sessions").select("test_battery_id, date").eq("id", id).single();
  if (gErr) throw gErr;
  const { error } = await supabase.from("test_sessions").insert(
    athletes.map((a) => ({
      athlete_id: a.id,
      test_battery_id: g.test_battery_id,
      date: g.date,
      bodyweight_kg: a.bodyweightKg,
      notes: "",
      group_test_session_id: id,
    }))
  );
  if (error) throw error;
}

// Removes one athlete from the group session — deletes their
// test_sessions row (test_results cascade). Only ever called on a
// group-created session.
export async function removeGroupTestAthlete(testSessionId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("test_sessions").delete().eq("id", testSessionId);
  if (error) throw error;
}

export async function updateGroupTestSession(
  id: string,
  patch: { name?: string; date?: string }
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("group_test_sessions").update(patch).eq("id", id);
  if (error) throw error;
  // Keep the child sessions' date in step with the parent.
  if (patch.date) {
    const { error: sErr } = await supabase
      .from("test_sessions").update({ date: patch.date }).eq("group_test_session_id", id);
    if (sErr) throw sErr;
  }
}

// Deletes the wrapper only. Child test_sessions survive (FK is
// ON DELETE SET NULL) as ordinary individual sessions.
export async function deleteGroupTestSession(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("group_test_sessions").delete().eq("id", id);
  if (error) throw error;
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

// Best trial from a set of results for one metric (+ optional side),
// using the metric's better_direction — not an average, matching the
// original tool's approach.
// Report display grouping. test_metrics has no category column, so this
// is a display-only heuristic on the metric name -- the same approach
// TestReportModal already uses to split IMTP abs/relative. Falls back to
// "Other" (sorted last) for custom coach-created metrics that don't match
// any keyword, so nothing silently disappears from the report.
const METRIC_GROUP_ORDER = ["Jumps & RSI", "Sprint & Agility", "Strength", "Core", "Fitness & Conditioning", "Other"] as const;
export type MetricGroup = (typeof METRIC_GROUP_ORDER)[number];

export function metricGroup(name: string): MetricGroup {
  const key = name.toLowerCase();
  if (key.includes("jump") || key.includes("cmj") || key.includes("reactive strength") || key.includes("rsi")) return "Jumps & RSI";
  if (key.includes("sprint") || key.includes("agility") || key.includes("change of direction") || key.includes("505")) return "Sprint & Agility";
  if (key.includes("imtp") || key.includes("force") || key.includes("grip")) return "Strength";
  if (key.includes("plank") || key.includes("hold") || key.includes("core")) return "Core";
  if (
    key.includes("ftp") || key.includes("cooper") || key.includes("yo-yo") || key.includes("yoyo") ||
    key.includes("beep test") || key.includes("bleep test") || key.includes("vo2") || key.includes("vo₂") ||
    key.includes("aerobic") || key.includes("endurance") || key.includes("cardio") || key.includes("conditioning") ||
    key.includes("mile") || key.includes("time trial") || key.includes("timed run")
  ) return "Fitness & Conditioning";
  return "Other";
}

export function sortByMetricGroup<T>(items: T[], getName: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const groupDiff = METRIC_GROUP_ORDER.indexOf(metricGroup(getName(a))) - METRIC_GROUP_ORDER.indexOf(metricGroup(getName(b)));
    return groupDiff !== 0 ? groupDiff : getName(a).localeCompare(getName(b));
  });
}

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

// For the rated-metrics table: most metrics only ever have side=null
// trials, so this is equivalent to bestTrial(..., null) for them. The
// one exception is a metric that is both bilateral AND rated (currently
// only "505 Change of Direction") -- its trials are saved under
// side="left"/"right" (see the testing entry page), never null, so a
// side-agnostic lookup is required or its rated score is silently empty.
export function bestTrialAnySide(results: TestResult[], metric: TestMetric): number | null {
  const matching = results.filter((r) => r.test_metric_id === metric.id);
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

// ── Report view builder ──────────────────────────────────────────────────────
// The derivation behind a single athlete's Test Report — extracted from
// TestReportModal so the modal, the sequential viewer, the combined
// print page and the PDF all show identical numbers. `sessions` must be
// newest-first (same as listTestSessions returns).

export interface TestReportRatedRow {
  metric: TestMetric;
  latest: number;
  prev: number | null;
  elite: TestBenchmark | null;
  population: TestBenchmark | null;
  eliteRag: RagStatus | null;
  popRag: RagStatus | null;
}

export interface TestReportAsymRow {
  metric: TestMetric;
  left: number;
  right: number;
  pct: number;
  status: "normal" | "monitor" | "concern";
  prevAsym: { pct: number; status: "normal" | "monitor" | "concern" } | null;
}

// What a result's "Change" column is measured against. Defaults to the
// session immediately before the latest (the long-standing behaviour).
export type CompareBasis =
  | { kind: "previous" }
  | { kind: "best" }                        // best across ALL previous sessions, per better_direction
  | { kind: "first" }                       // earliest session — baseline
  | { kind: "session"; sessionId: string }; // one specific earlier session

// Which norm set(s) a Test Report rates against. Reports default to
// showing both side by side (the deliberate original-tool design — a
// single scale reads as either discouraging or meaninglessly easy on
// its own), but a coach can narrow to just one.
export type RatingScope = "both" | "elite" | "population";

export const RATING_SCOPE_LABEL: Record<RatingScope, string> = {
  both: "Elite + Population",
  elite: "Elite youth only",
  population: "General population only",
};

export interface TestReportView {
  athleteAge: number | null;
  latestSession: TestSession | null;
  hasBodyweight: boolean;
  visibleMetrics: TestMetric[];
  ratedRows: TestReportRatedRow[];
  asymmetryRows: TestReportAsymRow[];
  // null when there's nothing to compare against (< 2 sessions).
  // label — full prose ("vs previous test (12 Aug 2026)")
  // shortLabel — column header ("Prev" / "Best" / "First" / "12 Aug")
  compare: { label: string; shortLabel: string } | null;
  // Sessions before the latest, newest-first — for a "compare to a
  // specific date" picker.
  priorSessions: { id: string; date: string }[];
}

function fmtTestDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function buildTestReportView(
  athlete: { sex: "male" | "female" | null; date_of_birth: string | null },
  sessions: TestSession[],
  metrics: TestMetric[],
  benchmarksByMetric: Record<string, TestBenchmark[]>,
  compareTo: CompareBasis = { kind: "previous" }
): TestReportView {
  const latestSession = sessions[0] ?? null;
  const priors = sessions.slice(1); // everything before the latest, newest-first
  const athleteAge = latestSession ? ageInYears(athlete.date_of_birth, latestSession.date) : null;
  const hasBodyweight = latestSession?.bodyweight_kg != null;

  // The single comparison session (for "previous"/"first"/"session" and
  // for asymmetry deltas). "best" isn't a single session, so it's null.
  const compareSession: TestSession | null =
    compareTo.kind === "previous" ? priors[0] ?? null
    : compareTo.kind === "first" ? priors[priors.length - 1] ?? null
    : compareTo.kind === "session" ? priors.find((s) => s.id === compareTo.sessionId) ?? null
    : null;

  // Per-metric comparison value.
  const compareValue = (metric: TestMetric): number | null => {
    if (compareTo.kind === "best") {
      const vals = priors
        .map((s) => bestTrialAnySide(s.results ?? [], metric))
        .filter((v): v is number => v !== null);
      if (!vals.length) return null;
      return metric.better_direction === "lower" ? Math.min(...vals) : Math.max(...vals);
    }
    return compareSession ? bestTrialAnySide(compareSession.results ?? [], metric) : null;
  };

  const fmtShort = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  let compare: { label: string; shortLabel: string } | null = null;
  if (priors.length > 0) {
    compare =
      compareTo.kind === "best" ? { label: "vs best previous result", shortLabel: "Best" }
      : compareTo.kind === "first" ? { label: `vs first test${compareSession ? ` (${fmtTestDate(compareSession.date)})` : ""}`, shortLabel: "First" }
      : compareTo.kind === "session" ? { label: compareSession ? `vs ${fmtTestDate(compareSession.date)}` : "vs previous test", shortLabel: compareSession ? fmtShort(compareSession.date) : "Prev" }
      : { label: `vs previous test${compareSession ? ` (${fmtTestDate(compareSession.date)})` : ""}`, shortLabel: "Prev" };
  }

  // IMTP absolute (kg) vs relative (N/kg): show whichever the recorded
  // bodyweight makes meaningful, never both — same rule as the modal.
  const visibleMetrics = sortByMetricGroup(
    metrics.filter((m) => {
      const isImtpAbs = m.name.toLowerCase().includes("imtp") && m.unit === "kg";
      const isImtpRel = m.name.toLowerCase().includes("imtp") && m.unit === "N/kg";
      if (isImtpAbs && hasBodyweight) return false;
      if (isImtpRel && !hasBodyweight) return false;
      return true;
    }),
    (m) => m.name
  );

  const ratedRows: TestReportRatedRow[] = visibleMetrics
    .filter((m) => !m.screening_only)
    .map((metric) => {
      const latest = latestSession ? bestTrialAnySide(latestSession.results ?? [], metric) : null;
      if (latest === null) return null;
      const prev = compareValue(metric);
      const { elite, population } = matchBothBenchmarks(benchmarksByMetric[metric.id] ?? [], athlete.sex, athleteAge);
      return {
        metric, latest, prev, elite, population,
        eliteRag: elite ? ragStatus(latest, metric, elite) : null,
        popRag: population ? ragStatus(latest, metric, population) : null,
      };
    })
    .filter(Boolean) as TestReportRatedRow[];

  const asymmetryRows: TestReportAsymRow[] = visibleMetrics
    .filter((m) => m.screening_only)
    .map((metric) => {
      if (!latestSession) return null;
      const left = bestTrial(latestSession.results ?? [], metric, "left");
      const right = bestTrial(latestSession.results ?? [], metric, "right");
      if (left === null || right === null) return null;
      const { pct, status } = asymmetryIndex(left, right);
      // Asymmetry is a paired measure — "vs best" has no sensible meaning
      // here, so fall back to the immediately-previous session for it.
      const asymSession = compareSession ?? priors[0] ?? null;
      const prevLeft = asymSession ? bestTrial(asymSession.results ?? [], metric, "left") : null;
      const prevRight = asymSession ? bestTrial(asymSession.results ?? [], metric, "right") : null;
      const prevAsym = prevLeft !== null && prevRight !== null ? asymmetryIndex(prevLeft, prevRight) : null;
      return { metric, left, right, pct, status, prevAsym };
    })
    .filter(Boolean) as TestReportAsymRow[];

  const priorSessions = priors.map((s) => ({ id: s.id, date: s.date }));

  return { athleteAge, latestSession, hasBodyweight, visibleMetrics, ratedRows, asymmetryRows, compare, priorSessions };
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
