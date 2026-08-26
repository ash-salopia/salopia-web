"use client";

// Shared group-picker + ranked-list view for one challenge's results -
// used by the coach Challenges page, the Live Group launch panel, and
// (read-only) the athlete Challenges page. Deliberately does no data
// fetching of its own (unlike e.g. MetricBoxes) - the coach surfaces can
// read groups/results directly via RLS, but the athlete surface can only
// reach them through a token-based API route, so this component just
// renders whatever `groups`/`results` it's handed and lets each caller
// fetch its own way.

import { useState } from "react";
import { rankChallengeResults, type ChallengeResultRow } from "@/lib/challenges";
import { METRIC_META, type MetricKey } from "@/lib/cardio-metrics";

export interface ChallengeLeaderboardGroup {
  id: string;
  name: string;
  members: { athleteId: string; athleteName: string }[];
}

export default function ChallengeLeaderboard({
  metricKey,
  direction,
  results,
  groups,
}: {
  metricKey: MetricKey;
  direction: "higher" | "lower";
  results: ChallengeResultRow[]; // already scoped to one challenge by the caller
  groups: ChallengeLeaderboardGroup[];
}) {
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id ?? "");
  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? groups[0] ?? null;

  if (!groups.length) {
    return <div style={s.empty}>No squads to show a leaderboard for yet.</div>;
  }

  const athleteNames = Object.fromEntries((selectedGroup?.members ?? []).map((m) => [m.athleteId, m.athleteName]));
  const memberIds = new Set((selectedGroup?.members ?? []).map((m) => m.athleteId));
  const filtered = results.filter((r) => memberIds.has(r.athlete_id));
  const ranked = rankChallengeResults(filtered, athleteNames, direction);
  const unit = METRIC_META[metricKey].unit;

  return (
    <div>
      {groups.length > 1 && (
        <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)} style={s.select}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      )}
      {ranked.length === 0 ? (
        <div style={s.empty}>No results logged yet for {selectedGroup?.name ?? "this squad"}.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: groups.length > 1 ? 8 : 0 }}>
          {ranked.map((r, i) => (
            <div key={r.athleteId} style={s.row}>
              <span style={s.rank}>{i + 1}</span>
              <span style={s.name}>
                {r.athleteName}
                {r.attempts > 1 && <span style={s.attempts}> · {r.attempts} attempts</span>}
              </span>
              <span style={s.value}>{r.value}{unit ? ` ${unit}` : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  select: {
    background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)",
    borderRadius: 8, padding: "7px 10px", fontSize: 13, width: "100%",
  },
  empty: { fontSize: 12, color: "var(--mute)", fontStyle: "italic", padding: "8px 2px" },
  row: {
    display: "flex", alignItems: "center", gap: 10,
    background: "var(--ink)", borderRadius: 8, padding: "8px 10px",
  },
  rank: { fontSize: 12, fontWeight: 700, color: "var(--mute)", width: 18, flexShrink: 0 },
  name: { flex: 1, fontSize: 13, color: "var(--text)", fontWeight: 600 },
  attempts: { fontSize: 11, color: "var(--mute)", fontWeight: 400 },
  value: { fontSize: 13, fontWeight: 700, color: "var(--accent)" },
};
