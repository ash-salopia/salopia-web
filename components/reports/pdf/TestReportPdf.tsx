// Vector PDF version of a single athlete's Test Report — for the group
// session's "Download all as PDF ZIP" flow (one file per athlete,
// zipped, same as the Reporting tab's bulk export). Tables only, no
// charts. Numbers come from lib/data/testing.ts's buildTestReportView,
// identical to the on-screen TestReportBody.
"use client";

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import BrandHeader from "@/components/reports/pdf/pdf-brand-header";
import CreditFooter from "@/components/reports/pdf/pdf-credit-footer";
import { RAG_COLOR, RAG_LABEL, type TestReportView, type RatingScope } from "@/lib/data/testing";
import type { RagStatus } from "@/types";
import { DEFAULT_BRANDING, type ResolvedBranding } from "@/types/branding";

const ASYM_COLOR: Record<string, string> = { normal: "#2E9E5B", monitor: "#FB8C00", concern: "#E53935" };

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export interface TestReportPdfProps {
  athleteName: string;
  athleteGroup?: string | null;
  athleteSex: "male" | "female" | null;
  view: TestReportView;
  ratingScope?: RatingScope;
  branding?: ResolvedBranding;
}

export default function TestReportPdf({
  athleteName, athleteGroup, athleteSex, view, ratingScope = "both", branding = DEFAULT_BRANDING,
}: TestReportPdfProps) {
  const { athleteAge, latestSession, ratedRows, asymmetryRows, compare } = view;
  const accent = branding.primaryColor || "#1f6fd6";
  const showElite = ratingScope !== "population";
  const showPop = ratingScope !== "elite";

  return (
    <Document title={`${athleteName} - Physical Testing Report`}>
      <Page size="A4" style={s.page} wrap>
        <CreditFooter />
        <View style={s.brandRow}>
          <BrandHeader branding={branding} />
          <Text style={s.athleteLine}>{athleteName}{athleteGroup ? ` · ${athleteGroup}` : ""} — Physical Testing Report</Text>
        </View>

        <View style={s.metaBar}>
          <Meta label="AGE AT TEST" value={athleteAge != null ? `${athleteAge} yrs` : "—"} accent={accent} />
          <Meta label="SEX" value={athleteSex ? (athleteSex === "male" ? "Male" : "Female") : "—"} accent={accent} />
          <Meta label="BODY MASS" value={latestSession?.bodyweight_kg ? `${latestSession.bodyweight_kg}kg` : "Not recorded"} accent={accent} />
          <Meta label="TEST DATE" value={latestSession ? fmtDate(latestSession.date) : "—"} accent={accent} />
        </View>

        <View style={s.legendBar}>
          <Text style={[s.legendLabel, { color: accent }]}>RATING KEY</Text>
          {(["excellent", "good", "average", "needs_work"] as RagStatus[]).map((r) => (
            <Text key={r} style={[s.legendBadge, { backgroundColor: RAG_COLOR[r] }]}>{RAG_LABEL[r].toUpperCase()}</Text>
          ))}
        </View>

        {compare && <Text style={s.compareNote}>{compare.shortLabel} = {compare.label.replace(/^vs /, "")}. Now = this test. Δ = change (green = improvement).</Text>}

        <Text style={[s.disclaimer, { borderLeftColor: accent }]}>
          These results represent a snapshot on a single testing day. Physical performance can be influenced by fatigue,
          sleep, nutrition, hydration, and time of day. Where scores appear to have declined between sessions, this may
          reflect day-to-day variation. Interpret alongside training load and overall wellbeing.
        </Text>

        {ratedRows.length === 0 ? (
          <Text style={s.emptyNote}>No rated test results logged yet.</Text>
        ) : (
          <>
            <View style={s.tHeadRow}>
              <Text style={[s.tCell, s.tHead, s.colTest]}>Test</Text>
              {compare ? (
                <>
                  <Text style={[s.tCell, s.tHead, s.colNum]}>{compare.shortLabel}</Text>
                  <Text style={[s.tCell, s.tHead, s.colNum]}>Now</Text>
                  <Text style={[s.tCell, s.tHead, s.colNum]}>{"Δ"}</Text>
                </>
              ) : (
                <Text style={[s.tCell, s.tHead, s.colNum]}>Result</Text>
              )}
              {showElite && <Text style={[s.tCell, s.tHead, s.colNum]}>{ratingScope === "elite" ? "Rating" : "Elite"}</Text>}
              {showPop && <Text style={[s.tCell, s.tHead, s.colNum]}>{ratingScope === "population" ? "Rating" : "Pop."}</Text>}
            </View>
            {ratedRows.map(({ metric, latest, prev, eliteRag, popRag }) => {
              const lower = metric.better_direction === "lower";
              const delta = prev !== null ? latest - prev : null;
              const improved = delta !== null ? (lower ? delta < 0 : delta > 0) : null;
              return (
                <View key={metric.id} style={s.tRow} wrap={false}>
                  <Text style={[s.tCell, s.colTest, s.bold]}>{metric.name}</Text>
                  {compare ? (
                    <>
                      <Text style={[s.tCell, s.colNum, { color: "#6b7684" }]}>{prev === null ? "—" : `${prev}${metric.unit}`}</Text>
                      <Text style={[s.tCell, s.colNum, s.bold]}>{latest}{metric.unit}</Text>
                      <Text style={[s.tCell, s.colNum, { color: delta === null || delta === 0 ? "#6b7684" : improved ? "#2E9E5B" : "#E53935" }]}>
                        {delta === null ? "—" : delta === 0 ? "0" : `${improved ? "▲" : "▼"}${Math.abs(delta).toFixed(2)}`}
                      </Text>
                    </>
                  ) : (
                    <Text style={[s.tCell, s.colNum]}>{latest}{metric.unit}</Text>
                  )}
                  {showElite && <View style={[s.tCell, s.colNum]}>{eliteRag ? <RagBadge rag={eliteRag} /> : <Text style={s.na}>N/A</Text>}</View>}
                  {showPop && <View style={[s.tCell, s.colNum]}>{popRag ? <RagBadge rag={popRag} /> : <Text style={s.na}>N/A</Text>}</View>}
                </View>
              );
            })}

            {asymmetryRows.map(({ metric, left, right, pct, status, prevAsym }) => (
              <View key={metric.id} style={s.asymBlock} wrap={false}>
                <Text style={s.asymTitle}>{metric.name} — Asymmetry Screening</Text>
                <Text style={s.asymLine}>Left {left}{metric.unit}   ·   Right {right}{metric.unit}</Text>
                <Text style={[s.asymLine, s.bold, { color: ASYM_COLOR[status] }]}>
                  Asymmetry index: {pct.toFixed(1)}%{prevAsym ? ` (was ${prevAsym.pct.toFixed(1)}%)` : ""} — {status === "normal" ? "Normal range" : status === "monitor" ? "Monitor" : "Clinical concern"}
                </Text>
                <Text style={s.asymNote}>Screening only — no published youth norms. &lt;10% normal, 10–15% monitor, &gt;15% concern (Donskov et al. 2021).</Text>
              </View>
            ))}

            <Text style={[s.sectionHeader, { backgroundColor: accent }]}>Test Explanations &amp; Personalised Commentary</Text>
            {ratedRows.map(({ metric, eliteRag, popRag }) => {
              const rag = ratingScope === "population" ? popRag : eliteRag;
              const commentary = rag === "excellent" ? metric.commentary_excellent
                : rag === "good" ? metric.commentary_good
                : rag === "average" ? metric.commentary_average
                : rag === "needs_work" ? metric.commentary_needs_work
                : "";
              if (!metric.what_it_measures && !commentary) return null;
              return (
                <View key={metric.id} style={s.explainBlock} wrap={false}>
                  <Text style={[s.explainName, { color: accent }]}>{metric.name.toUpperCase()}</Text>
                  {metric.what_it_measures ? <Text style={s.explainRow}><Text style={[s.explainLabel, { color: accent }]}>WHAT IT MEASURES  </Text>{metric.what_it_measures}</Text> : null}
                  {metric.why_it_matters ? <Text style={s.explainRow}><Text style={[s.explainLabel, { color: accent }]}>WHY IT MATTERS  </Text>{metric.why_it_matters}</Text> : null}
                  {commentary ? <Text style={s.explainRow}><Text style={[s.explainLabel, { color: accent }]}>YOUR RESULT  </Text>{commentary}</Text> : null}
                </View>
              );
            })}
            <Text style={s.sourceNote}>
              {showElite ? "Elite ratings compare against trained youth athletes of the same age and sex. " : ""}
              {showPop ? "Population ratings compare against general school-age children of the same age and sex. " : ""}
              All benchmarks are indicative and should be interpreted alongside physical maturity, training age, and
              sport context.
            </Text>
          </>
        )}
      </Page>
    </Document>
  );
}

