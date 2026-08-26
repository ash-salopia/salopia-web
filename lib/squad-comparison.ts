// Squad-comparison context for one athlete's individual Training Load
// Report - "where does this athlete sit relative to their own squad" on
// their own report, not a squad-wide leaderboard (see lib/squad-report.ts
// for that). Deliberately no Supabase imports (same convention as
// report-calc.ts/squad-report.ts) so this stays pure and reusable.
//
// Scoped to the four metrics that already have an unambiguous, single
// "squad standing" number in this app (see lib/squad-report.ts's own
// header comment on why e1RM/Cardio/Hyrox don't - different athletes'
// best lifts, or different equipment/protocols, aren't a real comparison
// without a coach picking one specific exercise). Training Load (sRPE)
// and Session RPE aren't achievement/adherence metrics the way TTL/
// Completion are, so they're reported as "you vs squad average" only -
// no rank, which would frame them as a competition they aren't.

import type { ReportData } from "@/lib/data/reports";
import { combinedCompletion } from "@/lib/squad-report";

export type SquadComparisonMetric = "ttl" | "completion" | "trainingLoad" | "sessionRpe";

export interface SquadComparisonContext {
  metric: SquadComparisonMetric;
  value: number;
  squadAverage: number;
  rank: number | null; // null for trainingLoad/sessionRpe - see file header
  total: number; // how many squad members had data for this metric
}

const RANKED_METRICS: SquadComparisonMetric[] = ["ttl", "completion"];

function extractValue(data: ReportData, metric: SquadComparisonMetric): number | null {
  switch (metric) {
    case "ttl": {
      const names = Object.keys(data.exMap);
      if (!names.length) return null;
      return names.reduce((sum, name) => sum + data.exMap[name].reduce((s, row) => s + row.ttl, 0), 0);
    }
    case "completion":
      return combinedCompletion(data).pct;
    case "trainingLoad":
      return data.trainingLoadEntries.length
        ? data.trainingLoadEntries.reduce((s, e) => s + e.value, 0)
        : null;
    case "sessionRpe":
      return data.rpeEntries.length
        ? data.rpeEntries.reduce((s, e) => s + e.rpe, 0) / data.rpeEntries.length
        : null;
  }
}

// `members` must include the target athlete themselves (their own value
// counts toward the squad average and their own rank).
export function computeSquadComparison(
  targetAthleteId: string,
  members: { athleteId: string; data: ReportData }[],
  metrics: SquadComparisonMetric[]
): SquadComparisonContext[] {
  const results: SquadComparisonContext[] = [];

  for (const metric of metrics) {
    const values = members
      .map((m) => ({ athleteId: m.athleteId, value: extractValue(m.data, metric) }))
      .filter((v): v is { athleteId: string; value: number } => v.value != null);

    const mine = values.find((v) => v.athleteId === targetAthleteId);
    if (!mine || !values.length) continue; // no data for me, or nobody in the squad - nothing to show

    const squadAverage = values.reduce((s, v) => s + v.value, 0) / values.length;

    let rank: number | null = null;
    if (RANKED_METRICS.includes(metric)) {
      const sorted = [...values].sort((a, b) => b.value - a.value); // all 4 metrics are higher-is-better
      rank = sorted.findIndex((v) => v.athleteId === targetAthleteId) + 1;
    }

    results.push({ metric, value: mine.value, squadAverage, rank, total: values.length });
  }

  return results;
}
