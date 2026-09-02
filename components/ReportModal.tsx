"use client";

import { useState } from "react";
import type { ReportData } from "@/lib/data/reports";
import type { ReportOptions } from "@/components/ReportRangeModal";
import { FORMULAS } from "@/lib/one-rm";
import Sparkline from "@/components/reports/Sparkline";
import { AiShimmer, Typewriter } from "@/components/AiText";
import MultiTrendLineChart from "@/components/reports/MultiTrendLineChart";
import { ACWR_BAND_LABEL, MONOTONY_HIGH } from "@/lib/training-load";
import { rtpMeta } from "@/lib/rtp";
import RadarSnapshot, { type RadarExercise } from "@/components/reports/RadarSnapshot";
import { METRIC_META } from "@/lib/cardio-metrics";
import { SESSION_TYPE_META } from "@/lib/report-options";
import type { SquadComparisonContext, SquadComparisonMetric } from "@/lib/squad-comparison";
import { DEFAULT_BRANDING, type ResolvedBranding } from "@/types/branding";
import { brandHeaderHtml, REPORT_CREDIT_TEXT } from "@/lib/report-branding";

function fmtDate(iso: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function fmtPct(pct: number | null): string {
  if (pct == null) return "-";
  return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
}

function pctColor(pct: number | null): string {
  if (pct == null) return "var(--mute)";
  return pct >= 0 ? "var(--good)" : "#ff7d7d";
}

const TYPE_LABEL: Record<string, string> = {
  strength: "Strength", hyrox: "Hybrid", cardio: "Cardio", power_speed: "Power/Speed", recovery: "Recovery",
};

const SQUAD_COMPARISON_LABEL: Record<SquadComparisonMetric, string> = {
  ttl: "Total Training Load", completion: "Session Completion", trainingLoad: "Training Load (sRPE)", sessionRpe: "Session RPE",
};

function fmtSquadValue(metric: SquadComparisonMetric, value: number): string {
  if (metric === "ttl") return `${Math.round(value).toLocaleString()} kg`;
  if (metric === "completion") return `${value.toFixed(0)}%`;
  if (metric === "sessionRpe") return `${value.toFixed(1)}/10`;
  return Math.round(value).toLocaleString();
}

// Low RPE (light session) reads as good/expected, not a warning - only
// climbs toward amber/red at the genuinely max-effort end of the scale.
function rpeColor(rpe: number): string {
  if (rpe <= 4) return "var(--good)";
  if (rpe <= 6) return "#74C0FC";
  if (rpe <= 8) return "#FFA94D";
  return "#ff7d7d";
}

// 0085 — small round "×" button used to dismiss a section/chart from
// this report view. Absolutely positioned over its parent, which must
// set position:"relative". Excluded from print/PDF for the same reason
// as GroupFilterRow below - no React state exists in the cloned print
// document to click, and it would just be inert clutter on the page.
function DismissBtn({ onClick, title = "Remove from this report" }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      data-no-print="true"
      onClick={onClick}
      title={title}
      style={{
        position: "absolute",
        top: -8,
        right: -8,
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: "#c2548a",
        color: "#fff",
        border: "2px solid var(--panel)",
        fontSize: 12,
        lineHeight: "14px",
        textAlign: "center",
        padding: 0,
        cursor: "pointer",
        zIndex: 5,
      }}
    >
      ×
    </button>
  );
}

