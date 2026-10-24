import type { ReportData } from "@/lib/data/reports";
import { exerciseInScope } from "@/lib/exercise-class";

// Coach-removed exercises on a training report (the red ✕ on each
// exercise - e.g. not relevant, injured, not a true representation).
// Takes them out of every per-exercise part of the report: PBs, strength
// progress, trends, highlights, progression and detail tables, adherence,
// power/speed, bar speed. Whole-report numbers (sessions, completion,
// tonnage headline) are left as logged.

type Named = { name: string };

const omitKeys = <T,>(map: Record<string, T> | undefined, hidden: Set<string>): Record<string, T> =>
  Object.fromEntries(Object.entries(map ?? {}).filter(([k]) => !hidden.has(k)));

const keep = <T extends Named>(list: T[] | undefined, hidden: Set<string>): T[] =>
  (list ?? []).filter((x) => !hidden.has(x.name));

// Same picks as computeReport / computeStrengthReport, re-run so the
// top 3 / review 3 refill from the remaining exercises.
function topAndReview<T extends { overallPct?: number | null }>(summaries: T[]) {
  const withTrend = summaries.filter((e) => e.overallPct != null);
  return {
    topProgressed: [...withTrend].sort((a, b) => (b.overallPct ?? 0) - (a.overallPct ?? 0)).slice(0, 3),
    toReview: [...withTrend].sort((a, b) => (a.overallPct ?? 0) - (b.overallPct ?? 0)).slice(0, 3),
  };
}

export function hideExercises(data: ReportData, hidden: Set<string>): ReportData {
  if (!hidden.size) return data;
  const exerciseSummaries = keep(data.exerciseSummaries, hidden);
  const strengthSummaries = keep(data.strength.exerciseSummaries, hidden);
  return {
    ...data,
    exMap: omitKeys(data.exMap, hidden),
    weeklyExMap: omitKeys(data.weeklyExMap, hidden),
    exerciseSummaries,
    ...topAndReview(exerciseSummaries),
    powerSpeedExMap: omitKeys(data.powerSpeedExMap, hidden),
    powerSpeedSummaries: keep(data.powerSpeedSummaries, hidden),
    velocityExMap: omitKeys(data.velocityExMap, hidden),
    velocitySummaries: keep(data.velocitySummaries, hidden),
    velocityOneRMExMap: omitKeys(data.velocityOneRMExMap, hidden),
    velocityOneRMSummaries: keep(data.velocityOneRMSummaries, hidden),
    oneRmReference: omitKeys(data.oneRmReference, hidden),
    strength: {
      ...data.strength,
      exMap: omitKeys(data.strength.exMap, hidden),
      weeklyExMap: omitKeys(data.strength.weeklyExMap, hidden),
      exerciseSummaries: strengthSummaries,
      ...topAndReview(strengthSummaries),
    },
    visual: data.visual && {
      ...data.visual,
      pbs: data.visual.pbs.filter((p) => !hidden.has(p.exercise)),
      adherence: data.visual.adherence.filter((a) => !hidden.has(a.exercise)),
    },
  };
}

// Strength exercises left out by the report's Compound lifts /
// Accessories options. Only strength exercise names (tonnage, e1RM, bar
// speed, strength PBs) - power/speed drills and cardio aren't compound
// or accessory, so e.g. the adherence list keeps its sprint rows.
export function outOfScopeExercises(data: ReportData, opts: { compounds?: boolean; accessories?: boolean }): Set<string> {
  const out = new Set<string>();
  if (opts.compounds !== false && opts.accessories !== false) return out;
  const names = [
    ...Object.keys(data.exMap ?? {}),
    ...Object.keys(data.strength?.exMap ?? {}),
    ...Object.keys(data.velocityExMap ?? {}),
    ...Object.keys(data.velocityOneRMExMap ?? {}),
    ...Object.keys(data.oneRmReference ?? {}),
    ...(data.visual?.pbs ?? []).map((p) => p.exercise), // weight / bodyweight PBs - all strength
  ];
  for (const n of names) if (!exerciseInScope(n, opts)) out.add(n);
  return out;
}
