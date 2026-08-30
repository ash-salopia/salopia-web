"use client";

import { useState } from "react";
import { buildTestReportView, testResultsToCSV, downloadCSV, RATING_SCOPE_LABEL, type CompareBasis, type RatingScope } from "@/lib/data/testing";
import TestReportBody from "@/components/reports/TestReportBody";
import type { TestSession, TestMetric, TestBenchmark } from "@/types";
import { DEFAULT_BRANDING, type ResolvedBranding } from "@/types/branding";

function fmtShortDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
// Serialise a CompareBasis to/from a <select> value.
function basisValue(b: CompareBasis): string {
  return b.kind === "session" ? `session:${b.sessionId}` : b.kind;
}
function parseBasis(v: string): CompareBasis {
  if (v.startsWith("session:")) return { kind: "session", sessionId: v.slice(8) };
  return { kind: v as "previous" | "best" | "first" };
}

type ReportMode = "full" | "progress" | "csv";

// Only the fields the report actually reads — lets the group-session
// viewer pass a lightweight athlete without the full Athlete row.
export interface ReportAthlete {
  name: string;
  group?: string | null;
  sex: "male" | "female" | null;
  date_of_birth: string | null;
}

interface Props {
  athlete: ReportAthlete;
  sessions: TestSession[];       // newest-first
  metrics: TestMetric[];
  benchmarksByMetric: Record<string, TestBenchmark[]>;
  branding?: ResolvedBranding;
  onClose: () => void;
  // Optional chrome for the group-session sequential viewer.
  nav?: { index: number; total: number; onPrev: () => void; onNext: () => void };
  // Preselected comparison basis (e.g. from the group Reports menu).
  initialCompareTo?: CompareBasis;
  // Preselected norm set(s) to rate against (from the group Reports menu).
  initialRatingScope?: RatingScope;
}

