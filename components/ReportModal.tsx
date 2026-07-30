"use client";

import { useState } from "react";
import type { ReportData } from "@/lib/data/reports";
import type { ReportOptions } from "@/components/ReportRangeModal";

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
  if (pct == null) return "—";
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
  } = data;
  const [ttlMode, setTtlMode] = useState<"all" | "weekly">("all");

  const hasStrength = Object.keys(exMap).length > 0;
  const hasHyrox = hyroxSessions.length > 0;
  const hasCardio = cardioSessions.length > 0;
  const hasPowerSpeed = powerSpeedSessions.length > 0;

  const handleCopy = () => {
    const el = document.getElementById("report-content");
    if (!el) return;
    const text = el.innerText || el.textContent || "";
    navigator.clipboard
      ?.writeText("AthletiQ TRAINING REPORT\n\n" + text)
      .catch(() => {
        // Clipboard can fail (permissions, insecure context) — the
        // content is still visible on screen and printable either way.
      });
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
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button style={styles.ghostBtn} onClick={() => window.print()}>
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
          {!hasStrength && !hasHyrox && !hasCardio && !hasPowerSpeed && !notes.length && (
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

          {options.highlights && (topProgressed.length > 0 || toReview.length > 0) && (
            <div style={{ marginBottom: 24 }}>
              <div style={styles.sectionTitle}>Highlights</div>
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

          {options.loadProgression && hasStrength && (
            <div style={{ marginBottom: 24 }}>
              <div style={styles.sectionTitle}>Load Progression</div>
              <div style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.theadRow}>
                      {["Exercise", "Sessions", "First TTL", "Latest TTL", "% Change"].map((h) => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {exerciseSummaries.map((e) => {
                      const first = e.entries[0];
                      const last = e.entries[e.entries.length - 1];
                      return (
                        <tr key={e.name} style={styles.tr}>
                          <td style={styles.td}>{e.name}</td>
                          <td style={styles.td}>{e.entries.length}</td>
                          <td style={styles.td}>{first.ttl.toFixed(0)} kg</td>
                          <td style={styles.td}>{last.ttl.toFixed(0)} kg</td>
                          <td style={{ ...styles.td, color: pctColor(e.overallPct), fontWeight: 700 }}>
                            {fmtPct(e.overallPct)}
                          </td>
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
                <div style={{ ...styles.sectionTitle, marginBottom: 0 }}>Strength — Total Training Load</div>
                <div style={styles.modeToggle}>
                  <button
                    style={{ ...styles.modeBtn, ...(ttlMode === "all" ? styles.modeBtnActive : {}) }}
                    onClick={() => setTtlMode("all")}
                  >
                    All sessions
                  </button>
                  <button
                    style={{ ...styles.modeBtn, ...(ttlMode === "weekly" ? styles.modeBtnActive : {}) }}
                    onClick={() => setTtlMode("weekly")}
                  >
                    Weekly avg
                  </button>
                </div>
              </div>
              {ttlMode === "all"
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
