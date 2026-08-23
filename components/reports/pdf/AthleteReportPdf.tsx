// Standalone PDF version of components/ReportModal.tsx, for the bulk
// Reporting tab's "Generate reports (ZIP)" flow — each athlete's report
// gets rendered to a real vector PDF (via @react-pdf/renderer, pure JS,
// no headless-browser/Chromium dependency) so it can be zipped and opened
// outside the app.
//
// Deliberately NOT a 1:1 port:
//  - No live "All sessions / Weekly avg" toggle — a static document always
//    shows full per-session detail, since there's no interaction to toggle.
//  - Charts (sparkline/line/radar) are hand-drawn SVG via react-pdf's Svg
//    primitives rather than recharts (which needs a real DOM), so they're
//    simplified geometry, not pixel-identical to the in-app versions.
//  - Print-mode (light) palette throughout, matching ReportModal's
//    handlePrint colours, since this is always a light, printable document.
"use client";

import type { ReactNode } from "react";
import { Document, Page, View, Text, StyleSheet, Svg, Polyline, Polygon, Line as SvgLine, Circle } from "@react-pdf/renderer";
import type { ReportData } from "@/lib/data/reports";
import type { ReportOptions } from "@/lib/report-options";
import { FORMULAS } from "@/lib/one-rm";
import { LineChart, type LineSeries } from "@/components/reports/pdf/pdf-line-chart";
import BrandHeader from "@/components/reports/pdf/pdf-brand-header";
import { DEFAULT_BRANDING, type ResolvedBranding } from "@/types/branding";

// ── Palette (print-mode, matches ReportModal.handlePrint) ─────────────────────

const C = {
  ink: "#ffffff",
  panel: "#f7f8fa",
  line: "#d8dde3",
  text: "#16202a",
  mute: "#6b7684",
  accent: "#1f6fd6",
  accentDim: "#e7f0fb",
  good: "#1a8f57",
  bad: "#c23a3a",
  amber: "#c98a1f",
  blue: "#2f7fd1",
};

// ── Formatting helpers ─────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}
function fmtPct(pct: number | null): string {
  if (pct == null) return "-";
  return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
}
function pctColor(pct: number | null): string {
  if (pct == null) return C.mute;
  return pct >= 0 ? C.good : C.bad;
}
function rpeColor(rpe: number): string {
  if (rpe <= 4) return C.good;
  if (rpe <= 6) return C.blue;
  if (rpe <= 8) return C.amber;
  return C.bad;
}
const TYPE_LABEL: Record<string, string> = {
  strength: "Strength", hyrox: "Hyrox", cardio: "Cardio", power_speed: "Power/Speed", recovery: "Recovery",
};

// ── Chart geometry (pure math, no JSX) ─────────────────────────────────────

