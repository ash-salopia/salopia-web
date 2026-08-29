"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const SERIES_COLORS = ["#3987e5", "#eb6834", "#1baf7a", "#eda100", "#9085e9", "#d55181", "#38bdf8", "#f472b6"];

export interface TrendSeries {
  name: string;
  points: { date: string; value: number }[]; // date must be an ISO string (or otherwise lexicographically sortable) — formatted for display internally
}

// One chart, every exercise as its own line - replaces having a
// separate small line chart under each exercise, which made it hard
// to compare exercises against each other. Weekly-granularity input
// is expected (report-calc's weeklyExMap), since per-session dates
// don't align across exercises onto a shared x-axis.
export default function MultiTrendLineChart({
  series,
  unit,
  fmtDate,
  height = 320,
  yDomain,
  yTickFormatter,
  yAxisWidth = 44,
}: {
  series: TrendSeries[];
  unit: string;
  fmtDate: (iso: string) => string;
  height?: number;
  yDomain?: [number, number]; // fixes the axis range instead of auto-scaling to the data (e.g. RPE's fixed 1-10 scale)
  // Recharts' default tick formatting picks "nice" round numbers for
  // the axis, which for a small-magnitude series (e.g. bar speed,
  // 0.3-0.9 m/s) can round away exactly the precision that matters -
  // pass an explicit formatter for those cases rather than trusting
  // the default guess. Undefined keeps today's behaviour unchanged for
  // every other chart using this component.
  yTickFormatter?: (value: number) => string;
  // Default 44px is fine for a couple of digits + a short unit (kg,
  // reps); a longer/more precise label (e.g. "0.44m/s") needs more
  // room or it reads as cramped/unclear.
  yAxisWidth?: number;
}) {
  if (series.length === 0) return null;

  const dateSet = new Set<string>();
  series.forEach((s) => s.points.forEach((p) => dateSet.add(p.date)));
  const sortedDates = Array.from(dateSet).sort();
  if (sortedDates.length < 2) return null;

  const byDate = new Map<string, Record<string, number>>();
  series.forEach((s) => {
    s.points.forEach((p) => {
      if (!byDate.has(p.date)) byDate.set(p.date, {});
      byDate.get(p.date)![s.name] = p.value;
    });
  });
  const data = sortedDates.map((iso) => ({ date: fmtDate(iso), ...byDate.get(iso) }));

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--mute)" }} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--mute)" }}
            tickLine={false}
            axisLine={false}
            width={yAxisWidth}
            unit={unit}
            domain={yDomain ?? ["auto", "auto"]}
            tickFormatter={yTickFormatter}
          />
          <Tooltip
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--text)" }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s, i) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              name={s.name}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
