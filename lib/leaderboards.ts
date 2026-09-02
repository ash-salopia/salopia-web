// Community leaderboards — pure compute. Age-banded, sex-split rankings for
// coach-picked strength lifts (relative ÷BW and/or absolute kg) and testing
// metrics (best recorded value). No Supabase here — the data-fetch layers
// (lib/data/leaderboards.ts for the coach, the athlete-link route for the
// athlete app) hand this the rows it needs.

export interface AgeBand {
  label: string;
  min: number;
  max: number | null; // null = open-ended top band
}

// Youth bands mirror the org's testing benchmarks (any range topping out at
// 15 or below); 16–17 and 18+ are always added on top. Falls back to a
// standard youth set when the org has no benchmarks.
export function leaderboardAgeBands(
  benchmarkRanges: { age_min: number | null; age_max: number | null }[]
): AgeBand[] {
  const youth = new Map<string, AgeBand>();
  for (const r of benchmarkRanges) {
    if (r.age_min == null || r.age_max == null || r.age_max > 15) continue;
    youth.set(`${r.age_min}-${r.age_max}`, { label: "", min: r.age_min, max: r.age_max });
  }
  let bands = Array.from(youth.values()).sort((a, b) => a.min - b.min);
  if (bands.length === 0) {
    bands = [
      { label: "", min: 8, max: 9 }, { label: "", min: 10, max: 11 },
      { label: "", min: 12, max: 13 }, { label: "", min: 14, max: 15 },
    ];
  }
  return [
    ...bands.map((b) => ({ ...b, label: `${b.min}–${b.max}` })),
    { label: "16–17", min: 16, max: 17 },
    { label: "18+", min: 18, max: null },
  ];
}

export function bandForAge(age: number | null, bands: AgeBand[]): AgeBand | null {
  if (age == null) return null;
  return bands.find((b) => age >= b.min && (b.max == null || age <= b.max)) ?? null;
}

// Same as lib/data/testing.ts's ageInYears — duplicated here so this pure
// module (and the athlete-link route) doesn't import the client testing lib.
export function ageInYears(dateOfBirth: string | null, onDate: string): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth + "T00:00:00Z");
  const on = new Date(onDate + "T00:00:00Z");
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

// ── Inputs ────────────────────────────────────────────────────────────────────

export interface LbAthlete {
  id: string;
  name: string; // full name; firstNameOnly is applied here
  sex: "male" | "female" | null;
  age: number | null;
  bodyweightKg: number | null;
  hideFromFeed: boolean;
  firstNameOnly: boolean;
}

export interface LbStrengthPB {
  athleteId: string;
  exerciseName: string;
  weightKg: number | null;
}

export interface LbTestBest {
  athleteId: string;
  metricId: string;
  metricName: string;
  unit: string;
  lowerIsBetter: boolean;
  value: number;
}

export interface LbStrengthPick {
  name: string;
  relative: boolean;
  absolute: boolean;
}

// A group/squad the viewer can filter the boards to. `athleteIds` is the
// group's full membership; the view intersects it with each board's entries.
export interface LbSquad {
  id: string;
  name: string;
  athleteIds: string[];
}

export interface LbConfig {
  strengthExercises: LbStrengthPick[];
  // null = every eligible testing metric; an array = only those metric ids.
  testMetrics?: string[] | null;
}

// ── Output ────────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  athleteId: string;
  name: string;        // display name, honouring the athlete's first-name-only preference
  firstName: string;   // for compact table/cell display
  lastInitial: string | null; // surname initial, for disambiguating a shared first name (null if first-name-only)
  age: number | null;
  sex: "male" | "female";
  bandLabel: string;
  value: number;
  displayValue: string;
  rank: number;
}

export interface LeaderboardBoard {
  id: string;
  title: string;
  source: "strength" | "testing";
  mode: "relative" | "absolute" | "value";
  unit: string;
  lowerIsBetter: boolean;
  entries: LeaderboardEntry[];
}

// ── Compute ───────────────────────────────────────────────────────────────────

