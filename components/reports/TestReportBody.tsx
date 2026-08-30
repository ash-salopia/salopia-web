"use client";

// Presentational body of a single athlete's Test Report — shared by
// TestReportModal (on-screen preview), the sequential viewer, and the
// combined "print all" page. Always a light, printable palette (hard
// hex, no CSS vars) so it renders identically inside the dark app
// chrome, in a print window, and stacked on a batch page.
//
// Derivation lives in lib/data/testing.ts's buildTestReportView — this
// file only lays the numbers out.

import { RAG_COLOR, RAG_LABEL, type TestReportView, type RatingScope } from "@/lib/data/testing";
import type { RagStatus } from "@/types";
import type { ResolvedBranding } from "@/types/branding";
import { DEFAULT_BRANDING } from "@/types/branding";

const ASYM_COLOR: Record<string, string> = { normal: "#2E9E5B", monitor: "#FB8C00", concern: "#E53935" };

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export interface TestReportBodyProps {
  athleteName: string;
  athleteGroup?: string | null;
  athleteSex: "male" | "female" | null;
  view: TestReportView;
  mode?: "full" | "progress";
  ratingScope?: RatingScope;
  branding?: ResolvedBranding;
  /** Rendered on its own printable page (adds page-break + top margin). */
  pageBreak?: boolean;
}

