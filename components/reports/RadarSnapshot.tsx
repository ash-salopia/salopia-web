"use client";

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend, ResponsiveContainer } from "recharts";

export interface RadarExercise {
  name: string;
  baseline: number; // first-session value (Week 1)
  latest: number; // latest value
  entryCount: number; // number of data points logged — used to pick which exercises make the cut
}

// Metric-agnostic Week-1-vs-latest snapshot, shared by TTL and e1RM.
// Never plots raw values across exercises - a 1000kg squat total and
// a 70kg hold would flatten the shape entirely - so every exercise is
// normalised to % of its own baseline before plotting. This also
// means bodyweight-relative values produce an identical radar shape
// to raw kg (both are ratios of the same athlete's own numbers), so
// that option only affects the tables/line chart, not this component.
export default function RadarSnapshot({
  exercises,
  limit = 8,
  color = "var(--accent)",
}: {
  exercises: RadarExercise[];
  limit?: number;
  color?: string;
}) {
  const usable = exercises.filter((e) => e.baseline > 0);
  const capped = [...usable].sort((a, b) => b.entryCount - a.entryCount).slice(0, limit);
  if (capped.length < 3) return null; // fewer than 3 axes isn't a meaningful radar shape

  const data = capped.map((e) => ({
    name: e.name,
    baseline: 100,
    latest: Math.round((e.latest / e.baseline) * 100),
  }));

  // A radius axis starting at 0 flattens the shape when every value
  // clusters near 100% (typical, since these are % of each exercise's
  // own baseline) - zoom the domain tightly around the actual data
  // range instead (floored at 0), so real differences between
  // exercises stay legible instead of being squeezed into a sliver
  // near the outer ring.
  const values = data.flatMap((d) => [d.baseline, d.latest]);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const pad = Math.max(4, (maxV - minV) * 0.15);
  const domainMin = Math.max(0, Math.floor((minV - pad) / 5) * 5);
  const domainMax = Math.ceil((maxV + pad) / 5) * 5;

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid stroke="var(--line)" />
          <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--mute)" }} />
          <PolarRadiusAxis
            angle={90}
            domain={[domainMin, domainMax]}
            tick={{ fontSize: 9, fill: "var(--mute)" }}
          />
          <Radar
            name="Week 1 baseline"
            dataKey="baseline"
            stroke="#eb6834"
            fill="#eb6834"
            fillOpacity={0.08}
            isAnimationActive={false}
          />
          <Radar name="Latest (% of baseline)" dataKey="latest" stroke={color} fill={color} fillOpacity={0.25} isAnimationActive={false} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