function nameBits(a: LbAthlete): { name: string; firstName: string; lastInitial: string | null } {
  const parts = a.name.trim().split(/\s+/);
  const first = parts[0] ?? a.name;
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return {
    name: a.firstNameOnly ? first : a.name,
    firstName: first,
    lastInitial: a.firstNameOnly || !last ? null : last[0].toUpperCase(),
  };
}

function fmt(n: number, unit: string): string {
  const abs = Math.abs(n);
  const dp = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${n.toFixed(dp)}${unit ? (unit.startsWith("×") || unit === "%" ? unit : ` ${unit}`) : ""}`;
}

// Rank a board's raw rows within each (sex, age band) group.
function rankGroups(
  rows: { athleteId: string; name: string; firstName: string; lastInitial: string | null; age: number | null; sex: "male" | "female"; bandLabel: string; value: number; displayValue: string }[],
  lowerIsBetter: boolean
): LeaderboardEntry[] {
  const byGroup = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.sex}:${r.bandLabel}`;
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k)!.push(r);
  }
  const out: LeaderboardEntry[] = [];
  for (const group of byGroup.values()) {
    group.sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value));
    group.forEach((r, i) => out.push({ ...r, rank: i + 1 }));
  }
  return out;
}

export function computeLeaderboards(
  athletes: LbAthlete[],
  strengthPBs: LbStrengthPB[],
  testBests: LbTestBest[],
  config: LbConfig,
  bands: AgeBand[]
): LeaderboardBoard[] {
  const byId = new Map(athletes.map((a) => [a.id, a]));
  const eligible = (a: LbAthlete | undefined): a is LbAthlete =>
    !!a && !a.hideFromFeed && (a.sex === "male" || a.sex === "female") && bandForAge(a.age, bands) != null;

  const boards: LeaderboardBoard[] = [];

  // Best PB weight per (athlete, exercise-name-lowercased)
  const bestPB = new Map<string, number>();
  for (const pb of strengthPBs) {
    if (pb.weightKg == null || pb.weightKg <= 0) continue;
    const k = `${pb.athleteId}::${pb.exerciseName.toLowerCase()}`;
    if (!bestPB.has(k) || pb.weightKg > bestPB.get(k)!) bestPB.set(k, pb.weightKg);
  }

  for (const pick of config.strengthExercises) {
    const exName = pick.name;
    const lower = exName.toLowerCase();
    const modes: ("relative" | "absolute")[] = [
      ...(pick.relative ? ["relative" as const] : []),
      ...(pick.absolute ? ["absolute" as const] : []),
    ];
    for (const mode of modes) {
      const rows = [];
      for (const a of athletes) {
        if (!eligible(a)) continue;
        const w = bestPB.get(`${a.id}::${lower}`);
        if (w == null) continue;
        if (mode === "relative" && (a.bodyweightKg == null || a.bodyweightKg <= 0)) continue;
        const value = mode === "relative" ? w / (a.bodyweightKg as number) : w;
        rows.push({
          athleteId: a.id, ...nameBits(a), age: a.age,
          sex: a.sex as "male" | "female", bandLabel: bandForAge(a.age, bands)!.label,
          value,
          displayValue: mode === "relative" ? `${value.toFixed(2)}×BW` : fmt(value, "kg"),
        });
      }
      if (rows.length === 0) continue;
      boards.push({
        id: `strength:${lower}:${mode}`,
        title: exName,
        source: "strength",
        mode,
        unit: mode === "relative" ? "×BW" : "kg",
        lowerIsBetter: false,
        entries: rankGroups(rows, false),
      });
    }
  }

  // Testing: best recorded value per (athlete, metric)
  const bestTest = new Map<string, LbTestBest>();
  for (const t of testBests) {
    const k = `${t.athleteId}::${t.metricId}`;
    const cur = bestTest.get(k);
    if (!cur || (t.lowerIsBetter ? t.value < cur.value : t.value > cur.value)) bestTest.set(k, t);
  }
  const metrics = new Map<string, { name: string; unit: string; lowerIsBetter: boolean }>();
  for (const t of testBests) metrics.set(t.metricId, { name: t.metricName, unit: t.unit, lowerIsBetter: t.lowerIsBetter });

  const metricAllow = config.testMetrics ? new Set(config.testMetrics) : null;
  for (const [metricId, meta] of metrics) {
    if (metricAllow && !metricAllow.has(metricId)) continue;
    const rows = [];
    for (const a of athletes) {
      if (!eligible(a)) continue;
      const best = bestTest.get(`${a.id}::${metricId}`);
      if (!best) continue;
      rows.push({
        athleteId: a.id, ...nameBits(a), age: a.age,
        sex: a.sex as "male" | "female", bandLabel: bandForAge(a.age, bands)!.label,
        value: best.value,
        displayValue: fmt(best.value, meta.unit),
      });
    }
    if (rows.length === 0) continue;
    boards.push({
      id: `testing:${metricId}`,
      title: meta.name,
      source: "testing",
      mode: "value",
      unit: meta.unit,
      lowerIsBetter: meta.lowerIsBetter,
      entries: rankGroups(rows, meta.lowerIsBetter),
    });
  }

  return boards.sort((a, b) => a.source.localeCompare(b.source) || a.title.localeCompare(b.title) || a.mode.localeCompare(b.mode));
}

