"use client";

import type { ReportData } from "@/lib/data/reports";

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

export default function ReportModal({
  data,
  athleteName,
  athleteGroup,
  onClose,
}: {
  data: ReportData;
  athleteName: string;
  athleteGroup?: string;
  onClose: () => void;
}) {
  const { exMap, hyroxSessions, generated, rangeStart, rangeEnd } = data;
  const hasStrength = Object.keys(exMap).length > 0;
  const hasHyrox = hyroxSessions.length > 0;

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
          {!hasStrength && !hasHyrox && (
            <div style={styles.emptyNote}>
              No logged data found in this range. Log weights in strength sessions to generate a
              load report.
            </div>
          )}

          {hasStrength && (
            <>
              <div style={styles.sectionTitle}>Strength — Total Training Load</div>
              {Object.entries(exMap).map(([exName, entries]) => {
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
                            const chgColor = chg == null ? "var(--mute)" : chg >= 0 ? "var(--good)" : "#ff7d7d";
                            return (
                              <tr key={idx} style={styles.tr}>
                                <td style={styles.td}>{fmtDate(row.date)}</td>
                                <td style={styles.td}>{row.sets}</td>
                                <td style={styles.td}>{row.reps}</td>
                                <td style={styles.td}>{row.avgWeight.toFixed(1)}</td>
                                <td style={styles.td}>{row.maxWeight.toFixed(1)}</td>
                                <td style={{ ...styles.td, fontWeight: 700 }}>{row.ttl.toFixed(0)}</td>
                                <td style={{ ...styles.td, color: chgColor, fontWeight: 600 }}>
                                  {chg == null ? "—" : (chg >= 0 ? "+" : "") + chg.toFixed(1) + "%"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {overallPct != null && (
                      <div style={{ ...styles.overallLine, color: overallPct >= 0 ? "var(--good)" : "#ff7d7d" }}>
                        Overall: {overallPct >= 0 ? "+" : ""}
                        {overallPct.toFixed(1)}% across {entries.length} sessions · Best: {last.sets}×
                        {last.reps}@{last.maxWeight}kg · TTL {last.ttl.toFixed(0)} kg
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {hasHyrox && (
            <>
              <div style={{ ...styles.sectionTitle, marginTop: hasStrength ? 24 : 0 }}>Hyrox Sessions</div>
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
  sectionTitle: {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: 18,
    fontWeight: 700,
    color: "var(--accent)",
    letterSpacing: 1,
    marginBottom: 14,
    textTransform: "uppercase",
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
};
