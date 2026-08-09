"use client";

import { useState } from "react";
import type { ReportData } from "@/lib/data/reports";
import type { ReportOptions } from "@/components/ReportRangeModal";
import { FORMULAS } from "@/lib/one-rm";
import Sparkline from "@/components/reports/Sparkline";
import MultiTrendLineChart from "@/components/reports/MultiTrendLineChart";
import RadarSnapshot, { type RadarExercise } from "@/components/reports/RadarSnapshot";

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

export default function ReportModal({
  data,
  athleteName,
  athleteGroup,
  options,
  aiSummary,
  aiLoading,
  onClose,
}: {
  data: ReportData;
  athleteName: string;
  athleteGroup?: string;
  options: ReportOptions;
  aiSummary?: { summary: string; themes: string } | null;
  aiLoading?: boolean;
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

  const hasStrength = Object.keys(exMap).length > 0;
  const hasE1rm = Object.keys(strength.exMap).length > 0;
  const hasHyrox = hyroxSessions.length > 0;
  const hasCardio = cardioSessions.length > 0;
  const hasPowerSpeed = powerSpeedSessions.length > 0;
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

  const handleCopy = () => {
    const el = document.getElementById("report-content");
    if (!el) return;
    const text = el.innerText || el.textContent || "";
    navigator.clipboard
      ?.writeText("AthletiQ TRAINING REPORT\n\n" + text)
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
  <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:22px;color:var(--accent);letter-spacing:2px;">AthletiQ</div>
  <div style="font-size:13px;font-weight:600;margin-top:2px;">${esc(athleteName)}${athleteGroup ? ` · ${esc(athleteGroup)}` : ""}, Training Load Report</div>
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
            <div style={styles.brand}>AthletiQ</div>
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
          {!hasStrength && !hasE1rm && !hasHyrox && !hasCardio && !hasPowerSpeed && !notes.length && (
            <div style={styles.emptyNote}>
              No logged data found in this range. Log weights in strength sessions to generate a
              load report.
            </div>
          )}

          {options.aiSummary && (
            <div style={styles.aiBox}>
              <div style={styles.aiLabel}>✨ AI Summary</div>
              {aiLoading ? (
                <div style={styles.aiLoading}>Generating summary…</div>
              ) : aiSummary ? (
                <>
                  <p style={styles.aiText}>{aiSummary.summary}</p>
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
            ((options.ttl && (topProgressed.length > 0 || toReview.length > 0)) ||
              (options.e1rm && (strength.topProgressed.length > 0 || strength.toReview.length > 0))) && (
              <div style={{ marginBottom: 24 }}>
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

          {options.radar && (
            <div style={{ marginBottom: 24 }}>
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

          {options.lineChart && (
            <div style={{ marginBottom: 24 }}>
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

          {options.loadProgression && options.ttl && hasStrength && (
            <div style={{ marginBottom: 24 }}>
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

          {options.loadProgression && options.e1rm && hasE1rm && (
            <div style={{ marginBottom: 24 }}>
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

          {options.ttl && hasStrength && (
            <>
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
            </>
          )}

          {options.e1rm && hasE1rm && (
            <>
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
            </>
          )}

          {hasHyrox && (
            <>
              <div style={{ ...styles.sectionTitle, marginTop: 24 }}>Hyrox Sessions</div>
              <div style={styles.hyroxList}>
                {hyroxSessions.map((s) => (
                  <div key={s.id} style={styles.hyroxRow}>
                    <span>{fmtDate(s.date)}</span>
                    <span>{s.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {hasCardio && (
            <>
              <div style={{ ...styles.sectionTitle, marginTop: 24 }}>Cardio Sessions</div>
              <div style={styles.hyroxList}>
                {cardioSessions.map((s) => (
                  <div key={s.id} style={styles.hyroxRow}>
                    <span>{fmtDate(s.date)}</span>
                    <span>{s.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {hasPowerSpeed && (
            <>
              <div style={{ ...styles.sectionTitle, marginTop: 24 }}>Power / Speed Sessions</div>
              <div style={styles.hyroxList}>
                {powerSpeedSessions.map((s) => (
                  <div key={s.id} style={styles.hyroxRow}>
                    <span>{fmtDate(s.date)}</span>
                    <span>{s.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {options.athleteNotes && (
            <div style={{ marginTop: 24 }}>
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