function Meta({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={s.metaCell}>
      <Text style={[s.metaLabel, { color: accent }]}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

function RagBadge({ rag }: { rag: RagStatus }) {
  return <Text style={[s.ragBadge, { backgroundColor: RAG_COLOR[rag] }]}>{RAG_LABEL[rag].toUpperCase()}</Text>;
}

const s = StyleSheet.create({
  page: { padding: 34, paddingBottom: 46, fontFamily: "Helvetica", fontSize: 9, color: "#16202a" },
  brandRow: { marginBottom: 10 },
  athleteLine: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 3 },
  metaBar: { flexDirection: "row", flexWrap: "wrap", gap: 6, backgroundColor: "#f7f8fa", border: "1 solid #d8dde3", borderRadius: 6, padding: 8, marginBottom: 8 },
  metaCell: { minWidth: 90, flexGrow: 1, alignItems: "center" },
  metaLabel: { fontSize: 7, fontFamily: "Helvetica-Bold" },
  metaValue: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 2 },
  legendBar: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 8 },
  legendLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", marginRight: 3 },
  legendBadge: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#fff", paddingVertical: 2, paddingHorizontal: 5, borderRadius: 3 },
  compareNote: { fontSize: 7.5, color: "#6b7684", marginBottom: 6 },
  disclaimer: { fontSize: 8, backgroundColor: "#eef4fb", borderLeft: "3 solid #1f6fd6", borderRadius: 3, padding: 7, marginBottom: 10, lineHeight: 1.4 },
  emptyNote: { color: "#6b7684", fontSize: 10, paddingVertical: 14 },
  tHeadRow: { flexDirection: "row", backgroundColor: "#f7f8fa", borderBottom: "1 solid #d8dde3" },
  tRow: { flexDirection: "row", borderBottom: "1 solid #eef0f3", alignItems: "center" },
  tCell: { paddingVertical: 5, paddingHorizontal: 4 },
  tHead: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#6b7684", textTransform: "uppercase" },
  colTest: { flexGrow: 1, flexBasis: 0 },
  colNum: { width: 62, textAlign: "center" },
  bold: { fontFamily: "Helvetica-Bold" },
  na: { fontSize: 7, color: "#6b7684", textAlign: "center" },
  ragBadge: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#fff", paddingVertical: 2, paddingHorizontal: 4, borderRadius: 3, textAlign: "center" },
  asymBlock: { backgroundColor: "#f7f8fa", border: "1 solid #d8dde3", borderRadius: 6, padding: 8, marginTop: 10 },
  asymTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  asymLine: { fontSize: 8, marginBottom: 2 },
  asymNote: { fontSize: 7, color: "#6b7684", marginTop: 2 },
  sectionHeader: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 9, padding: 5, borderRadius: 3, marginTop: 10, marginBottom: 6 },
  explainBlock: { border: "1 solid #d8dde3", borderRadius: 6, padding: 6, marginBottom: 6 },
  explainName: { fontFamily: "Helvetica-Bold", fontSize: 8, marginBottom: 3 },
  explainRow: { fontSize: 8, lineHeight: 1.4, marginBottom: 2 },
  explainLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold" },
  sourceNote: { fontSize: 7, color: "#6b7684", lineHeight: 1.4, borderTop: "1 solid #d8dde3", paddingTop: 6, marginTop: 6 },
});
