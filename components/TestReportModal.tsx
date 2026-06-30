"use client";

import { useState } from "react";
import {
  bestTrial, ageInYears, matchBothBenchmarks, ragStatus, RAG_COLOR, RAG_LABEL,
  asymmetryIndex, testResultsToCSV, downloadCSV,
} from "@/lib/data/testing";
import type { TestSession, TestMetric, TestBenchmark, Athlete, RagStatus } from "@/types";

type ReportMode = "full" | "progress" | "csv";

interface Props {
  athlete: Athlete;
  sessions: TestSession[];       // newest-first
  metrics: TestMetric[];
  benchmarksByMetric: Record<string, TestBenchmark[]>;
  onClose: () => void;
}

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function TestReportModal({ athlete, sessions, metrics, benchmarksByMetric, onClose }: Props) {
  const [mode, setMode] = useState<ReportMode>("full");

  const latestSession = sessions[0];
  const prevSession = sessions[1];
  const athleteAge = latestSession ? ageInYears(athlete.date_of_birth, latestSession.date) : null;

  const handleExportCSV = () => {
    const csv = testResultsToCSV(sessions, metrics, athlete.name);
    downloadCSV(csv, `${athlete.name.replace(/\s+/g, "_")}_testing_data.csv`);
  };

  const hasBodyweight = latestSession?.bodyweight_kg != null;
  const visibleMetrics = metrics.filter((m) => {
    const isImtpAbs = m.name.toLowerCase().includes("imtp") && m.unit === "kg";
    const isImtpRel = m.name.toLowerCase().includes("imtp") && m.unit === "N/kg";
    if (isImtpAbs && hasBodyweight) return false;
    if (isImtpRel && !hasBodyweight) return false;
    return true;
  });

  const ratedMetrics = visibleMetrics.filter((m) => !m.screening_only);
  const screeningMetrics = visibleMetrics.filter((m) => m.screening_only);

  const metricRows = ratedMetrics
    .map((metric) => {
      const latest = latestSession ? bestTrial(latestSession.results ?? [], metric, null) : null;
      if (latest === null) return null;
      const prev = prevSession ? bestTrial(prevSession.results ?? [], metric, null) : null;

      const { elite, population } = mode === "full"
        ? matchBothBenchmarks(benchmarksByMetric[metric.id] ?? [], athlete.sex, athleteAge)
        : { elite: null, population: null };
      const eliteRag = elite ? ragStatus(latest, metric, elite) : null;
      const popRag = population ? ragStatus(latest, metric, population) : null;

      return { metric, latest, prev, elite, population, eliteRag, popRag };
    })
    .filter(Boolean) as Array<{
      metric: TestMetric; latest: number; prev: number | null;
      elite: TestBenchmark | null; population: TestBenchmark | null;
      eliteRag: RagStatus | null; popRag: RagStatus | null;
    }>;

  const asymmetryRows = screeningMetrics
    .map((metric) => {
      if (!latestSession) return null;
      const left = bestTrial(latestSession.results ?? [], metric, "left");
      const right = bestTrial(latestSession.results ?? [], metric, "right");
      if (left === null || right === null) return null;
      const { pct, status } = asymmetryIndex(left, right);
      const prevLeft = prevSession ? bestTrial(prevSession.results ?? [], metric, "left") : null;
      const prevRight = prevSession ? bestTrial(prevSession.results ?? [], metric, "right") : null;
      const prevAsym = prevLeft !== null && prevRight !== null ? asymmetryIndex(prevLeft, prevRight) : null;
      return { metric, left, right, pct, status, prevAsym };
    })
    .filter(Boolean) as Array<{
      metric: TestMetric; left: number; right: number; pct: number;
      status: "normal" | "monitor" | "concern"; prevAsym: { pct: number; status: string } | null;
    }>;

  const ASYM_COLOR: Record<string, string> = { normal: "#2E9E5B", monitor: "#FB8C00", concern: "#E53935" };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header} className="no-print">
          <div>
            <div style={s.brand}>AthletiQ</div>
            <div style={s.athleteLine}>{athlete.name} · Physical Testing Report</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.modeBar} className="no-print">
          <div style={s.modeTabs}>
            <button style={{ ...s.modeTab, ...(mode === "full" ? s.modeTabActive : {}) }} onClick={() => setMode("full")}>
              Full report + norms
            </button>
            <button style={{ ...s.modeTab, ...(mode === "progress" ? s.modeTabActive : {}) }} onClick={() => setMode("progress")}>
              Progress only
            </button>
            <button style={{ ...s.modeTab, ...(mode === "csv" ? s.modeTabActive : {}) }} onClick={() => setMode("csv")}>
              Raw data export
            </button>
          </div>
        </div>

        {mode === "csv" ? (
          <div style={s.csvPane}>
            <div style={s.csvIcon}>📄</div>
            <div style={s.csvTitle}>Export raw testing data</div>
            <div style={s.csvDesc}>
              Downloads every logged trial across {sessions.length} test session{sessions.length !== 1 ? "s" : ""} as a CSV —
              date, metric, side, trial number, value, bodyweight, and notes. No narrative, no benchmarking — just the numbers, ready for your own analysis.
            </div>
            <button style={s.primaryBtn} onClick={handleExportCSV}>⬇ Download CSV</button>
          </div>
        ) : (
          <div id="testing-report-content" style={s.content}>
            <div style={s.metaBar}>
              <MetaCell label="ATHLETE" value={athlete.name} />
              <MetaCell label="AGE AT TEST" value={athleteAge != null ? `${athleteAge} yrs` : "—"} />
              <MetaCell label="SEX" value={athlete.sex ? (athlete.sex === "male" ? "Male" : "Female") : "—"} />
              <MetaCell label="BODY MASS" value={latestSession?.bodyweight_kg ? `${latestSession.bodyweight_kg}kg` : "Not recorded"} />
              <MetaCell label="TEST DATE" value={latestSession ? fmtDate(latestSession.date) : "—"} />
            </div>

            {mode === "full" && (
              <div style={s.legendBar}>
                <span style={s.legendLabel}>RATING KEY</span>
                {(["excellent", "good", "average", "needs_work"] as RagStatus[]).map((r) => (
                  <span key={r} style={{ ...s.legendBadge, background: RAG_COLOR[r] }}>{RAG_LABEL[r].toUpperCase()}</span>
                ))}
                <span style={s.legendNote}>Same colour scale used for both Elite and Population ratings.</span>
              </div>
            )}

            <div style={s.disclaimer}>
              <b>Please note:</b> These results represent a snapshot on a single testing day. Physical performance can be
              influenced by fatigue, sleep quality, nutrition, hydration, and time of day. Where scores appear to have
              declined between sessions, this may reflect day-to-day variation rather than a genuine change in fitness.
              Results should always be interpreted in context with the athlete&apos;s training load and overall wellbeing.
            </div>

            {metricRows.length === 0 ? (
              <div style={s.emptyNote}>No rated test results logged yet.</div>
            ) : (
              <>
                <table style={s.table}>
                  <thead>
                    <tr style={s.theadRow}>
                      <th style={{ ...s.th, textAlign: "left" }}>Test</th>
                      <th style={s.th}>Result</th>
                      {prevSession && <th style={s.th}>Change</th>}
                      {mode === "full" && <th style={s.th}>Elite Rating</th>}
                      {mode === "full" && <th style={s.th}>Pop. Rating</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {metricRows.map(({ metric, latest, prev, eliteRag, popRag }) => {
                      const lower = metric.better_direction === "lower";
                      const delta = prev !== null ? latest - prev : null;
                      const improved = delta !== null ? (lower ? delta < 0 : delta > 0) : null;
                      return (
                        <tr key={metric.id} style={s.tr}>
                          <td style={{ ...s.td, textAlign: "left", fontWeight: 700 }}>{metric.name}</td>
                          <td style={s.td}>{latest}{metric.unit}</td>
                          {prevSession && (
                            <td style={{ ...s.td, color: delta === null ? "var(--mute)" : improved ? "#2E9E5B" : "#E53935", fontWeight: 600 }}>
                              {delta === null ? "—" : `${improved ? "▲" : "▼"}${Math.abs(delta).toFixed(2)}`}
                            </td>
                          )}
                          {mode === "full" && (
                            <td style={s.td}>{eliteRag ? <RagBadge rag={eliteRag} /> : <span style={s.naText}>N/A</span>}</td>
                          )}
                          {mode === "full" && (
                            <td style={s.td}>{popRag ? <RagBadge rag={popRag} /> : <span style={s.naText}>N/A</span>}</td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {mode === "full" && asymmetryRows.map(({ metric, left, right, pct, status, prevAsym }) => (
                  <div key={metric.id} style={s.asymBlock}>
                    <div style={s.asymTitle}>{metric.name} — Asymmetry Screening</div>
                    <div style={s.asymGrid}>
                      <div style={s.asymCell}><div style={s.asymCellLabel}>Left</div><div style={s.asymCellValue}>{left}{metric.unit}</div></div>
                      <div style={s.asymCell}><div style={s.asymCellLabel}>Right</div><div style={s.asymCellValue}>{right}{metric.unit}</div></div>
                    </div>
                    <div style={{ ...s.asymSummary, color: ASYM_COLOR[status] }}>
                      Asymmetry index: <b>{pct.toFixed(1)}%</b>
                      {prevAsym && ` (was ${prevAsym.pct.toFixed(1)}%)`} — {status === "normal" ? "Normal range" : status === "monitor" ? "Monitor" : "Clinical concern"}
                    </div>
                    <div style={s.asymNote}>
                      Displayed for asymmetry screening only — no published youth height norms exist for this test. Benchmarks: &lt;10% normal, 10–15% monitor, &gt;15% clinical concern (Donskov et al. 2021).
                    </div>
                  </div>
                ))}

                {mode === "full" && (
                  <>
                    <div style={s.sectionHeader}>Test Explanations & Personalised Commentary</div>
                    {metricRows.map(({ metric, eliteRag }) => {
                      const commentary = eliteRag === "excellent" ? metric.commentary_excellent
                        : eliteRag === "good" ? metric.commentary_good
                        : eliteRag === "average" ? metric.commentary_average
                        : eliteRag === "needs_work" ? metric.commentary_needs_work
                        : "";
                      if (!metric.what_it_measures && !commentary) return null;
                      return (
                        <div key={metric.id} style={s.explainBlock}>
                          <div style={s.explainName}>{metric.name.toUpperCase()}</div>
                          {metric.what_it_measures && (
                            <div style={s.explainRow}><span style={s.explainLabel}>WHAT IT MEASURES</span><span>{metric.what_it_measures}</span></div>
                          )}
                          {metric.why_it_matters && (
                            <div style={s.explainRow}><span style={s.explainLabel}>WHY IT MATTERS</span><span>{metric.why_it_matters}</span></div>
                          )}
                          {commentary && (
                            <div style={{ ...s.explainRow, background: eliteRag ? RAG_COLOR[eliteRag] + "18" : "transparent" }}>
                              <span style={s.explainLabel}>YOUR RESULT</span><span>{commentary}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {mode === "full" && (
                  <div style={s.sourceNote}>
                    Elite ratings compare against trained youth athletes of the same age and sex. Population ratings compare
                    against general school-age children, anchored to published population data where available or an
                    extrapolated step-down method otherwise. All benchmarks are indicative and should be interpreted
                    alongside physical maturity, training age, and sport context.
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {mode !== "csv" && (
          <div style={s.footerBar} className="no-print">
            <button style={s.ghostBtn} onClick={() => window.print()}>🖨 Print</button>
          </div>
        )}
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.metaCell}>
      <div style={s.metaLabel}>{label}</div>
      <div style={s.metaValue}>{value}</div>
    </div>
  );
}

function RagBadge({ rag }: { rag: RagStatus }) {
  return <span style={{ ...s.ragBadge, background: RAG_COLOR[rag] }}>{RAG_LABEL[rag].toUpperCase()}</span>;
}

const s: Record<string, any> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.75)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 200, overflowY: "auto", padding: "0 0 40px" },
  modal: { background: "var(--panel)", width: "100%", maxWidth: 720, borderRadius: "0 0 16px 16px", boxShadow: "0 8px 40px rgba(0,0,0,.6)" },
  header: { background: "var(--ink)", padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 2 },
  brand: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, color: "var(--accent)", letterSpacing: 2 },
  athleteLine: { fontSize: 13, color: "var(--text)", fontWeight: 600 },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer" },
  modeBar: { padding: "14px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 },
  modeTabs: { display: "flex", gap: 8 },
  modeTab: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  modeTabActive: { background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" },
  csvPane: { padding: "48px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  csvIcon: { fontSize: 40 },
  csvTitle: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  csvDesc: { fontSize: 13, color: "var(--mute)", maxWidth: 420, lineHeight: 1.5 },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 8 },
  content: { padding: 20 },
  metaBar: { display: "flex", gap: 8, background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 8px", marginBottom: 12, flexWrap: "wrap" },
  metaCell: { flex: 1, minWidth: 90, textAlign: "center" },
  metaLabel: { fontSize: 9, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.05em" },
  metaValue: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginTop: 2 },
  legendBar: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", marginBottom: 10 },
  legendLabel: { fontSize: 9, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.05em", marginRight: 4 },
  legendBadge: { fontSize: 9, fontWeight: 700, color: "#fff", padding: "3px 8px", borderRadius: 5 },
  legendNote: { fontSize: 10, color: "var(--mute)", marginLeft: "auto" },
  disclaimer: { fontSize: 11, color: "var(--text)", background: "#1a2c38", borderLeft: "3px solid var(--accent)", borderRadius: 6, padding: "8px 12px", marginBottom: 14, lineHeight: 1.5 },
  emptyNote: { color: "var(--mute)", fontSize: 14, padding: "20px 0" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 },
  theadRow: { background: "var(--ink)" },
  th: { textAlign: "center", padding: "6px 6px", fontWeight: 700, fontSize: 10, color: "var(--mute)", textTransform: "uppercase" },
  tr: { borderBottom: "1px solid var(--line)" },
  td: { padding: "8px 6px", textAlign: "center", color: "var(--text)" },
  naText: { fontSize: 10, color: "var(--mute)" },
  ragBadge: { fontSize: 9, fontWeight: 700, color: "#fff", padding: "3px 8px", borderRadius: 5, whiteSpace: "nowrap" },
  asymBlock: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 14 },
  asymTitle: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 8 },
  asymGrid: { display: "flex", gap: 10, marginBottom: 8 },
  asymCell: { flex: 1, background: "var(--panel)", borderRadius: 8, padding: "8px 10px", textAlign: "center" },
  asymCellLabel: { fontSize: 10, color: "var(--mute)" },
  asymCellValue: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  asymSummary: { fontSize: 12, fontWeight: 600, marginBottom: 4 },
  asymNote: { fontSize: 10, color: "var(--mute)", lineHeight: 1.4 },
  sectionHeader: { background: "var(--accent)", color: "#0a1420", fontWeight: 700, fontSize: 12, padding: "7px 12px", borderRadius: 6, marginBottom: 10, marginTop: 6 },
  explainBlock: { marginBottom: 14, border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" },
  explainName: { background: "var(--accent-dim)", color: "var(--accent)", fontWeight: 700, fontSize: 11, padding: "6px 12px" },
  explainRow: { display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px", fontSize: 12, color: "var(--text)", lineHeight: 1.5, borderTop: "1px solid var(--line)" },
  explainLabel: { fontSize: 9, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.05em" },
  sourceNote: { fontSize: 10, color: "var(--mute)", lineHeight: 1.5, borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 },
  footerBar: { padding: "12px 20px 18px", display: "flex", justifyContent: "flex-end" },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" },
};
