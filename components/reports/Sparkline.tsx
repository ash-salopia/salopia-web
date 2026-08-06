"use client";

import { LineChart, Line } from "recharts";

// Metric-agnostic mini-trend — used by both the TTL and e1RM report
// sections (report-builder's "Sparkline" toggle), so it takes plain
// {x,y} points rather than anything tonnage/e1RM-specific. Fixed
// pixel size rather than ResponsiveContainer since it lives inside a
// table cell, where a measured-parent container is unreliable.
export default function Sparkline({
  points,
  color = "var(--accent)",
  width = 90,
  height = 26,
}: {
  points: { x: string; y: number }[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;
  return (
    <LineChart width={width} height={height} data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
      <Line type="monotone" dataKey="y" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
    </LineChart>
  );
}