// Opens the report body in a fresh window with a light print stylesheet
// and triggers the browser print dialog — same robust pattern as
// ReportModal (an embedded print is unreliable across browsers; a real
// tab's native PDF viewer always works). TestReportBody is already a
// hard light palette, so almost no CSS is needed here.
function printReport(title: string) {
  const el = document.getElementById("testing-report-content");
  if (!el) return;
  const w = window.open("", "_blank", "width=900,height=1200");
  if (!w) return;
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>*{box-sizing:border-box}body{margin:0}@page{margin:14mm}tr{page-break-inside:avoid}</style>
</head><body>${el.innerHTML}</body></html>`);
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}

export default function TestReportModal({ athlete, sessions, metrics, benchmarksByMetric, branding = DEFAULT_BRANDING, onClose, nav, initialCompareTo, initialRatingScope }: Props) {
  const [mode, setMode] = useState<ReportMode>("full");
  const [compareTo, setCompareTo] = useState<CompareBasis>(initialCompareTo ?? { kind: "previous" });
  const [ratingScope, setRatingScope] = useState<RatingScope>(initialRatingScope ?? "both");

  const view = buildTestReportView(athlete, sessions, metrics, benchmarksByMetric, compareTo);

  const handleExportCSV = () => {
    const csv = testResultsToCSV(sessions, metrics, athlete.name);
    downloadCSV(csv, `${athlete.name.replace(/\s+/g, "_")}_testing_data.csv`);
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header} className="no-print">
          <div>
            <div style={s.brand}>{branding.displayName}</div>
            <div style={s.athleteLine}>{athlete.name} · Physical Testing Report</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {nav && (
              <div style={s.nav}>
                <button style={s.navBtn} disabled={nav.index <= 0} onClick={nav.onPrev}>‹ Prev</button>
                <span style={s.navCount}>{nav.index + 1} / {nav.total}</span>
                <button style={s.navBtn} disabled={nav.index >= nav.total - 1} onClick={nav.onNext}>Next ›</button>
              </div>
            )}
            <button style={s.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={s.modeBar} className="no-print">
          <div style={s.modeTabs}>
            <button style={{ ...s.modeTab, ...(mode === "full" ? s.modeTabActive : {}) }} onClick={() => setMode("full")}>Full report + norms</button>
            <button style={{ ...s.modeTab, ...(mode === "progress" ? s.modeTabActive : {}) }} onClick={() => setMode("progress")}>Progress only</button>
            <button style={{ ...s.modeTab, ...(mode === "csv" ? s.modeTabActive : {}) }} onClick={() => setMode("csv")}>Raw data export</button>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {mode === "full" && (
              <label style={s.compareWrap}>
                <span style={s.compareLabel}>Ratings</span>
                <select
                  style={s.compareSelect}
                  value={ratingScope}
                  onChange={(e) => setRatingScope(e.target.value as RatingScope)}
                >
                  {(Object.keys(RATING_SCOPE_LABEL) as RatingScope[]).map((k) => (
                    <option key={k} value={k}>{RATING_SCOPE_LABEL[k]}</option>
                  ))}
                </select>
              </label>
            )}
            {mode !== "csv" && sessions.length >= 2 && (
              <label style={s.compareWrap}>
                <span style={s.compareLabel}>Compare to</span>
                <select
                  style={s.compareSelect}
                  value={basisValue(compareTo)}
                  onChange={(e) => setCompareTo(parseBasis(e.target.value))}
                >
                  <option value="previous">Previous test</option>
                  <option value="best">Best previous result</option>
                  <option value="first">First test</option>
                  {sessions.slice(1).map((sess) => (
                    <option key={sess.id} value={`session:${sess.id}`}>{fmtShortDate(sess.date)}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        {mode === "csv" ? (
          <div style={s.csvPane}>
            <div style={{ fontSize: 40 }}>📄</div>
            <div style={s.csvTitle}>Export raw testing data</div>
            <div style={s.csvDesc}>
              Downloads every logged trial across {sessions.length} test session{sessions.length !== 1 ? "s" : ""} as a CSV —
              date, metric, side, trial number, value, bodyweight, and notes. Just the numbers, ready for your own analysis.
            </div>
            <button style={s.primaryBtn} onClick={handleExportCSV}>⬇ Download CSV</button>
          </div>
        ) : (
          <>
            <div id="testing-report-content">
              <TestReportBody
                athleteName={athlete.name}
                athleteGroup={athlete.group}
                athleteSex={athlete.sex}
                view={view}
                mode={mode === "progress" ? "progress" : "full"}
                ratingScope={ratingScope}
                branding={branding}
              />
            </div>
            <div style={s.footerBar} className="no-print">
              <button style={s.ghostBtn} onClick={() => printReport(`${athlete.name} - Testing Report`)}>🖨 Print / Save PDF</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.75)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 200, overflowY: "auto", padding: "0 0 40px" },
  modal: { background: "var(--panel)", width: "100%", maxWidth: 720, borderRadius: "0 0 16px 16px", boxShadow: "0 8px 40px rgba(0,0,0,.6)" },
  header: { background: "var(--ink)", padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 2 },
  brand: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, color: "var(--accent)", letterSpacing: 2 },
  athleteLine: { fontSize: 13, color: "var(--text)", fontWeight: 600 },
  nav: { display: "flex", alignItems: "center", gap: 8 },
  navBtn: { background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  navCount: { fontSize: 12, color: "var(--mute)", fontWeight: 700, minWidth: 44, textAlign: "center" },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer" },
  modeBar: { padding: "14px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 },
  modeTabs: { display: "flex", gap: 8 },
  modeTab: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  modeTabActive: { background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" },
  compareWrap: { display: "flex", alignItems: "center", gap: 6 },
  compareLabel: { fontSize: 11, color: "var(--mute)", fontWeight: 600 },
  compareSelect: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "6px 8px", fontSize: 12 },
  csvPane: { padding: "48px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  csvTitle: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  csvDesc: { fontSize: 13, color: "var(--mute)", maxWidth: 420, lineHeight: 1.5 },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 8 },
  footerBar: { padding: "12px 20px 18px", display: "flex", justifyContent: "flex-end", background: "var(--panel)" },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" },
};
