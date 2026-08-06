"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// Metric-agnostic per-exercise trend chart — plain {date,value} series
// so the same component renders both the TTL and e1RM "Line chart
// over time" report option, rather than one chart per metric.
export default function TrendLineChart({
  series,
  label,
  unit,
  color = "var(--accent)",
  height = 200,
}: {
  series: { date: string; value: number }[];
  label: string;
  unit: string;
  color?: string;
  height?: number;
}) {
  if (series.length < 2) return null;
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--mute)" }} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--mute)" }} tickLine={false} axisLine={false} width={44} unit={unit} />
          <Tooltip
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--text)" }}
            formatter={(v) => [`${v}${unit}`, label]}
          />
          <Line type="monotone" dataKey="value" name={label} stroke={color} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
