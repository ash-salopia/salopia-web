// Pure ranking logic for the Challenges feature - deliberately no
// Supabase imports (same reasoning as report-calc.ts/squad-report.ts) so
// this can run both in coach browser-client code and in the athlete-link
// API routes (service-role, server-side) without pulling in a client
// that doesn't belong there.

export interface ChallengeResultRow {
  id: string;
  challenge_id: string;
  athlete_id: string;
  value: number;
  logged_by: "athlete" | "coach";
  logged_at: string;
}

export interface ChallengeRankRow {
  athleteId: string;
  athleteName: string;
  value: number; // this athlete's best result
  attempts: number;
}

// Ranks each athlete's BEST result for one challenge - same "best, not
// average" convention already used everywhere else in this app (PBs,
// Squad Report boards). Pass it only the results/athletes that should
// count (already filtered to one group's current members by the caller -
// this function has no concept of squads itself).
export function rankChallengeResults(
  results: ChallengeResultRow[],
  athleteNames: Record<string, string>,
  direction: "higher" | "lower"
): ChallengeRankRow[] {
  const bestByAthlete = new Map<string, { value: number; attempts: number }>();
  for (const r of results) {
    const existing = bestByAthlete.get(r.athlete_id);
    if (!existing) {
      bestByAthlete.set(r.athlete_id, { value: r.value, attempts: 1 });
      continue;
    }
    existing.attempts += 1;
    const better = direction === "higher" ? r.value > existing.value : r.value < existing.value;
    if (better) existing.value = r.value;
  }

  const rows: ChallengeRankRow[] = Array.from(bestByAthlete.entries()).map(([athleteId, best]) => ({
    athleteId,
    athleteName: athleteNames[athleteId] ?? "Athlete",
    value: best.value,
    attempts: best.attempts,
  }));

  rows.sort((a, b) => (direction === "higher" ? b.value - a.value : a.value - b.value));
  return rows;
}