// 0084 — group-level chart filter for the Cardio/Hyrox Metrics
// sections. Excluded from print (the cloned document has no React state
// to interact with) - whatever's already hidden here stays hidden since
// print clones the live DOM as-is.
function GroupFilterRow({
  allGroups,
  hidden,
  onChange,
}: {
  allGroups: string[];
  hidden: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  return (
    <div data-no-print="true" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
      {allGroups.map((g) => {
        const on = !hidden.has(g);
        return (
          <button
            key={g}
            type="button"
            onClick={() => {
              const next = new Set(hidden);
              if (on) next.add(g);
              else next.delete(g);
              onChange(next);
            }}
            style={{
              background: on ? "var(--accent-dim)" : "var(--ink)",
              border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`,
              color: on ? "var(--accent)" : "var(--mute)",
              borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}
          >
            {g}
          </button>
        );
      })}
    </div>
  );
}

export default function ReportModal({
  data,
  athleteName,
  athleteGroup,
  options,
  aiSummary,
  aiLoading,
  squadComparison,
  branding = DEFAULT_BRANDING,
  onClose,
}: {
  data: ReportData;
  athleteName: string;
  athleteGroup?: string;
  options: ReportOptions;
  aiSummary?: { summary: string; themes: string } | null;
  aiLoading?: boolean;
  squadComparison?: SquadComparisonContext[] | null;
  branding?: ResolvedBranding;
  onClose: () => void;
}) {
  const {
    exMap,
    exerciseSummaries,
    weeklyExMap,
    topProgressed,
    toReview,
    notes,
    hyroxSessions,
    cardioSessions = [],
    powerSpeedSessions = [],
    powerSpeedSummaries = [],
    velocitySummaries = [],
    velocityOneRMSummaries = [],
    cardioMetricSummaries = [],
    rpeEntries = [],
    rpeWeekly = [],
    trainingLoadEntries = [],
    trainingLoadWeekly = [],
    loadMonitoring,
    loadMonitoringSettings,
    athleteRtp,
    sessionTypeStats = {},
    generated,
    rangeStart,
    rangeEnd,
    strength,
    oneRmFormula,
    oneRmSource,
    bodyweightKg,
    oneRmReference,
  } = data;
  // Shared "all sessions / weekly avg" toggle for the per-exercise
  // detail tables - governs both TTL and e1RM sections when both are
  // present, rather than each metric having its own.
  const [detailMode, setDetailMode] = useState<"all" | "weekly">("all");

  // 0084 — which exercise/modality groups to actually chart in the
  // Cardio/Hyrox Metrics sections, live in the report view (not a
  // report option - the groups are only known once the data itself has
  // loaded, unlike the fixed metric-key list). All shown by default;
  // unticking one here hides every chart for that group across every
  // ticked metric, since a coach who doesn't care about "Sled Push"
  // doesn't want a Sled Push chart per metric either. Print clones this
  // view's live DOM, so whatever's hidden here stays hidden on paper.
  const [hiddenCardioGroups, setHiddenCardioGroups] = useState<Set<string>>(new Set());
  const [hiddenHyroxGroups, setHiddenHyroxGroups] = useState<Set<string>>(new Set());

  // 0085 — per-section/per-chart dismiss, live in this view only. Resets
  // every time the report is (re)generated (this is local component
  // state, not persisted anywhere) - lets a coach strip out sections
  // they don't want to show an athlete, or that turned out empty,
  // without it affecting what the next report generation includes.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const dismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));

  const hasStrength = Object.keys(exMap).length > 0;
  const hasE1rm = Object.keys(strength.exMap).length > 0;
  const hasHyrox = hyroxSessions.length > 0;
  const hasCardio = cardioSessions.length > 0;
  const hasPowerSpeed = powerSpeedSessions.length > 0;
  const hasRpe = rpeEntries.length > 0;
  const avgRpe = hasRpe
    ? Math.round((rpeEntries.reduce((sum, e) => sum + e.rpe, 0) / rpeEntries.length) * 10) / 10
    : null;
  const hasTrainingLoad = trainingLoadEntries.length > 0;
  const formulaName = FORMULAS.find((f) => f.id === oneRmFormula)?.name ?? oneRmFormula;
  const bwUnit = options.bodyweightRelative && bodyweightKg ? "×BW" : "kg";
  const e1rmDisplay = (kg: number) =>
    options.bodyweightRelative && bodyweightKg ? (kg / bodyweightKg).toFixed(2) : kg.toFixed(1);

  // Combined line-chart series (one line per exercise, all on one
  // chart) - weekly granularity, since per-session dates don't align
  // across exercises onto a shared x-axis. Capped to the same
  // exerciseLimit and same most-logged-first selection as the radar,
  // so both visuals show the same exercise subset.
  const ttlLineSeries = [...exerciseSummaries]
    .sort((a, b) => b.entries.length - a.entries.length)
    .slice(0, options.exerciseLimit)
    .map((e) => ({
      name: e.name,
      points: (weeklyExMap[e.name] ?? []).map((w) => ({ date: w.weekStart, value: w.ttl })),
    }));
  const e1rmValue = (kg: number) => (options.bodyweightRelative && bodyweightKg ? kg / bodyweightKg : kg);
  const e1rmLineSeries = [...strength.exerciseSummaries]
    .sort((a, b) => b.entries.length - a.entries.length)
    .slice(0, options.exerciseLimit)
    .map((e) => ({
      name: e.name,
      points: (strength.weeklyExMap[e.name] ?? []).map((w) => ({ date: w.weekStart, value: e1rmValue(w.e1rm) })),
    }));
  const rpeLineSeries = [
    { name: "Avg RPE", points: rpeWeekly.map((w) => ({ date: w.weekStart, value: w.avgRpe })) },
  ];
  const trainingLoadLineSeries = [
    { name: "Weekly training load", points: trainingLoadWeekly.map((w) => ({ date: w.weekStart, value: w.totalLoad })) },
  ];

  const handleCopy = () => {
    const el = document.getElementById("report-content");
    if (!el) return;
    const text = el.innerText || el.textContent || "";
    navigator.clipboard
      ?.writeText("VIS BUILD TRAINING REPORT\n\n" + text)
      .catch(() => {
        // Clipboard can fail (permissions, insecure context) - the
        // content is still visible on screen and printable either way.
      });
  };

  // window.print() on the modal itself printed incompletely - the
  // modal is position:fixed with maxHeight:100vh + overflowY:auto so
  // browsers clipped output to one screen's worth of content instead
  // of paginating the rest, and there was no print stylesheet to
  // reset that. Printing a separate, plain-flow document sidesteps
  // that entirely (natural pagination) and swaps the dark in-app
  // theme for a light one, since every section below is styled with
  // literal inline styles (which DO carry over via innerHTML) built
  // from CSS custom properties that wouldn't resolve in a blank
  // window without redefining them here.
  const handlePrint = () => {
    const el = document.getElementById("report-content");
    if (!el) return;
    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) return;

    // Strip live UI controls (the All sessions / Weekly avg toggle)
    // that don't mean anything on paper - the section title already
    // states which mode was active in plain text.
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-no-print="true"]').forEach((n) => n.remove());

    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(athleteName)} - Training Load Report</title>
<style>
  :root {
    --ink: #ffffff; --panel: #f7f8fa; --panel2: #eef0f3; --line: #d8dde3;
    --text: #16202a; --mute: #6b7684; --accent: #1f6fd6; --accent-dim: #e7f0fb;
    --good: #1a8f57; --good-dim: #e6f7ee;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px; background: #fff; color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
  }
  table { width: 100%; border-collapse: collapse; }
  tr { page-break-inside: avoid; }
  @page { margin: 16mm; }
</style>
</head>
<body>
  ${brandHeaderHtml(branding)}
  <div style="font-size:13px;font-weight:600;margin-top:4px;">${esc(athleteName)}${athleteGroup ? ` · ${esc(athleteGroup)}` : ""}, Training Load Report</div>
  <div style="font-size:11px;color:var(--mute);${options.e1rm ? "margin-bottom:2px;" : "margin-bottom:20px;"}">Generated ${esc(generated)}${rangeStart && rangeEnd ? ` · ${esc(rangeStart)} to ${esc(rangeEnd)}` : " · All time"}</div>
  ${options.e1rm ? `<div style="font-size:11px;color:var(--mute);margin-bottom:20px;">e1RM formula: ${esc(formulaName)} · Mode: ${esc(oneRmSource === "fixed" ? "Fixed (vs reference max)" : "Rolling")}</div>` : ""}
  ${clone.innerHTML}
</body>
</html>`);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.displayName} style={styles.brandLogo} />
            ) : (
              <div style={{ ...styles.brand, color: branding.primaryColor || "var(--accent)" }}>{branding.displayName}</div>
            )}
            <div style={styles.athleteLine}>
              {athleteName}
              {athleteGroup ? ` · ${athleteGroup}` : ""}, Training Load Report
            </div>
            <div style={styles.generatedLine}>
              Generated {generated}
              {rangeStart && rangeEnd ? ` · ${rangeStart} to ${rangeEnd}` : " · All time"}
            </div>
            {options.e1rm && (
              <div style={styles.generatedLine}>
                e1RM formula: {formulaName} · Mode: {oneRmSource === "fixed" ? "Fixed (vs reference max)" : "Rolling"}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button style={styles.ghostBtn} onClick={handlePrint}>
              🖨 Print
            </button>
            <button style={styles.primaryBtnSmall} onClick={handleCopy}>
              📋 Copy text
            </button>
            <button style={styles.closeBtn} onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div id="report-content" style={{ padding: 20 }}>
          {!hasStrength && !hasE1rm && !hasHyrox && !hasCardio && !hasPowerSpeed && !hasRpe && !notes.length && (
            <div style={styles.emptyNote}>
              No logged data found in this range. Log weights in strength sessions to generate a
              load report.
            </div>
          )}

          {options.aiSummary && !dismissed.has("ai-summary") && (
            <div style={{ ...styles.aiBox, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("ai-summary")} />
              <div style={styles.aiLabel}>✨ AI Summary</div>
              {aiLoading ? (
                <AiShimmer lines={3} />
              ) : aiSummary ? (
                <>
                  <p style={styles.aiText}><Typewriter text={aiSummary.summary} /></p>
                  {aiSummary.themes && (
                    <>
                      <div style={styles.aiSubLabel}>Recurring themes from notes</div>
                      <p style={{ ...styles.aiText, marginBottom: 0 }}>{aiSummary.themes}</p>
                    </>
                  )}
                </>
              ) : (
                <div style={styles.aiLoading}>Summary unavailable.</div>
              )}
            </div>
          )}

          {options.highlights &&
            !dismissed.has("highlights") &&
            ((options.ttl && (topProgressed.length > 0 || toReview.length > 0)) ||
              (options.e1rm && (strength.topProgressed.length > 0 || strength.toReview.length > 0))) && (
              <div style={{ marginBottom: 24, position: "relative" }}>
                <DismissBtn onClick={() => dismiss("highlights")} />
                <div style={styles.sectionTitle}>Highlights</div>
                {options.ttl && (topProgressed.length > 0 || toReview.length > 0) && (
                  <div style={{ marginBottom: options.e1rm ? 14 : 0 }}>
                    {options.e1rm && <div style={styles.metricSubheading}>Total Training Load</div>}
                    <div style={styles.highlightsGrid}>
                      <div>
                        <div style={styles.highlightHeading}>🚀 Top progressed</div>
                        {topProgressed.length === 0 && <div style={styles.highlightEmpty}>Not enough data yet.</div>}
                        {topProgressed.map((e) => (
                          <div key={e.name} style={styles.highlightRow}>
                            <span>{e.name}</span>
                            <span style={{ color: pctColor(e.overallPct), fontWeight: 700 }}>{fmtPct(e.overallPct)}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={styles.highlightHeading}>🔍 Worth a review</div>
                        {toReview.length === 0 && <div style={styles.highlightEmpty}>Not enough data yet.</div>}
                        {toReview.map((e) => (
                          <div key={e.name} style={styles.highlightRow}>
                            <span>{e.name}</span>
                            <span style={{ color: pctColor(e.overallPct), fontWeight: 700 }}>{fmtPct(e.overallPct)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {options.e1rm && (strength.topProgressed.length > 0 || strength.toReview.length > 0) && (
                  <div>
                    {options.ttl && <div style={styles.metricSubheading}>Estimated 1RM</div>}
                    <div style={styles.highlightsGrid}>
                      <div>
                        <div style={styles.highlightHeading}>🚀 Top progressed</div>
                        {strength.topProgressed.length === 0 && (
                          <div style={styles.highlightEmpty}>Not enough data yet.</div>
                        )}
                        {strength.topProgressed.map((e) => (
                          <div key={e.name} style={styles.highlightRow}>
                            <span>{e.name}</span>
                            <span style={{ color: pctColor(e.overallPct), fontWeight: 700 }}>{fmtPct(e.overallPct)}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={styles.highlightHeading}>🔍 Worth a review</div>
                        {strength.toReview.length === 0 && (
                          <div style={styles.highlightEmpty}>Not enough data yet.</div>
                        )}
                        {strength.toReview.map((e) => (
                          <div key={e.name} style={styles.highlightRow}>
                            <span>{e.name}</span>
                            <span style={{ color: pctColor(e.overallPct), fontWeight: 700 }}>{fmtPct(e.overallPct)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

          {options.sessionCompletion && !dismissed.has("sessions-completion") && (
            <div style={{ marginBottom: 24, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("sessions-completion")} />
              <div style={styles.sectionTitle}>Sessions Logged & Completion</div>
              <div style={styles.hyroxList}>
                {(["strength", "power_speed", "cardio", "hyrox"] as const)
                  .map((t) => sessionTypeStats[t])
                  .filter((stat) => stat && stat.loggedCount > 0)
                  .map((stat) => (
                    <div key={stat.type} style={styles.hyroxRow}>
                      <span>
                        {SESSION_TYPE_META[stat.type].label} · {stat.loggedCount} session{stat.loggedCount !== 1 ? "s" : ""} logged
                        {stat.prescribedCount > 0 && ` · ${stat.completedCount}/${stat.prescribedCount} assigned completed`}
                      </span>
                      {stat.completionPct != null && (
                        <span style={{ fontWeight: 700, color: stat.completionPct >= 70 ? "#1baf7a" : "#c2548a" }}>
                          {stat.completionPct}%
                        </span>
                      )}
                    </div>
                  ))}
                {(["strength", "power_speed", "cardio", "hyrox"] as const).every((t) => !sessionTypeStats[t] || sessionTypeStats[t].loggedCount === 0) && (
                  <div style={styles.highlightEmpty}>No sessions logged in this range.</div>
                )}
              </div>
            </div>
          )}

          {options.squadComparison && squadComparison && squadComparison.length > 0 && !dismissed.has("squad-comparison") && (
            <div style={{ marginBottom: 24, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("squad-comparison")} />
              <div style={styles.sectionTitle}>Squad Comparison</div>
              <div style={styles.hyroxList}>
                {squadComparison.map((c) => (
                  <div key={c.metric} style={styles.hyroxRow}>
                    <span>{SQUAD_COMPARISON_LABEL[c.metric]}</span>
                    <span>
                      <span style={{ fontWeight: 700 }}>{fmtSquadValue(c.metric, c.value)}</span>
                      <span style={{ color: "var(--mute)", marginLeft: 8 }}>
                        {c.rank != null ? `#${c.rank} of ${c.total} · ` : ""}
                        squad avg {fmtSquadValue(c.metric, c.squadAverage)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {options.radar && !dismissed.has("radar") && (
            <div style={{ marginBottom: 24, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("radar")} />
              <div style={styles.sectionTitle}>Radar Snapshot</div>
              {options.ttl && hasStrength && (
                <div style={{ marginBottom: options.e1rm ? 16 : 0 }}>
                  {options.e1rm && <div style={styles.metricSubheading}>Total Training Load</div>}
                  <RadarSnapshot
                    exercises={exerciseSummaries.map(
                      (e): RadarExercise => ({
                        name: e.name,
                        baseline: e.entries[0].ttl,
                        latest: e.entries[e.entries.length - 1].ttl,
                        entryCount: e.entries.length,
                      })
                    )}
                    limit={options.exerciseLimit}
                  />
                </div>
              )}
              {options.e1rm && hasE1rm && (
                <div>
                  {options.ttl && <div style={styles.metricSubheading}>Estimated 1RM</div>}
                  <RadarSnapshot
                    exercises={strength.exerciseSummaries.map(
                      (e): RadarExercise => ({
                        name: e.name,
                        baseline: e.entries[0].e1rm,
                        latest: e.entries[e.entries.length - 1].e1rm,
                        entryCount: e.entries.length,
                      })
                    )}
                    limit={options.exerciseLimit}
                  />
                </div>
              )}
            </div>
          )}

          {options.lineChart && !dismissed.has("line-chart") && (
            <div style={{ marginBottom: 24, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("line-chart")} />
              <div style={styles.sectionTitle}>Trend Over Time</div>
              {options.ttl && hasStrength && ttlLineSeries.length > 0 && (
                <div style={{ marginBottom: options.e1rm ? 16 : 0 }}>
                  {options.e1rm && <div style={styles.metricSubheading}>Total Training Load</div>}
                  <MultiTrendLineChart series={ttlLineSeries} unit="kg" fmtDate={fmtDate} />
                </div>
              )}
              {options.e1rm && hasE1rm && e1rmLineSeries.length > 0 && (
                <div>
                  {options.ttl && <div style={styles.metricSubheading}>Estimated 1RM</div>}
                  <MultiTrendLineChart series={e1rmLineSeries} unit={bwUnit} fmtDate={fmtDate} />
                </div>
              )}
            </div>
          )}

          {options.loadProgression && options.ttl && hasStrength && !dismissed.has("load-progression-ttl") && (
            <div style={{ marginBottom: 24, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("load-progression-ttl")} />
              <div style={styles.sectionTitle}>Load Progression{options.e1rm ? " - TTL" : ""}</div>
              <div style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.theadRow}>
                      {[
                        "Exercise",
                        "Sessions",
                        "First TTL",
                        "Latest TTL",
                        "Δ kg",
                        "% Change",
                        ...(options.sparkline ? ["Trend"] : []),
                      ].map((h) => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {exerciseSummaries.map((e) => {
                      const first = e.entries[0];
                      const last = e.entries[e.entries.length - 1];
                      const delta = last.ttl - first.ttl;
                      return (
                        <tr key={e.name} style={styles.tr}>
                          <td style={styles.td}>{e.name}</td>
                          <td style={styles.td}>{e.entries.length}</td>
                          <td style={styles.td}>{first.ttl.toFixed(0)} kg</td>
                          <td style={styles.td}>{last.ttl.toFixed(0)} kg</td>
                          <td style={{ ...styles.td, color: pctColor(e.overallPct), fontWeight: 600 }}>
                            {delta >= 0 ? "+" : ""}
                            {delta.toFixed(0)}
                          </td>
                          <td style={{ ...styles.td, color: pctColor(e.overallPct), fontWeight: 700 }}>
                            {fmtPct(e.overallPct)}
                          </td>
                          {options.sparkline && (
                            <td style={styles.td}>
                              {e.entries.length >= 2 && (
                                <Sparkline
                                  points={e.entries.map((r) => ({ x: r.date, y: r.ttl }))}
                                  color={pctColor(e.overallPct)}
                                />
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {options.loadProgression && options.e1rm && hasE1rm && !dismissed.has("load-progression-e1rm") && (
            <div style={{ marginBottom: 24, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("load-progression-e1rm")} />
              <div style={styles.sectionTitle}>Load Progression - e1RM</div>
              <div style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.theadRow}>
                      {[
                        "Exercise",
                        "Sessions",
                        `First (${bwUnit})`,
                        `Latest (${bwUnit})`,
                        `Δ (${bwUnit})`,
                        "% Change",
                        ...(options.sparkline ? ["Trend"] : []),
                      ].map((h) => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {strength.exerciseSummaries.map((e) => {
                      const first = e.entries[0];
                      const last = e.entries[e.entries.length - 1];
                      const ref = oneRmReference[e.name];
                      const delta = last.e1rm - first.e1rm;
                      return (
                        <tr key={e.name} style={styles.tr}>
                          <td style={styles.td}>
                            {e.name}
                            {ref?.source === "manual" && <span style={styles.manualTag}>manual</span>}
                          </td>
                          <td style={styles.td}>{e.entries.length}</td>
                          <td style={styles.td}>{e1rmDisplay(first.e1rm)}</td>
                          <td style={styles.td}>{e1rmDisplay(last.e1rm)}</td>
                          <td style={{ ...styles.td, color: pctColor(e.overallPct), fontWeight: 600 }}>
                            {delta >= 0 ? "+" : ""}
                            {e1rmDisplay(delta)}
                          </td>
                          <td style={{ ...styles.td, color: pctColor(e.overallPct), fontWeight: 700 }}>
                            {fmtPct(e.overallPct)}
                          </td>
                          {options.sparkline && (
                            <td style={styles.td}>
                              {e.entries.length >= 2 && (
                                <Sparkline
                                  points={e.entries.map((r) => ({ x: r.date, y: r.e1rm }))}
                                  color={pctColor(e.overallPct)}
                                />
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {options.ttl && hasStrength && !dismissed.has("ttl-detail") && (
            <div style={{ position: "relative" }}>
              <DismissBtn onClick={() => dismiss("ttl-detail")} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ ...styles.sectionTitle, marginBottom: 0 }}>
                  Strength - Total Training Load
                  <span style={{ fontSize: 11, color: "var(--mute)", textTransform: "none", letterSpacing: 0, marginLeft: 8 }}>
                    ({detailMode === "all" ? "all sessions" : "weekly avg"})
                  </span>
                </div>
                <div style={styles.modeToggle} data-no-print="true">
                  <button
                    style={{ ...styles.modeBtn, ...(detailMode === "all" ? styles.modeBtnActive : {}) }}
                    onClick={() => setDetailMode("all")}
                  >
                    All sessions
                  </button>
                  <button
                    style={{ ...styles.modeBtn, ...(detailMode === "weekly" ? styles.modeBtnActive : {}) }}
                    onClick={() => setDetailMode("weekly")}
                  >
                    Weekly avg
                  </button>
                </div>
              </div>
              {detailMode === "all"
                ? Object.entries(exMap).map(([exName, entries]) => {
                    const first = entries[0];
                    const last = entries[entries.length - 1];
                    const overallPct =
                      entries.length >= 2 && first.ttl > 0 ? ((last.ttl - first.ttl) / first.ttl) * 100 : null;
                    return (
                      <div key={exName} style={{ marginBottom: 22 }}>
                        <div style={styles.exTitle}>
                          {exName}
                          {last.eachSide && <span style={styles.eachSideTag}>(logged per hand, tonnage ×2)</span>}
                        </div>
                        <div style={{ overflowX: "auto" }}>
                          <table style={styles.table}>
                            <thead>
                              <tr style={styles.theadRow}>
                                {["Date", "Sets", "Reps", "Avg kg", "Max kg", "TTL (kg)", "vs Prev"].map((h) => (
                                  <th key={h} style={styles.th}>
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {entries.map((row, idx) => {
                                const prev = idx > 0 ? entries[idx - 1] : null;
                                const chg = prev && prev.ttl > 0 ? ((row.ttl - prev.ttl) / prev.ttl) * 100 : null;
                                return (
                                  <tr key={idx} style={styles.tr}>
                                    <td style={styles.td}>{fmtDate(row.date)}</td>
                                    <td style={styles.td}>{row.sets}</td>
                                    <td style={styles.td}>{row.reps}</td>
                                    <td style={styles.td}>{row.avgWeight.toFixed(1)}</td>
                                    <td style={styles.td}>{row.maxWeight.toFixed(1)}</td>
                                    <td style={{ ...styles.td, fontWeight: 700 }}>{row.ttl.toFixed(0)}</td>
                                    <td style={{ ...styles.td, color: pctColor(chg), fontWeight: 600 }}>
                                      {fmtPct(chg)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {overallPct != null && (
                          <div style={{ ...styles.overallLine, color: pctColor(overallPct) }}>
                            Overall: {fmtPct(overallPct)} across {entries.length} sessions · Best: {last.sets}×
                            {last.reps}@{last.maxWeight}kg · TTL {last.ttl.toFixed(0)} kg
                          </div>
                        )}
                      </div>
                    );
                  })
                : Object.entries(weeklyExMap).map(([exName, weeks]) => (
                    <div key={exName} style={{ marginBottom: 22 }}>
                      <div style={styles.exTitle}>{exName}</div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={styles.table}>
                          <thead>
                            <tr style={styles.theadRow}>
                              {["Week of", "Sessions", "Avg sets", "Avg TTL (kg)", "vs Prev week"].map((h) => (
                                <th key={h} style={styles.th}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {weeks.map((wk, idx) => {
                              const prev = idx > 0 ? weeks[idx - 1] : null;
                              const chg = prev && prev.ttl > 0 ? ((wk.ttl - prev.ttl) / prev.ttl) * 100 : null;
                              return (
                                <tr key={idx} style={styles.tr}>
                                  <td style={styles.td}>{fmtDate(wk.weekStart)}</td>
                                  <td style={styles.td}>{wk.sessionCount}</td>
                                  <td style={styles.td}>{wk.sets}</td>
                                  <td style={{ ...styles.td, fontWeight: 700 }}>{wk.ttl.toFixed(0)}</td>
                                  <td style={{ ...styles.td, color: pctColor(chg), fontWeight: 600 }}>{fmtPct(chg)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
            </div>
          )}

          {options.e1rm && hasE1rm && !dismissed.has("e1rm-detail") && (
            <div style={{ position: "relative" }}>
              <DismissBtn onClick={() => dismiss("e1rm-detail")} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, marginTop: options.ttl ? 24 : 0 }}>
                <div style={{ ...styles.sectionTitle, marginBottom: 0 }}>
                  Strength - Estimated 1RM
                  <span style={{ fontSize: 11, color: "var(--mute)", textTransform: "none", letterSpacing: 0, marginLeft: 8 }}>
                    ({detailMode === "all" ? "all sessions" : "weekly peak"})
                  </span>
                </div>
                <div style={styles.modeToggle} data-no-print="true">
                  <button
                    style={{ ...styles.modeBtn, ...(detailMode === "all" ? styles.modeBtnActive : {}) }}
                    onClick={() => setDetailMode("all")}
                  >
                    All sessions
                  </button>
                  <button
                    style={{ ...styles.modeBtn, ...(detailMode === "weekly" ? styles.modeBtnActive : {}) }}
                    onClick={() => setDetailMode("weekly")}
                  >
                    Weekly peak
                  </button>
                </div>
              </div>
              {detailMode === "all"
                ? Object.entries(strength.exMap).map(([exName, entries]) => {
                    const first = entries[0];
                    const last = entries[entries.length - 1];
                    const overallPct =
                      entries.length >= 2 && first.e1rm > 0 ? ((last.e1rm - first.e1rm) / first.e1rm) * 100 : null;
                    const ref = oneRmReference[exName];
                    return (
                      <div key={exName} style={{ marginBottom: 22 }}>
                        <div style={styles.exTitle}>
                          {exName}
                          {last.eachSide && <span style={styles.eachSideTag}>(logged per hand)</span>}
                          {ref?.source === "manual" && <span style={styles.manualTag}>manual</span>}
                        </div>
                        <div style={{ overflowX: "auto" }}>
                          <table style={styles.table}>
                            <thead>
                              <tr style={styles.theadRow}>
                                {["Date", "Sets", "Best set", `e1RM (${bwUnit})`, "vs Prev"].map((h) => (
                                  <th key={h} style={styles.th}>
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {entries.map((row, idx) => {
                                const prev = idx > 0 ? entries[idx - 1] : null;
                                const chg = prev && prev.e1rm > 0 ? ((row.e1rm - prev.e1rm) / prev.e1rm) * 100 : null;
                                return (
                                  <tr key={idx} style={styles.tr}>
                                    <td style={styles.td}>{fmtDate(row.date)}</td>
                                    <td style={styles.td}>{row.sets}</td>
                                    <td style={styles.td}>
                                      {row.weight}kg × {row.reps}
                                    </td>
                                    <td style={{ ...styles.td, fontWeight: 700 }}>
                                      {e1rmDisplay(row.e1rm)}
                                      {row.lowConfidence && <span style={styles.lowConfidenceTag}>low-confidence</span>}
                                    </td>
                                    <td style={{ ...styles.td, color: pctColor(chg), fontWeight: 600 }}>
                                      {fmtPct(chg)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {overallPct != null && (
                          <div style={{ ...styles.overallLine, color: pctColor(overallPct) }}>
                            Overall: {fmtPct(overallPct)} across {entries.length} sessions · Best: {last.weight}kg ×
                            {last.reps} · e1RM {e1rmDisplay(last.e1rm)}{bwUnit === "kg" ? "kg" : ""}
                          </div>
                        )}
                      </div>
                    );
                  })
                : Object.entries(strength.weeklyExMap).map(([exName, weeks]) => (
                    <div key={exName} style={{ marginBottom: 22 }}>
                      <div style={styles.exTitle}>{exName}</div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={styles.table}>
                          <thead>
                            <tr style={styles.theadRow}>
                              {["Week of", "Sessions", "Avg sets", `Peak e1RM (${bwUnit})`, "vs Prev week"].map((h) => (
                                <th key={h} style={styles.th}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {weeks.map((wk, idx) => {
                              const prev = idx > 0 ? weeks[idx - 1] : null;
                              const chg = prev && prev.e1rm > 0 ? ((wk.e1rm - prev.e1rm) / prev.e1rm) * 100 : null;
                              return (
                                <tr key={idx} style={styles.tr}>
                                  <td style={styles.td}>{fmtDate(wk.weekStart)}</td>
                                  <td style={styles.td}>{wk.sessionCount}</td>
                                  <td style={styles.td}>{wk.sets}</td>
                                  <td style={{ ...styles.td, fontWeight: 700 }}>{e1rmDisplay(wk.e1rm)}</td>
                                  <td style={{ ...styles.td, color: pctColor(chg), fontWeight: 600 }}>{fmtPct(chg)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
            </div>
          )}

          {options.hyroxSessionsList && hasHyrox && !dismissed.has("hyrox-sessions-list") && (
            <div style={{ position: "relative" }}>
              <DismissBtn onClick={() => dismiss("hyrox-sessions-list")} />
              <div style={{ ...styles.sectionTitle, marginTop: 24 }}>Hybrid Sessions</div>
              <div style={styles.hyroxList}>
                {hyroxSessions.map((s) => (
                  <div key={s.id} style={styles.hyroxRow}>
                    <span>{fmtDate(s.date)}</span>
                    <span>{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {options.cardioSessionsList && hasCardio && !dismissed.has("cardio-sessions-list") && (
            <div style={{ position: "relative" }}>
              <DismissBtn onClick={() => dismiss("cardio-sessions-list")} />
              <div style={{ ...styles.sectionTitle, marginTop: 24 }}>Cardio Sessions</div>
              <div style={styles.hyroxList}>
                {cardioSessions.map((s) => (
                  <div key={s.id} style={styles.hyroxRow}>
                    <span>{fmtDate(s.date)}</span>
                    <span>{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {options.cardioMetricsTrend && cardioMetricSummaries.some((m) => m.sessionType === "cardio" && options.cardioMetricKeys.includes(m.key) && m.entries.length >= 2) && (() => {
            // 0084/0085 — a summary row with a single data point has
            // nothing to draw a trend line from (MultiTrendLineChart
            // itself returns null below 2 points), so it was rendering
            // as an empty labelled box with no chart underneath it -
            // filtered out here instead of just at the chart component,
            // so the group-filter pills and this section's own
            // presence-check agree on what's actually showable.
            const rows = cardioMetricSummaries.filter((m) => m.sessionType === "cardio" && options.cardioMetricKeys.includes(m.key) && m.entries.length >= 2);
            const allGroups = [...new Set(rows.map((m) => m.group))];
            const visible = rows.filter((m) => !hiddenCardioGroups.has(m.group) && !dismissed.has(`cardio-metric:${m.key}:${m.group}`));
            if (!visible.length) return null;
            return (
              <div style={{ marginTop: 24 }}>
                <div style={styles.sectionTitle}>Cardio Metrics</div>
                {allGroups.length > 1 && (
                  <GroupFilterRow allGroups={allGroups} hidden={hiddenCardioGroups} onChange={setHiddenCardioGroups} />
                )}
                <div style={styles.metricGrid}>
                  {visible.map((m) => {
                    const meta = METRIC_META[m.key];
                    const id = `cardio-metric:${m.key}:${m.group}`;
                    return (
                      <div key={id} style={{ ...styles.metricGridCell, position: "relative" }}>
                        <DismissBtn onClick={() => dismiss(id)} />
                        <div style={styles.metricSubheading}>
                          {meta.label} — {m.group}
                          {m.overallPct != null && (
                            <span style={{ color: m.overallPct >= 0 ? "#1baf7a" : "#c2548a", marginLeft: 6 }}>
                              ({m.overallPct >= 0 ? "+" : ""}{m.overallPct.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                        <MultiTrendLineChart
                          series={[{ name: m.group, points: m.entries.map((e) => ({ date: e.date, value: e.value })) }]}
                          unit={meta.unit}
                          fmtDate={fmtDate}
                          height={120}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {options.hyroxMetricsTrend && cardioMetricSummaries.some((m) => m.sessionType === "hyrox" && options.hyroxMetricKeys.includes(m.key) && m.entries.length >= 2) && (() => {
            const rows = cardioMetricSummaries.filter((m) => m.sessionType === "hyrox" && options.hyroxMetricKeys.includes(m.key) && m.entries.length >= 2);
            const allGroups = [...new Set(rows.map((m) => m.group))];
            const visible = rows.filter((m) => !hiddenHyroxGroups.has(m.group) && !dismissed.has(`hyrox-metric:${m.key}:${m.group}`));
            if (!visible.length) return null;
            return (
              <div style={{ marginTop: 24 }}>
                <div style={styles.sectionTitle}>Hybrid Metrics</div>
                {allGroups.length > 1 && (
                  <GroupFilterRow allGroups={allGroups} hidden={hiddenHyroxGroups} onChange={setHiddenHyroxGroups} />
                )}
                <div style={styles.metricGrid}>
                  {visible.map((m) => {
                    const meta = METRIC_META[m.key];
                    const id = `hyrox-metric:${m.key}:${m.group}`;
                    return (
                      <div key={id} style={{ ...styles.metricGridCell, position: "relative" }}>
                        <DismissBtn onClick={() => dismiss(id)} />
                        <div style={styles.metricSubheading}>
                          {meta.label} — {m.group}
                          {m.overallPct != null && (
                            <span style={{ color: m.overallPct >= 0 ? "#1baf7a" : "#c2548a", marginLeft: 6 }}>
                              ({m.overallPct >= 0 ? "+" : ""}{m.overallPct.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                        <MultiTrendLineChart
                          series={[{ name: m.group, points: m.entries.map((e) => ({ date: e.date, value: e.value })) }]}
                          unit={meta.unit}
                          fmtDate={fmtDate}
                          height={120}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {options.powerSpeedTrend && hasPowerSpeed && !dismissed.has("powerspeed-sessions-list") && (
            <div style={{ position: "relative" }}>
              <DismissBtn onClick={() => dismiss("powerspeed-sessions-list")} />
              <div style={{ ...styles.sectionTitle, marginTop: 24 }}>Power / Speed Sessions</div>
              <div style={styles.hyroxList}>
                {powerSpeedSessions.map((s) => (
                  <div key={s.id} style={styles.hyroxRow}>
                    <span>{fmtDate(s.date)}</span>
                    <span>{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {options.powerSpeedTrend && powerSpeedSummaries.some((ex) => ex.entries.length >= 2) && !dismissed.has("powerspeed-trends") && (
            <div style={{ marginTop: 24, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("powerspeed-trends")} />
              <div style={styles.sectionTitle}>Power / Speed Trends</div>
              {/* single-entry summaries have nothing to chart - MultiTrendLineChart returns null below 2 points, leaving a label with no chart under it */}
              {powerSpeedSummaries.filter((ex) => ex.entries.length >= 2).map((ex) => (
                <div key={ex.name} style={{ marginBottom: 16 }}>
                  <div style={styles.metricSubheading}>
                    {ex.name}
                    {ex.overallPct != null && (
                      <span style={{ color: ex.overallPct >= 0 ? "#1baf7a" : "#c2548a", marginLeft: 6 }}>
                        ({ex.overallPct >= 0 ? "+" : ""}{ex.overallPct.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                  <MultiTrendLineChart
                    series={[{ name: ex.name, points: ex.entries.map((e) => ({ date: e.date, value: e.value })) }]}
                    unit={ex.unit}
                    fmtDate={fmtDate}
                    height={140}
                  />
                </div>
              ))}
            </div>
          )}

          {options.barSpeedTrend && velocitySummaries.some((ex) => ex.entries.length >= 2) && !dismissed.has("barspeed-trends") && (
            <div style={{ marginTop: 24, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("barspeed-trends")} />
              <div style={styles.sectionTitle}>Velocity Based Training</div>
              {velocitySummaries.filter((ex) => ex.entries.length >= 2).map((ex) => (
                <div key={ex.name} style={{ marginBottom: 16 }}>
                  <div style={styles.metricSubheading}>
                    {ex.name}
                    {ex.overallPct != null && (
                      <span style={{ color: ex.overallPct >= 0 ? "#1baf7a" : "#c2548a", marginLeft: 6 }}>
                        ({ex.overallPct >= 0 ? "+" : ""}{ex.overallPct.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                  <MultiTrendLineChart
                    series={[{ name: ex.name, points: ex.entries.map((e) => ({ date: e.date, value: e.avgVelocity })) }]}
                    unit="m/s"
                    fmtDate={fmtDate}
                    height={140}
                    yAxisWidth={56}
                    yTickFormatter={(v) => v.toFixed(2)}
                  />
                  {/* Only exercises with a saved velocity profile
                      (athlete profile page) get this - everything else
                      just shows the raw m/s trend above, unchanged. */}
                  {(() => {
                    const oneRm = velocityOneRMSummaries.find((r) => r.name === ex.name);
                    if (!oneRm || oneRm.entries.length < 2) return null;
                    return (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ ...styles.metricSubheading, fontSize: 12 }}>
                          Estimated 1RM (VBT)
                          {oneRm.overallPct != null && (
                            <span style={{ color: oneRm.overallPct >= 0 ? "#1baf7a" : "#c2548a", marginLeft: 6 }}>
                              ({oneRm.overallPct >= 0 ? "+" : ""}{oneRm.overallPct.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                        <MultiTrendLineChart
                          series={[{ name: `${ex.name} (VBT e1RM)`, points: oneRm.entries.map((e) => ({ date: e.date, value: e.estimatedOneRM })) }]}
                          unit="kg"
                          fmtDate={fmtDate}
                          height={140}
                        />
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}

          {options.sessionRpe && !dismissed.has("session-rpe") && (
            <div style={{ marginTop: 24, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("session-rpe")} />
              <div style={{ ...styles.sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span>Session RPE</span>
                {avgRpe != null && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: rpeColor(avgRpe) }}>
                    Avg {avgRpe}/10
                  </span>
                )}
              </div>
              {!hasRpe ? (
                <div style={styles.highlightEmpty}>No RPE logged in this range.</div>
              ) : (
                <>
                  {rpeWeekly.length >= 2 && (
                    <div style={{ marginBottom: 14 }}>
                      <MultiTrendLineChart series={rpeLineSeries} unit="" fmtDate={fmtDate} height={200} yDomain={[0, 10]} />
                    </div>
                  )}
                  {options.sessionRpeShowAll && (
                    <div style={styles.hyroxList}>
                      {rpeEntries.map((e, i) => (
                        <div key={i} style={styles.hyroxRow}>
                          <span>{fmtDate(e.date)} · {e.sessName} <span style={{ color: "var(--mute)" }}>({TYPE_LABEL[e.type] ?? e.type})</span></span>
                          <span style={{ fontWeight: 700, color: rpeColor(e.rpe) }}>{e.rpe}/10</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {options.trainingLoadTrend && !dismissed.has("training-load") && (
            <div style={{ marginTop: 24, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("training-load")} />
              <div style={styles.sectionTitle}>Training Load (sRPE)</div>
              {!hasTrainingLoad ? (
                <div style={styles.highlightEmpty}>
                  No training load to show — needs a session with both RPE logged and a clear duration (Fixed Workout and
                  Circuit/AMRAP rounds mode don't have one to estimate from).
                </div>
              ) : (
                <>
                  {trainingLoadWeekly.length >= 2 && (
                    <div style={{ marginBottom: 14 }}>
                      <MultiTrendLineChart series={trainingLoadLineSeries} unit="" fmtDate={fmtDate} height={200} />
                    </div>
                  )}
                  {options.trainingLoadShowAll && (
                    <div style={styles.hyroxList}>
                      {trainingLoadEntries.map((e, i) => (
                        <div key={i} style={styles.hyroxRow}>
                          <span>{fmtDate(e.date)} · {e.sessName}</span>
                          <span style={{ fontWeight: 700 }}>{e.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {options.loadMonitoring && loadMonitoring && loadMonitoringSettings && !dismissed.has("load-monitoring") && (
            <div style={{ marginTop: 24, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("load-monitoring")} />
              <div style={styles.sectionTitle}>Training Load &amp; Availability</div>

              {loadMonitoringSettings.rtp_status && athleteRtp && athleteRtp.status && athleteRtp.status !== "available" && (
                <div style={{ ...styles.highlightEmpty, borderLeft: `3px solid ${rtpMeta(athleteRtp.status).color}` }}>
                  <b>Availability:</b> {rtpMeta(athleteRtp.status).label}
                  {athleteRtp.since ? ` since ${fmtDate(athleteRtp.since)}` : ""}
                  {athleteRtp.note ? ` — ${athleteRtp.note}` : ""}
                </div>
              )}

              {loadMonitoringSettings.acwr && (() => {
                const pts = loadMonitoring.acwr.filter((p) => p.acwr != null).map((p) => ({ date: p.date, value: p.acwr as number }));
                const latest = loadMonitoring.latestAcwr;
                return (
                  <div style={{ marginTop: 12, marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mute)", marginBottom: 6 }}>
                      Acute:chronic workload ratio (7 days vs 28)
                      {latest?.acwr != null && (
                        <span style={{ marginLeft: 8, color: latest.band === "sweet" ? "#22C55E" : "#EF4444" }}>
                          latest {latest.acwr.toFixed(2)} — {latest.band ? ACWR_BAND_LABEL[latest.band] : ""}
                        </span>
                      )}
                    </div>
                    {pts.length >= 2 ? (
                      <MultiTrendLineChart series={[{ name: "ACWR", points: pts }]} unit="" fmtDate={fmtDate} height={200} yDomain={[0, 2]} />
                    ) : (
                      <div style={styles.highlightEmpty}>Not enough history yet — ACWR needs at least 3 weeks of logged load.</div>
                    )}
                  </div>
                );
              })()}

              {loadMonitoringSettings.load_spike_alert && loadMonitoring.spikes.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mute)", marginBottom: 6 }}>Weekly load vs 4-week average</div>
                  <div style={styles.hyroxList}>
                    {loadMonitoring.spikes.map((w, i) => (
                      <div key={i} style={styles.hyroxRow}>
                        <span>Week of {fmtDate(w.weekStart)}</span>
                        <span style={{ fontWeight: 700, color: w.flagged ? "#EF4444" : "var(--text)" }}>
                          {w.load}{w.changePct != null ? `  (${w.changePct > 0 ? "+" : ""}${w.changePct}%)` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {loadMonitoringSettings.monotony_strain && loadMonitoring.monotony.some((m) => m.monotony != null) && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mute)", marginBottom: 6 }}>Monotony &amp; strain (Foster)</div>
                  <div style={styles.hyroxList}>
                    {loadMonitoring.monotony.filter((m) => m.monotony != null).map((m, i) => (
                      <div key={i} style={styles.hyroxRow}>
                        <span>Week of {fmtDate(m.weekStart)}</span>
                        <span style={{ fontWeight: 700, color: (m.monotony ?? 0) > MONOTONY_HIGH ? "#EF4444" : "var(--text)" }}>
                          monotony {m.monotony?.toFixed(2)} · strain {m.strain}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {loadMonitoring.excludedNoDuration > 0 && (
                <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 8 }}>
                  {loadMonitoring.excludedNoDuration} session{loadMonitoring.excludedNoDuration === 1 ? "" : "s"} had an RPE but no duration and {loadMonitoring.excludedNoDuration === 1 ? "was" : "were"} left out of the load figures.
                </div>
              )}
            </div>
          )}

          {options.athleteNotes && !dismissed.has("athlete-notes") && (
            <div style={{ marginTop: 24, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("athlete-notes")} />
              <div style={styles.sectionTitle}>Athlete Notes</div>
              {notes.length === 0 ? (
                <div style={styles.highlightEmpty}>No notes logged in this range.</div>
              ) : (
                <div style={styles.hyroxList}>
                  {notes.map((n, i) => (
                    <div key={i} style={styles.noteRow}>
                      <div style={styles.noteMeta}>
                        {fmtDate(n.date)} · {n.label}
                      </div>
                      <div>{n.note}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={styles.credit}>
            <span style={styles.creditMark}>VIS BUILD</span>
            <span>{REPORT_CREDIT_TEXT}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(6,9,12,.75)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    zIndex: 60,
    paddingTop: 0,
  },
  modal: {
    background: "var(--panel)",
    width: "100%",
    maxWidth: 680,
    maxHeight: "100vh",
    overflowY: "auto",
    borderRadius: "0 0 16px 16px",
    boxShadow: "0 8px 40px rgba(0,0,0,.6)",
  },
  header: {
    background: "var(--ink)",
    padding: "18px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    position: "sticky",
    top: 0,
    zIndex: 2,
  },
  brand: {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 700,
    fontSize: 22,
    color: "var(--accent)",
    letterSpacing: 2,
  },
  brandLogo: { height: 34, maxWidth: 230, objectFit: "contain", display: "block" },
  credit: {
    marginTop: 28,
    paddingTop: 9,
    borderTop: "1px solid var(--line)",
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 9.5,
    color: "var(--mute)",
  },
  creditMark: {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 700,
    letterSpacing: "1.5px",
    color: "#1f6fd6",
  },
  athleteLine: { fontSize: 13, color: "var(--text)", fontWeight: 600 },
  generatedLine: { fontSize: 11, color: "var(--mute)" },
  ghostBtn: {
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    borderRadius: 8,
    padding: "7px 12px",
    fontSize: 12,
    cursor: "pointer",
  },
  primaryBtnSmall: {
    background: "var(--accent)",
    color: "#0a1420",
    border: "none",
    borderRadius: 8,
    padding: "7px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer" },
  emptyNote: { color: "var(--mute)", fontSize: 14, padding: "20px 0" },
  aiBox: {
    background: "var(--accent-dim)",
    border: "1px solid var(--accent)",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 24,
  },
  aiLabel: { fontSize: 12, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  aiSubLabel: { fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 10, marginBottom: 4 },
  aiText: { fontSize: 13, color: "var(--text)", lineHeight: 1.5, margin: "0 0 4px" },
  aiLoading: { fontSize: 13, color: "var(--mute)", fontStyle: "italic" },
  sectionTitle: {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: 18,
    fontWeight: 700,
    color: "var(--accent)",
    letterSpacing: 1,
    marginBottom: 14,
    textTransform: "uppercase",
  },
  highlightsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  highlightHeading: { fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 6 },
  highlightEmpty: { fontSize: 12, color: "var(--mute)", fontStyle: "italic" },
  highlightRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    fontSize: 13,
    padding: "6px 0",
    borderBottom: "1px solid var(--line)",
  },
  exTitle: {
    fontWeight: 700,
    fontSize: 15,
    marginBottom: 6,
    borderBottom: "1px solid var(--line)",
    paddingBottom: 4,
  },
  eachSideTag: { fontSize: 11, fontWeight: 600, color: "var(--mute)", marginLeft: 8 },
  metricSubheading: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--mute)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: 8,
  },
  // 0084 — compact grid for Cardio/Hyrox Metrics so a range with many
  // tracked exercises doesn't turn into one long column of full-width
  // charts. auto-fit/minmax keeps it responsive without a breakpoint.
  metricGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 },
  metricGridCell: { minWidth: 0 },
  // Amber for "manual" (a coach-entered value worth noting) and red
  // for "low-confidence" (a data-quality caution) - matches the
  // prototype's tag semantics (athletiq-strength-report-prototype.html).
  manualTag: {
    fontSize: 10,
    fontWeight: 700,
    color: "#c98a1f",
    background: "rgba(201,138,31,0.12)",
    border: "1px solid #c98a1f",
    borderRadius: 4,
    padding: "1px 6px",
    marginLeft: 8,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  lowConfidenceTag: {
    fontSize: 10,
    fontWeight: 700,
    color: "#ff7d7d",
    background: "rgba(255,125,125,0.12)",
    border: "1px solid #ff7d7d",
    borderRadius: 4,
    padding: "1px 6px",
    marginLeft: 8,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  theadRow: { color: "var(--mute)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 },
  th: { textAlign: "left", padding: "4px 8px 4px 0", fontWeight: 600, whiteSpace: "nowrap" },
  tr: { borderBottom: "1px solid var(--line)" },
  td: { padding: "6px 8px 6px 0" },
  overallLine: { fontSize: 12, fontWeight: 600, marginTop: 6 },
  hyroxList: { display: "flex", flexDirection: "column", gap: 6 },
  hyroxRow: {
    display: "flex",
    justifyContent: "space-between",
    background: "var(--ink)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 13,
    color: "var(--text)",
  },
  noteRow: {
    background: "var(--ink)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 13,
    color: "var(--text)",
  },
  noteMeta: { fontSize: 11, color: "var(--mute)", fontWeight: 600, marginBottom: 3 },
  modeToggle: { display: "flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", flexShrink: 0 },
  modeBtn: { background: "transparent", border: "none", color: "var(--mute)", padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" },
  modeBtnActive: { background: "var(--accent-dim)", color: "var(--accent)" },
};