export default function TestReportBody({
  athleteName, athleteGroup, athleteSex, view, mode = "full", ratingScope = "both",
  branding = DEFAULT_BRANDING, pageBreak = false,
}: TestReportBodyProps) {
  const { athleteAge, latestSession, ratedRows, asymmetryRows, compare } = view;
  const accent = branding.primaryColor || "#1f6fd6";
  const full = mode === "full";
  const showElite = ratingScope !== "population";
  const showPop = ratingScope !== "elite";
  // commentary keys off whichever rating is shown (elite when both)
  const scopeRag = (r: { eliteRag: unknown; popRag: unknown }) => (ratingScope === "population" ? r.popRag : r.eliteRag);

  return (
    <div style={{ ...s.wrap, ...(pageBreak ? s.pageBreak : null) }}>
      <div style={s.brandRow}>
        {branding.logoUrl
          ? <img src={branding.logoUrl} alt={branding.displayName} style={s.logo} />
          : <div style={{ ...s.brand, color: accent }}>{branding.displayName}</div>}
        <div style={s.athleteLine}>
          {athleteName}{athleteGroup ? ` · ${athleteGroup}` : ""} — Physical Testing Report
        </div>
      </div>

      <div style={s.metaBar}>
        <Meta label="ATHLETE" value={athleteName} accent={accent} />
        <Meta label="AGE AT TEST" value={athleteAge != null ? `${athleteAge} yrs` : "—"} accent={accent} />
        <Meta label="SEX" value={athleteSex ? (athleteSex === "male" ? "Male" : "Female") : "—"} accent={accent} />
        <Meta label="BODY MASS" value={latestSession?.bodyweight_kg ? `${latestSession.bodyweight_kg}kg` : "Not recorded"} accent={accent} />
        <Meta label="TEST DATE" value={latestSession ? fmtDate(latestSession.date) : "—"} accent={accent} />
      </div>

      {compare && (
        <div style={s.compareNote}>
          <b>{compare.shortLabel}</b> = {compare.label.replace(/^vs /, "")} · <b>Now</b> = this test · <b>Δ</b> = change (green = improvement)
        </div>
      )}

      {full && (
        <div style={s.legendBar}>
          <span style={{ ...s.legendLabel, color: accent }}>RATING KEY</span>
          {(["excellent", "good", "average", "needs_work"] as RagStatus[]).map((r) => (
            <span key={r} style={{ ...s.legendBadge, background: RAG_COLOR[r] }}>{RAG_LABEL[r].toUpperCase()}</span>
          ))}
          {ratingScope === "both" && <span style={s.legendNote}>Same colour scale for Elite and Population ratings.</span>}
        </div>
      )}

      <div style={{ ...s.disclaimer, borderLeftColor: accent }}>
        <b>Please note:</b> These results represent a snapshot on a single testing day. Physical performance can be
        influenced by fatigue, sleep, nutrition, hydration, and time of day. Where scores appear to have declined
        between sessions, this may reflect day-to-day variation rather than a genuine change in fitness. Interpret
        alongside the athlete&apos;s training load and overall wellbeing.
      </div>

      {ratedRows.length === 0 ? (
        <div style={s.emptyNote}>No rated test results logged yet.</div>
      ) : (
        <>
          <table style={s.table}>
            <thead>
              <tr style={s.theadRow}>
                <th style={{ ...s.th, textAlign: "left" }}>Test</th>
                {compare
                  ? <>
                      <th style={s.th}>{compare.shortLabel}</th>
                      <th style={s.th}>Now</th>
                      <th style={s.th}>Δ</th>
                    </>
                  : <th style={s.th}>Result</th>}
                {full && showElite && <th style={s.th}>{ratingScope === "elite" ? "Rating" : "Elite Rating"}</th>}
                {full && showPop && <th style={s.th}>{ratingScope === "population" ? "Rating" : "Pop. Rating"}</th>}
              </tr>
            </thead>
            <tbody>
              {ratedRows.map(({ metric, latest, prev, eliteRag, popRag }) => {
                const lower = metric.better_direction === "lower";
                const delta = prev !== null ? latest - prev : null;
                const improved = delta !== null ? (lower ? delta < 0 : delta > 0) : null;
                return (
                  <tr key={metric.id} style={s.tr}>
                    <td style={{ ...s.td, textAlign: "left", fontWeight: 700 }}>{metric.name}</td>
                    {compare
                      ? <>
                          <td style={{ ...s.td, color: "#6b7684" }}>{prev === null ? "—" : `${prev}${metric.unit}`}</td>
                          <td style={{ ...s.td, fontWeight: 700 }}>{latest}{metric.unit}</td>
                          <td style={{ ...s.td, color: delta === null || delta === 0 ? "#6b7684" : improved ? "#2E9E5B" : "#E53935", fontWeight: 600 }}>
                            {delta === null ? "—" : delta === 0 ? "0" : `${improved ? "▲" : "▼"}${Math.abs(delta).toFixed(2)}`}
                          </td>
                        </>
                      : <td style={s.td}>{latest}{metric.unit}</td>}
                    {full && showElite && <td style={s.td}>{eliteRag ? <RagBadge rag={eliteRag} /> : <span style={s.na}>N/A</span>}</td>}
                    {full && showPop && <td style={s.td}>{popRag ? <RagBadge rag={popRag} /> : <span style={s.na}>N/A</span>}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {full && asymmetryRows.map(({ metric, left, right, pct, status, prevAsym }) => (
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
                Shown for asymmetry screening only — no published youth norms exist for this test. Benchmarks: &lt;10% normal, 10–15% monitor, &gt;15% clinical concern (Donskov et al. 2021).
              </div>
            </div>
          ))}

          {full && (
            <>
              <div style={{ ...s.sectionHeader, background: accent }}>Test Explanations &amp; Personalised Commentary</div>
              {ratedRows.map((row) => {
                const { metric } = row;
                const rag = scopeRag(row) as RagStatus | null;
                const commentary = rag === "excellent" ? metric.commentary_excellent
                  : rag === "good" ? metric.commentary_good
                  : rag === "average" ? metric.commentary_average
                  : rag === "needs_work" ? metric.commentary_needs_work
                  : "";
                if (!metric.what_it_measures && !commentary) return null;
                return (
                  <div key={metric.id} style={s.explainBlock}>
                    <div style={{ ...s.explainName, color: accent, background: `${accent}18` }}>{metric.name.toUpperCase()}</div>
                    {metric.what_it_measures && (
                      <div style={s.explainRow}><span style={{ ...s.explainLabel, color: accent }}>WHAT IT MEASURES</span><span>{metric.what_it_measures}</span></div>
                    )}
                    {metric.why_it_matters && (
                      <div style={s.explainRow}><span style={{ ...s.explainLabel, color: accent }}>WHY IT MATTERS</span><span>{metric.why_it_matters}</span></div>
                    )}
                    {commentary && (
                      <div style={{ ...s.explainRow, background: rag ? RAG_COLOR[rag] + "18" : "transparent" }}>
                        <span style={{ ...s.explainLabel, color: accent }}>YOUR RESULT</span><span>{commentary}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={s.sourceNote}>
                {showElite && "Elite ratings compare against trained youth athletes of the same age and sex. "}
                {showPop && "Population ratings compare against general school-age children of the same age and sex. "}
                All benchmarks are indicative and should be interpreted alongside physical maturity, training age, and
                sport context.
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Meta({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={s.metaCell}>
      <div style={{ ...s.metaLabel, color: accent }}>{label}</div>
      <div style={s.metaValue}>{value}</div>
    </div>
  );
}

function RagBadge({ rag }: { rag: RagStatus }) {
  return <span style={{ ...s.ragBadge, background: RAG_COLOR[rag] }}>{RAG_LABEL[rag].toUpperCase()}</span>;
}

const s: Record<string, React.CSSProperties> = {
  wrap: { background: "#ffffff", color: "#16202a", padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif', fontSize: 12 },
  pageBreak: { breakAfter: "page", pageBreakAfter: "always" },
  brandRow: { marginBottom: 12 },
  brand: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: 2 },
  logo: { height: 28, objectFit: "contain" },
  athleteLine: { fontSize: 13, fontWeight: 600, marginTop: 2 },
  metaBar: { display: "flex", gap: 8, background: "#f7f8fa", border: "1px solid #d8dde3", borderRadius: 10, padding: "10px 8px", marginBottom: 12, flexWrap: "wrap" },
  metaCell: { flex: 1, minWidth: 90, textAlign: "center" },
  metaLabel: { fontSize: 9, fontWeight: 700, letterSpacing: "0.05em" },
  metaValue: { fontSize: 13, fontWeight: 700, marginTop: 2 },
  legendBar: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", background: "#f7f8fa", border: "1px solid #d8dde3", borderRadius: 10, padding: "8px 10px", marginBottom: 10 },
  legendLabel: { fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", marginRight: 4 },
  legendBadge: { fontSize: 9, fontWeight: 700, color: "#fff", padding: "3px 8px", borderRadius: 5 },
  legendNote: { fontSize: 10, color: "#6b7684", marginLeft: "auto" },
  compareNote: { fontSize: 11, color: "#6b7684", marginBottom: 10 },
  disclaimer: { fontSize: 11, background: "#eef4fb", borderLeft: "3px solid #1f6fd6", borderRadius: 6, padding: "8px 12px", marginBottom: 14, lineHeight: 1.5 },
  emptyNote: { color: "#6b7684", fontSize: 14, padding: "20px 0" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 },
  theadRow: { background: "#f7f8fa" },
  th: { textAlign: "center", padding: "6px 6px", fontWeight: 700, fontSize: 10, color: "#6b7684", textTransform: "uppercase" },
  tr: { borderBottom: "1px solid #d8dde3", pageBreakInside: "avoid" },
  td: { padding: "8px 6px", textAlign: "center" },
  na: { fontSize: 10, color: "#6b7684" },
  ragBadge: { fontSize: 9, fontWeight: 700, color: "#fff", padding: "3px 8px", borderRadius: 5, whiteSpace: "nowrap" },
  asymBlock: { background: "#f7f8fa", border: "1px solid #d8dde3", borderRadius: 10, padding: 14, marginBottom: 14 },
  asymTitle: { fontSize: 13, fontWeight: 700, marginBottom: 8 },
  asymGrid: { display: "flex", gap: 10, marginBottom: 8 },
  asymCell: { flex: 1, background: "#fff", border: "1px solid #d8dde3", borderRadius: 8, padding: "8px 10px", textAlign: "center" },
  asymCellLabel: { fontSize: 10, color: "#6b7684" },
  asymCellValue: { fontSize: 16, fontWeight: 700 },
  asymSummary: { fontSize: 12, fontWeight: 600, marginBottom: 4 },
  asymNote: { fontSize: 10, color: "#6b7684", lineHeight: 1.4 },
  sectionHeader: { color: "#fff", fontWeight: 700, fontSize: 12, padding: "7px 12px", borderRadius: 6, marginBottom: 10, marginTop: 6 },
  explainBlock: { marginBottom: 14, border: "1px solid #d8dde3", borderRadius: 10, overflow: "hidden" },
  explainName: { fontWeight: 700, fontSize: 11, padding: "6px 12px" },
  explainRow: { display: "flex", flexDirection: "column", gap: 2, padding: "8px 12px", fontSize: 12, lineHeight: 1.5, borderTop: "1px solid #d8dde3" },
  explainLabel: { fontSize: 9, fontWeight: 700, letterSpacing: "0.05em" },
  sourceNote: { fontSize: 10, color: "#6b7684", lineHeight: 1.5, borderTop: "1px solid #d8dde3", paddingTop: 10, marginTop: 10 },
};
