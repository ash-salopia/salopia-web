// Shared hand-drawn SVG line chart for react-pdf documents - extracted
// from AthleteReportPdf.tsx so SquadReportPdf's per-athlete exercise
// trend section can reuse the exact same geometry/rendering instead of
// duplicating it. Hand-drawn (not recharts) since recharts needs a
// real DOM, which react-pdf doesn't provide.
"use client";

import { Svg, View, Text, Polyline, Line as SvgLine, StyleSheet } from "@react-pdf/renderer";

// Line/mute greys are identical across every report PDF's light
// palette - hardcoded here rather than threaded through as props.
const LINE = "#d8dde3";
const MUTE = "#6b7684";

export const SERIES_COLORS = ["#3987e5", "#eb6834", "#1baf7a", "#c98a1f", "#7c6fd6", "#c2548a"];

export interface LineSeries {
  name: string;
  points: { date: string; value: number }[];
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

export function buildMultiLineGeometry(series: LineSeries[], width: number, height: number, yDomain?: [number, number]) {
  const dateSet = new Set<string>();
  series.forEach((s) => s.points.forEach((p) => dateSet.add(p.date)));
  const dates = Array.from(dateSet).sort();
  if (dates.length < 2) return null;

  const padL = 34;
  const padR = 8;
  const padT = 8;
  const padB = 20;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const allValues = yDomain ?? [
    Math.min(...series.flatMap((s) => s.points.map((p) => p.value))),
    Math.max(...series.flatMap((s) => s.points.map((p) => p.value))),
  ];
  const [yMin, yMax] = allValues[0] === allValues[1] ? [allValues[0] - 1, allValues[1] + 1] : allValues;

  const xAt = (date: string) => padL + (dates.indexOf(date) / (dates.length - 1)) * plotW;
  const yAt = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const lines = series.map((s, i) => ({
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    name: s.name,
    points: s.points.map((p) => `${xAt(p.date).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(" "),
  }));

  const yTicks = [yMin, (yMin + yMax) / 2, yMax].map((v) => ({ y: yAt(v), label: v.toFixed(v % 1 === 0 ? 0 : 1) }));
  const xTickIdxs = Array.from(new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1]));
  const xTicks = xTickIdxs.map((i) => ({ x: xAt(dates[i]), label: fmtDate(dates[i]) }));

  return { lines, yTicks, xTicks, padL, padT, plotW, plotH, width, height };
}

const s = StyleSheet.create({
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  legendSwatch: { width: 7, height: 7, borderRadius: 1 },
  legendText: { fontSize: 7, color: MUTE },
});

export function LineChart({
  series,
  unit,
  width = 500,
  height = 130,
  yDomain,
  showLegend = true,
  title,
  titleStyle,
}: {
  series: LineSeries[];
  unit: string;
  width?: number;
  height?: number;
  yDomain?: [number, number];
  showLegend?: boolean;
  title?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  titleStyle?: any;
}) {
  const geo = buildMultiLineGeometry(series, width, height, yDomain);
  if (!geo) return null;
  return (
    <View>
      {title && <Text style={titleStyle}>{title}</Text>}
      <Svg width={geo.width} height={geo.height}>
        {geo.yTicks.map((t, i) => (
          <SvgLine key={i} x1={geo.padL} y1={t.y} x2={geo.width - 8} y2={t.y} stroke={LINE} strokeWidth={0.5} strokeDasharray="2,2" />
        ))}
        <SvgLine x1={geo.padL} y1={geo.padT} x2={geo.padL} y2={geo.padT + geo.plotH} stroke={LINE} strokeWidth={0.75} />
        <SvgLine x1={geo.padL} y1={geo.padT + geo.plotH} x2={geo.width - 8} y2={geo.padT + geo.plotH} stroke={LINE} strokeWidth={0.75} />
        {geo.yTicks.map((t, i) => (
          <Text key={i} x={2} y={t.y + 2.5} style={{ fontSize: 6, fill: MUTE }}>{t.label}{unit}</Text>
        ))}
        {geo.xTicks.map((t, i) => (
          <Text key={i} x={Math.max(geo.padL, t.x - 12)} y={geo.height - 4} style={{ fontSize: 6, fill: MUTE }}>{t.label}</Text>
        ))}
        {geo.lines.map((l, i) => (
          <Polyline key={i} points={l.points} fill="none" stroke={l.color} strokeWidth={1.5} />
        ))}
      </Svg>
      {showLegend && (
        <View style={s.legendRow}>
          {geo.lines.map((l, i) => (
            <View key={i} style={s.legendItem}>
              <View style={[s.legendSwatch, { backgroundColor: l.color }]} />
              <Text style={s.legendText}>{l.name}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