// ── Data assembly (client-agnostic) ──────────────────────────────────────────
// Runs the four reads and hands the rows to computeLeaderboards. `supabase`
// is any Supabase client (browser or service-role) — this module stays free
// of client/server imports so the athlete-link route can use it too.

// Any Supabase client — typed loosely so this module has no client/server
// import (the athlete-link route uses it with a service-role client).
type QueryClient = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

// opts scope the reads for the service-role (RLS-less) caller. The coach
// client omits them — its RLS already limits every read to the org.
export async function buildLeaderboards(
  supabase: QueryClient,
  config: LbConfig,
  athletes: LbAthlete[],
  opts: { athleteIds?: string[]; metricIds?: string[] } = {}
): Promise<{ boards: LeaderboardBoard[]; bands: AgeBand[] }> {
  let pbQ = supabase.from("personal_bests").select("athlete_id, exercise_name, weight_kg").not("weight_kg", "is", null);
  let sessQ = supabase.from("test_sessions").select("id, athlete_id");
  let resultQ = supabase.from("test_results").select("value, side, test_metric_id, test_session_id, test_metrics(name, unit, better_direction, is_bilateral)");
  let benchQ = supabase.from("test_benchmarks").select("age_min, age_max");
  if (opts.athleteIds) { pbQ = pbQ.in("athlete_id", opts.athleteIds); sessQ = sessQ.in("athlete_id", opts.athleteIds); }
  if (opts.metricIds) { resultQ = resultQ.in("test_metric_id", opts.metricIds); benchQ = benchQ.in("test_metric_id", opts.metricIds); }
  const [pbRes, sessRes, resultRes, benchRes] = await Promise.all([pbQ, sessQ, resultQ, benchQ]);

  const bands = leaderboardAgeBands((benchRes.data ?? []) as { age_min: number | null; age_max: number | null }[]);

  const strengthPBs: LbStrengthPB[] = ((pbRes.data ?? []) as Record<string, unknown>[]).map((p) => ({
    athleteId: p.athlete_id as string,
    exerciseName: p.exercise_name as string,
    weightKg: p.weight_kg as number | null,
  }));

  const sessById = new Map<string, string>(
    ((sessRes.data ?? []) as Record<string, unknown>[]).map((s) => [s.id as string, s.athlete_id as string])
  );
  const testBests: LbTestBest[] = [];
  for (const r of (resultRes.data ?? []) as Record<string, unknown>[]) {
    const m = (Array.isArray(r.test_metrics) ? r.test_metrics[0] : r.test_metrics) as
      | { name: string; unit: string | null; better_direction: string; is_bilateral: boolean }
      | undefined;
    if (!m || m.is_bilateral || r.side != null) continue;
    const athleteId = sessById.get(r.test_session_id as string);
    if (!athleteId) continue;
    testBests.push({
      athleteId,
      metricId: r.test_metric_id as string,
      metricName: m.name,
      unit: m.unit ?? "",
      lowerIsBetter: m.better_direction === "lower",
      value: Number(r.value),
    });
  }

  return { boards: computeLeaderboards(athletes, strengthPBs, testBests, config, bands), bands };
}