function sparklinePath(points: { x: string; y: number }[], width: number, height: number, pad = 2): string {
  const ys = points.map((p) => p.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const n = points.length;
  return points
    .map((p, i) => {
      const x = n > 1 ? pad + (i / (n - 1)) * (width - pad * 2) : width / 2;
      const y = pad + (1 - (p.y - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

interface RadarExercise {
  name: string;
  baseline: number;
  latest: number;
  entryCount: number;
}

function buildRadarGeometry(exercises: RadarExercise[], limit: number, size = 220) {
  const usable = exercises.filter((e) => e.baseline > 0);
  const capped = [...usable].sort((a, b) => b.entryCount - a.entryCount).slice(0, limit);
  if (capped.length < 3) return null;

  const data = capped.map((e) => ({ name: e.name, baseline: 100, latest: Math.round((e.latest / e.baseline) * 100) }));
  const values = data.flatMap((d) => [d.baseline, d.latest]);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const pad = Math.max(4, (maxV - minV) * 0.15);
  const domainMin = Math.max(0, Math.floor((minV - pad) / 5) * 5);
  const domainMax = Math.ceil((maxV + pad) / 5) * 5;

  const cx = size / 2;
  const cy = size / 2 - 4;
  const R = size / 2 - 34;
  const n = data.length;

  const radiusOf = (v: number) => Math.max(0, ((v - domainMin) / (domainMax - domainMin || 1)) * R);
  const pointAt = (i: number, r: number) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const baselinePts = data.map((_, i) => pointAt(i, radiusOf(100)));
  const latestPts = data.map((d, i) => pointAt(i, radiusOf(d.latest)));
  const labels = data.map((d, i) => {
    const p = pointAt(i, R + 14);
    return { x: p.x, y: p.y, name: d.name };
  });
  const spokes = data.map((_, i) => pointAt(i, R));

  return {
    size,
    cx,
    cy,
    R,
    baseline: baselinePts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
    latest: latestPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
    labels,
    spokes,
  };
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { padding: 32, fontFamily: "Helvetica", fontSize: 9, color: C.text, backgroundColor: "#ffffff" },
  athleteLine: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  metaLine: { fontSize: 8, color: C.mute, marginTop: 2 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 10, color: C.accent, letterSpacing: 0.6, marginTop: 16, marginBottom: 8 },
  metricSubheading: { fontFamily: "Helvetica-Bold", fontSize: 8, color: C.mute, letterSpacing: 0.4, marginBottom: 4, marginTop: 4 },
  bold: { fontFamily: "Helvetica-Bold" },
  aiBox: { backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent, borderRadius: 6, padding: 10, marginTop: 10 },
  aiLabel: { fontFamily: "Helvetica-Bold", fontSize: 8, color: C.accent, letterSpacing: 0.5, marginBottom: 4 },
  aiText: { fontSize: 9, lineHeight: 1.4, marginBottom: 3 },
  row: { flexDirection: "row" },
  tableHeadRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 3, marginBottom: 2 },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.mute, letterSpacing: 0.3 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 3, alignItems: "center" },
  td: { fontSize: 8 },
  exTitle: { fontFamily: "Helvetica-Bold", fontSize: 9.5, marginTop: 10, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 3 },
  tag: { fontSize: 6, fontFamily: "Helvetica-Bold", borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1, marginLeft: 4 },
  listRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: C.panel, borderRadius: 5, padding: 6, marginBottom: 4, fontSize: 8 },
  noteRow: { backgroundColor: C.panel, borderRadius: 5, padding: 6, marginBottom: 4 },
  noteMeta: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.mute, marginBottom: 2 },
  highlightsGrid: { flexDirection: "row", gap: 12 },
  highlightCol: { flex: 1 },
  highlightHeading: { fontSize: 8, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  highlightRow: { flexDirection: "row", justifyContent: "space-between", fontSize: 8, paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: C.line },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  legendSwatch: { width: 7, height: 7, borderRadius: 1 },
  legendText: { fontSize: 7, color: C.mute },
  overallLine: { fontSize: 7.5, fontFamily: "Helvetica-Bold", marginTop: 3 },
  emptyNote: { fontSize: 9, color: C.mute, fontStyle: "italic", marginTop: 10 },
});

// ── Small building blocks ──────────────────────────────────────────────────

function Tag({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <Text style={[s.tag, { color, backgroundColor: bg }]}>{label}</Text>
  );
}

function Table({
  headers,
  widths,
  rows,
}: {
  headers: string[];
  widths: number[];
  // A cell is either plain text, or (for a trailing sparkline column)
  // a pre-built <Sparkline>/null node — kept generic rather than a
  // separate table variant, since only the trailing column ever differs.
  rows: { cells: ({ text: string; color?: string; bold?: boolean } | { node: ReactNode })[] }[];
}) {
  return (
    <View>
      <View style={s.tableHeadRow}>
        {headers.map((h, i) => (
          <Text key={h} style={[s.th, { flex: widths[i] }]}>{h}</Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={s.tr} wrap={false}>
          {r.cells.map((c, ci) =>
            "node" in c ? (
              <View key={ci} style={{ flex: widths[ci] }}>{c.node}</View>
            ) : (
              <Text key={ci} style={[s.td, { flex: widths[ci], color: c.color ?? C.text, fontFamily: c.bold ? "Helvetica-Bold" : "Helvetica" }]}>
                {c.text}
              </Text>
            )
          )}
        </View>
      ))}
    </View>
  );
}

function Sparkline({ points, color }: { points: { x: string; y: number }[]; color: string }) {
  if (points.length < 2) return null;
  const w = 60, h = 16;
  return (
    <Svg width={w} height={h}>
      <Polyline points={sparklinePath(points, w, h)} fill="none" stroke={color} strokeWidth={1.2} />
    </Svg>
  );
}

function Radar({ exercises, limit }: { exercises: RadarExercise[]; limit: number }) {
  const geo = buildRadarGeometry(exercises, limit);
  if (!geo) return null;
  return (
    <View>
      <Svg width={geo.size + 60} height={geo.size}>
        <Circle cx={geo.cx} cy={geo.cy} r={geo.R} stroke={C.line} strokeWidth={0.5} fill="none" />
        {geo.spokes.map((p, i) => (
          <SvgLine key={i} x1={geo.cx} y1={geo.cy} x2={p.x} y2={p.y} stroke={C.line} strokeWidth={0.5} />
        ))}
        <Polygon points={geo.baseline} fill="#eb6834" fillOpacity={0.08} stroke="#eb6834" strokeWidth={1} />
        <Polygon points={geo.latest} fill={C.accent} fillOpacity={0.2} stroke={C.accent} strokeWidth={1.25} />
        {geo.labels.map((l, i) => (
          <Text
            key={i}
            x={Math.min(geo.size + 55, Math.max(0, l.x - 15))}
            y={l.y + 2.5}
            style={{ fontSize: 6, fill: C.mute }}
          >
            {l.name.length > 14 ? l.name.slice(0, 13) + "…" : l.name}
          </Text>
        ))}
      </Svg>
      <View style={s.legendRow}>
        <View style={s.legendItem}>
          <View style={[s.legendSwatch, { backgroundColor: "#eb6834" }]} />
          <Text style={s.legendText}>Week 1 baseline</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendSwatch, { backgroundColor: C.accent }]} />
          <Text style={s.legendText}>Latest (% of baseline)</Text>
        </View>
      </View>
    </View>
  );
}

function Highlight({ title, items }: { title: string; items: { name: string; overallPct: number | null }[] }) {
  return (
    <View style={s.highlightCol}>
      <Text style={s.highlightHeading}>{title}</Text>
      {items.length === 0 && <Text style={s.emptyNote}>Not enough data yet.</Text>}
      {items.map((e) => (
        <View key={e.name} style={s.highlightRow}>
          <Text>{e.name}</Text>
          <Text style={[s.bold, { color: pctColor(e.overallPct) }]}>{fmtPct(e.overallPct)}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Main document ────────────────────────────────────────────────────────

export default function AthleteReportPdf({
  data,
  athleteName,
  athleteGroup,
  options,
  aiSummary,
  branding = DEFAULT_BRANDING,
  exerciseSelection,
  powerSpeedSelection,
}: {
  data: ReportData;
  athleteName: string;
  athleteGroup?: string;
  options: ReportOptions;
  aiSummary?: { summary: string; themes: string } | null;
  branding?: ResolvedBranding;
  // Manual tick-list override for the TTL/e1RM line chart and the
  // Power/Speed trend section, same pattern as the Squad Report's
  // trendExerciseOverride - empty/omitted keeps the existing
  // auto-select (top by session count) / show-all behaviour.
  exerciseSelection?: string[];
  powerSpeedSelection?: string[];
}) {
  const {
    exMap, exerciseSummaries, weeklyExMap, topProgressed, toReview, notes,
    hyroxSessions, cardioSessions = [], powerSpeedSessions = [], powerSpeedSummaries = [], velocitySummaries = [], rpeEntries = [], rpeWeekly = [],
    generated, rangeStart, rangeEnd, strength, oneRmFormula, oneRmSource, bodyweightKg, oneRmReference,
  } = data;

  const hasStrength = Object.keys(exMap).length > 0;
  const hasE1rm = Object.keys(strength.exMap).length > 0;
  const hasHyrox = hyroxSessions.length > 0;
  const hasCardio = cardioSessions.length > 0;
  const hasPowerSpeed = powerSpeedSessions.length > 0;
  const hasRpe = rpeEntries.length > 0;
  const avgRpe = hasRpe ? Math.round((rpeEntries.reduce((sum, e) => sum + e.rpe, 0) / rpeEntries.length) * 10) / 10 : null;
  const formulaName = FORMULAS.find((f) => f.id === oneRmFormula)?.name ?? oneRmFormula;
  const bwUnit = options.bodyweightRelative && bodyweightKg ? "xBW" : "kg";
  const e1rmDisplay = (kg: number) => (options.bodyweightRelative && bodyweightKg ? (kg / bodyweightKg).toFixed(2) : kg.toFixed(1));
  const e1rmValue = (kg: number) => (options.bodyweightRelative && bodyweightKg ? kg / bodyweightKg : kg);

  const hasExerciseSelection = !!exerciseSelection?.length;
  const ttlLineSeries: LineSeries[] = (
    hasExerciseSelection
      ? exerciseSummaries.filter((e) => exerciseSelection!.includes(e.name))
      : [...exerciseSummaries].sort((a, b) => b.entries.length - a.entries.length).slice(0, options.exerciseLimit)
  ).map((e) => ({ name: e.name, points: (weeklyExMap[e.name] ?? []).map((w) => ({ date: w.weekStart, value: w.ttl })) }));
  const e1rmLineSeries: LineSeries[] = (
    hasExerciseSelection
      ? strength.exerciseSummaries.filter((e) => exerciseSelection!.includes(e.name))
      : [...strength.exerciseSummaries].sort((a, b) => b.entries.length - a.entries.length).slice(0, options.exerciseLimit)
  ).map((e) => ({ name: e.name, points: (strength.weeklyExMap[e.name] ?? []).map((w) => ({ date: w.weekStart, value: e1rmValue(w.e1rm) })) }));
  const rpeLineSeries: LineSeries[] = [{ name: "Avg RPE", points: rpeWeekly.map((w) => ({ date: w.weekStart, value: w.avgRpe })) }];

  const isEmpty = !hasStrength && !hasE1rm && !hasHyrox && !hasCardio && !hasPowerSpeed && !hasRpe && !notes.length;

  return (
    <Document title={`${athleteName} - Training Load Report`}>
      <Page size="A4" style={s.page} wrap>
        <View>
          <View style={s.brandRow}>
            <BrandHeader branding={branding} />
            <Text style={[s.athleteLine, { marginTop: 0 }]}>{athleteName}{athleteGroup ? ` · ${athleteGroup}` : ""}, Training Load Report</Text>
          </View>
          <Text style={s.metaLine}>Generated {generated}{rangeStart && rangeEnd ? ` · ${rangeStart} to ${rangeEnd}` : " · All time"}</Text>
          {options.e1rm && (
            <Text style={s.metaLine}>e1RM formula: {formulaName} · Mode: {oneRmSource === "fixed" ? "Fixed (vs reference max)" : "Rolling"}</Text>
          )}
        </View>

        {isEmpty && <Text style={s.emptyNote}>No logged data found in this range.</Text>}

        {options.aiSummary && aiSummary && (
          <View style={s.aiBox}>
            <Text style={s.aiLabel}>AI SUMMARY</Text>
            <Text style={s.aiText}>{aiSummary.summary}</Text>
            {aiSummary.themes && (
              <>
                <Text style={[s.aiLabel, { marginTop: 6 }]}>RECURRING THEMES FROM NOTES</Text>
                <Text style={[s.aiText, { marginBottom: 0 }]}>{aiSummary.themes}</Text>
              </>
            )}
          </View>
        )}

        {options.highlights && ((options.ttl && (topProgressed.length > 0 || toReview.length > 0)) || (options.e1rm && (strength.topProgressed.length > 0 || strength.toReview.length > 0))) && (
          <View>
            <Text style={s.sectionTitle}>HIGHLIGHTS</Text>
            {options.ttl && (topProgressed.length > 0 || toReview.length > 0) && (
              <View>
                {options.e1rm && <Text style={s.metricSubheading}>TOTAL TRAINING LOAD</Text>}
                <View style={s.highlightsGrid}>
                  <Highlight title="Top progressed" items={topProgressed} />
                  <Highlight title="Worth a review" items={toReview} />
                </View>
              </View>
            )}
            {options.e1rm && (strength.topProgressed.length > 0 || strength.toReview.length > 0) && (
              <View style={{ marginTop: options.ttl ? 8 : 0 }}>
                {options.ttl && <Text style={s.metricSubheading}>ESTIMATED 1RM</Text>}
                <View style={s.highlightsGrid}>
                  <Highlight title="Top progressed" items={strength.topProgressed} />
                  <Highlight title="Worth a review" items={strength.toReview} />
                </View>
              </View>
            )}
          </View>
        )}

        {options.radar && (
          <View wrap={false}>
            <Text style={s.sectionTitle}>RADAR SNAPSHOT</Text>
            {options.ttl && hasStrength && (
              <View style={{ marginBottom: options.e1rm ? 10 : 0 }}>
                {options.e1rm && <Text style={s.metricSubheading}>TOTAL TRAINING LOAD</Text>}
                <Radar
                  exercises={exerciseSummaries.map((e) => ({ name: e.name, baseline: e.entries[0].ttl, latest: e.entries[e.entries.length - 1].ttl, entryCount: e.entries.length }))}
                  limit={options.exerciseLimit}
                />
              </View>
            )}
            {options.e1rm && hasE1rm && (
              <View>
                {options.ttl && <Text style={s.metricSubheading}>ESTIMATED 1RM</Text>}
                <Radar
                  exercises={strength.exerciseSummaries.map((e) => ({ name: e.name, baseline: e.entries[0].e1rm, latest: e.entries[e.entries.length - 1].e1rm, entryCount: e.entries.length }))}
                  limit={options.exerciseLimit}
                />
              </View>
            )}
          </View>
        )}

        {options.lineChart && (
          <View wrap={false}>
            <Text style={s.sectionTitle}>TREND OVER TIME</Text>
            {options.ttl && hasStrength && ttlLineSeries.length > 0 && (
              <View style={{ marginBottom: options.e1rm ? 10 : 0 }}>
                {options.e1rm && <Text style={s.metricSubheading}>TOTAL TRAINING LOAD</Text>}
                <LineChart series={ttlLineSeries} unit="kg" />
              </View>
            )}
            {options.e1rm && hasE1rm && e1rmLineSeries.length > 0 && (
              <View>
                {options.ttl && <Text style={s.metricSubheading}>ESTIMATED 1RM</Text>}
                <LineChart series={e1rmLineSeries} unit={bwUnit} />
              </View>
            )}
          </View>
        )}

        {options.loadProgression && options.ttl && hasStrength && (
          <View>
            <Text style={s.sectionTitle}>LOAD PROGRESSION{options.e1rm ? " - TTL" : ""}</Text>
            <Table
              headers={["Exercise", "Sess.", "First", "Latest", "D kg", "% Chg", ...(options.sparkline ? ["Trend"] : [])]}
              widths={[3, 1, 1.3, 1.3, 1, 1, ...(options.sparkline ? [1.3] : [])]}
              rows={exerciseSummaries.map((e) => {
                const first = e.entries[0];
                const last = e.entries[e.entries.length - 1];
                const delta = last.ttl - first.ttl;
                return {
                  cells: [
                    { text: e.name },
                    { text: String(e.entries.length) },
                    { text: `${first.ttl.toFixed(0)} kg` },
                    { text: `${last.ttl.toFixed(0)} kg` },
                    { text: `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}`, color: pctColor(e.overallPct), bold: true },
                    { text: fmtPct(e.overallPct), color: pctColor(e.overallPct), bold: true },
                    ...(options.sparkline
                      ? [{ node: e.entries.length >= 2 ? <Sparkline points={e.entries.map((r) => ({ x: r.date, y: r.ttl }))} color={pctColor(e.overallPct)} /> : null }]
                      : []),
                  ],
                };
              })}
            />
          </View>
        )}

        {options.loadProgression && options.e1rm && hasE1rm && (
          <View>
            <Text style={s.sectionTitle}>LOAD PROGRESSION - e1RM</Text>
            <Table
              headers={["Exercise", "Sess.", `First (${bwUnit})`, `Latest (${bwUnit})`, `D (${bwUnit})`, "% Chg"]}
              widths={[3, 1, 1.5, 1.5, 1.2, 1]}
              rows={strength.exerciseSummaries.map((e) => {
                const first = e.entries[0];
                const last = e.entries[e.entries.length - 1];
                const delta = last.e1rm - first.e1rm;
                const ref = oneRmReference[e.name];
                return {
                  cells: [
                    { text: e.name + (ref?.source === "manual" ? " (manual)" : "") },
                    { text: String(e.entries.length) },
                    { text: e1rmDisplay(first.e1rm) },
                    { text: e1rmDisplay(last.e1rm) },
                    { text: `${delta >= 0 ? "+" : ""}${e1rmDisplay(delta)}`, color: pctColor(e.overallPct), bold: true },
                    { text: fmtPct(e.overallPct), color: pctColor(e.overallPct), bold: true },
                  ],
                };
              })}
            />
          </View>
        )}

        {options.ttl && hasStrength && (
          <View>
            <Text style={s.sectionTitle}>STRENGTH - TOTAL TRAINING LOAD</Text>
            {Object.entries(exMap).map(([exName, entries]) => {
              const first = entries[0];
              const last = entries[entries.length - 1];
              const overallPct = entries.length >= 2 && first.ttl > 0 ? ((last.ttl - first.ttl) / first.ttl) * 100 : null;
              return (
                <View key={exName} wrap={false}>
                  <Text style={s.exTitle}>{exName}{last.eachSide ? " (logged per hand, tonnage x2)" : ""}</Text>
                  <Table
                    headers={["Date", "Sets", "Reps", "Avg kg", "Max kg", "TTL", "vs Prev"]}
                    widths={[1.6, 0.8, 0.8, 1, 1, 1, 1]}
                    rows={entries.map((row, idx) => {
                      const prev = idx > 0 ? entries[idx - 1] : null;
                      const chg = prev && prev.ttl > 0 ? ((row.ttl - prev.ttl) / prev.ttl) * 100 : null;
                      return {
                        cells: [
                          { text: fmtDate(row.date) },
                          { text: String(row.sets) },
                          { text: String(row.reps) },
                          { text: row.avgWeight.toFixed(1) },
                          { text: row.maxWeight.toFixed(1) },
                          { text: row.ttl.toFixed(0), bold: true },
                          { text: fmtPct(chg), color: pctColor(chg), bold: true },
                        ],
                      };
                    })}
                  />
                  {overallPct != null && (
                    <Text style={[s.overallLine, { color: pctColor(overallPct) }]}>
                      Overall: {fmtPct(overallPct)} across {entries.length} sessions - Best: {last.sets}x{last.reps}@{last.maxWeight}kg - TTL {last.ttl.toFixed(0)} kg
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {options.e1rm && hasE1rm && (
          <View>
            <Text style={s.sectionTitle}>STRENGTH - ESTIMATED 1RM</Text>
            {Object.entries(strength.exMap).map(([exName, entries]) => {
              const first = entries[0];
              const last = entries[entries.length - 1];
              const overallPct = entries.length >= 2 && first.e1rm > 0 ? ((last.e1rm - first.e1rm) / first.e1rm) * 100 : null;
              const ref = oneRmReference[exName];
              return (
                <View key={exName} wrap={false}>
                  <Text style={s.exTitle}>
                    {exName}{last.eachSide ? " (logged per hand)" : ""}{ref?.source === "manual" ? " (manual)" : ""}
                  </Text>
                  <Table
                    headers={["Date", "Sets", "Best set", `e1RM (${bwUnit})`, "vs Prev"]}
                    widths={[1.6, 0.8, 1.4, 1.4, 1]}
                    rows={entries.map((row, idx) => {
                      const prev = idx > 0 ? entries[idx - 1] : null;
                      const chg = prev && prev.e1rm > 0 ? ((row.e1rm - prev.e1rm) / prev.e1rm) * 100 : null;
                      return {
                        cells: [
                          { text: fmtDate(row.date) },
                          { text: String(row.sets) },
                          { text: `${row.weight}kg x ${row.reps}` },
                          { text: e1rmDisplay(row.e1rm) + (row.lowConfidence ? " (low-conf)" : ""), bold: true },
                          { text: fmtPct(chg), color: pctColor(chg), bold: true },
                        ],
                      };
                    })}
                  />
                  {overallPct != null && (
                    <Text style={[s.overallLine, { color: pctColor(overallPct) }]}>
                      Overall: {fmtPct(overallPct)} across {entries.length} sessions - Best: {last.weight}kg x{last.reps} - e1RM {e1rmDisplay(last.e1rm)}{bwUnit === "kg" ? "kg" : ""}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {hasHyrox && (
          <View>
            <Text style={s.sectionTitle}>HYROX SESSIONS</Text>
            {hyroxSessions.map((sess) => (
              <View key={sess.id} style={s.listRow}><Text>{fmtDate(sess.date)}</Text><Text>{sess.name}</Text></View>
            ))}
          </View>
        )}

        {hasCardio && (
          <View>
            <Text style={s.sectionTitle}>CARDIO SESSIONS</Text>
            {cardioSessions.map((sess) => (
              <View key={sess.id} style={s.listRow}><Text>{fmtDate(sess.date)}</Text><Text>{sess.name}</Text></View>
            ))}
          </View>
        )}

        {hasPowerSpeed && (
          <View>
            <Text style={s.sectionTitle}>POWER / SPEED SESSIONS</Text>
            {powerSpeedSessions.map((sess) => (
              <View key={sess.id} style={s.listRow}><Text>{fmtDate(sess.date)}</Text><Text>{sess.name}</Text></View>
            ))}
          </View>
        )}

        {options.powerSpeedTrend && powerSpeedSummaries.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>POWER / SPEED TRENDS</Text>
            {(powerSpeedSelection?.length
              ? powerSpeedSummaries.filter((ex) => powerSpeedSelection.includes(ex.name))
              : powerSpeedSummaries
            ).map((ex) => (
              <View key={ex.name} style={{ marginBottom: 10 }}>
                <LineChart
                  series={[{ name: ex.name, points: ex.entries.map((e) => ({ date: e.date, value: e.value })) }]}
                  unit={ex.unit}
                  height={100}
                  showLegend={false}
                  title={`${ex.name}${ex.overallPct != null ? `  (${ex.overallPct >= 0 ? "+" : ""}${ex.overallPct.toFixed(1)}%)` : ""}`}
                  titleStyle={[s.bold, { fontSize: 8, marginBottom: 2 }]}
                />
              </View>
            ))}
          </View>
        )}

        {options.barSpeedTrend && velocitySummaries.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>BAR SPEED TRENDS</Text>
            {velocitySummaries.map((ex) => (
              <View key={ex.name} style={{ marginBottom: 10 }}>
                <LineChart
                  series={[{ name: ex.name, points: ex.entries.map((e) => ({ date: e.date, value: e.avgVelocity })) }]}
                  unit="m/s"
                  height={100}
                  showLegend={false}
                  title={`${ex.name}${ex.overallPct != null ? `  (${ex.overallPct >= 0 ? "+" : ""}${ex.overallPct.toFixed(1)}%)` : ""}`}
                  titleStyle={[s.bold, { fontSize: 8, marginBottom: 2 }]}
                />
              </View>
            ))}
          </View>
        )}

        {options.sessionRpe && (
          <View>
            <View style={[s.row, { justifyContent: "space-between", alignItems: "baseline" }]}>
              <Text style={s.sectionTitle}>SESSION RPE</Text>
              {avgRpe != null && <Text style={[s.bold, { fontSize: 8, color: rpeColor(avgRpe) }]}>Avg {avgRpe}/10</Text>}
            </View>
            {!hasRpe ? (
              <Text style={s.emptyNote}>No RPE logged in this range.</Text>
            ) : (
              <View>
                {rpeWeekly.length >= 2 && <LineChart series={rpeLineSeries} unit="" height={100} yDomain={[0, 10]} />}
                {rpeEntries.map((e, i) => (
                  <View key={i} style={s.listRow}>
                    <Text>{fmtDate(e.date)} · {e.sessName} ({TYPE_LABEL[e.type] ?? e.type})</Text>
                    <Text style={[s.bold, { color: rpeColor(e.rpe) }]}>{e.rpe}/10</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {options.athleteNotes && (
          <View>
            <Text style={s.sectionTitle}>ATHLETE NOTES</Text>
            {notes.length === 0 ? (
              <Text style={s.emptyNote}>No notes logged in this range.</Text>
            ) : (
              notes.map((n, i) => (
                <View key={i} style={s.noteRow}>
                  <Text style={s.noteMeta}>{fmtDate(n.date)} · {n.label}</Text>
                  <Text style={{ fontSize: 8 }}>{n.note}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </Page>
    </Document>
  );
}
