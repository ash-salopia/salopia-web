"use client";

import { useEffect, useMemo, useState } from "react";
import { reportAiBody } from "@/lib/report-ai-request";
import type { ReportData } from "@/lib/data/reports";
import { hideExercises } from "@/lib/report-hide";
import type { ReportOptions } from "@/components/ReportRangeModal";
import { FORMULAS } from "@/lib/one-rm";
import Sparkline from "@/components/reports/Sparkline";
import MultiTrendLineChart from "@/components/reports/MultiTrendLineChart";
import { ACWR_BAND_LABEL, MONOTONY_HIGH } from "@/lib/training-load";
import { rtpMeta } from "@/lib/rtp";
import RadarSnapshot, { type RadarExercise } from "@/components/reports/RadarSnapshot";
import { METRIC_META } from "@/lib/cardio-metrics";
import { SESSION_TYPE_META } from "@/lib/report-options";
import type { SquadComparisonContext, SquadComparisonMetric } from "@/lib/squad-comparison";
import { DEFAULT_BRANDING, type ResolvedBranding } from "@/types/branding";
import { brandHeaderHtml, reportThemeColours, REPORT_CREDIT_TEXT } from "@/lib/report-branding";
import { daySpan, buildProgressRows, buildTrendSeries } from "@/lib/report-visuals";
import EmailReportDialog from "@/components/reports/EmailReportDialog";
import { PRINT_FLOW_CSS, tagPrintSections } from "@/lib/print-flow";

export type ReportStyle = "white" | "colour";

const RANGE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtRangeDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${parseInt(d)} ${RANGE_MONTHS[parseInt(m) - 1]} ${y}`;
}
import {
  CompetitionStrip,
  CoachVerdict,
  VerdictAiEdit,
  HideExerciseBtn,
  GoalProgressList,
  ReadinessPanel,
  AdherenceList,
  BenchmarkTables,
  HrZoneChart,
  type Verdict,
} from "@/components/reports/ReportVisuals";
import { HeadlineCards, PBWall, ProgressBars, SmallMultiples, ConsistencyCalendar, WeeklySessionsChart, type ProgressRow, type TrendSeries } from "@/components/reports/ReportVisuals";

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
  data: rawData,
  athleteName,
  athleteGroup,
  options,
  aiSummary,
  aiLoading,
  squadComparison,
  branding = DEFAULT_BRANDING,
  athleteId,
  athleteEmail,
  onAthleteEmailSaved,
  initialEmailOpen = false,
  onShared,
  onClose,
}: {
  data: ReportData;
  athleteName: string;
  athleteGroup?: string;
  options: ReportOptions;
  aiSummary?: { summary: string; themes: string; verdict?: Verdict } | null;
  aiLoading?: boolean;
  squadComparison?: SquadComparisonContext[] | null;
  branding?: ResolvedBranding;
  athleteId?: string; // enables "Email report"
  athleteEmail?: string | null; // athletes.contact_email (0122), pre-fills the To field
  onAthleteEmailSaved?: (email: string) => void;
  initialEmailOpen?: boolean; // open the Email dialog once the AI verdict is in (schedule reminders)
  onShared?: () => void;
  onClose: () => void;
}) {
  // Exercises the coach has taken out of this report with the red ✕
  // (injured, not relevant, not a fair picture). Removed from every
  // per-exercise section; restorable from the bar at the top.
  const [hiddenExercises, setHiddenExercises] = useState<Set<string>>(() => new Set());
  const hideExercise = (name: string) => setHiddenExercises((prev) => new Set(prev).add(name));
  const restoreExercise = (name: string) =>
    setHiddenExercises((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
  const data = useMemo(() => hideExercises(rawData, hiddenExercises), [rawData, hiddenExercises]);
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
    visual,
  } = data;
  // Shared "all sessions / weekly avg" toggle for the per-exercise
  // detail tables - governs both TTL and e1RM sections when both are
  // present, rather than each metric having its own.
  const [detailMode, setDetailMode] = useState<"all" | "weekly">("all");
  // Per-exercise tables start folded away under "Full detail".
  const [detailOpen, setDetailOpen] = useState(false);
  // Coach's verdict - drafted by the AI call when it arrives, then the
  // coach's own edits win (a late AI reply never overwrites them).
  const [verdict, setVerdict] = useState<Verdict>({ wentWell: "", workOn: "", nextFocus: "" });
  const [verdictEdited, setVerdictEdited] = useState(false);
  useEffect(() => {
    if (aiSummary?.verdict && !verdictEdited) setVerdict(aiSummary.verdict);
  }, [aiSummary, verdictEdited]);
  // "Ask AI to change this" - redrafts from the same report data the
  // first draft used, with the boxes as they stand now.
  const [aiEditsUsed, setAiEditsUsed] = useState(0);
  const requestVerdictEdit = async (instruction: string): Promise<Verdict> => {
    if (!athleteId) throw new Error("No athlete");
    setAiEditsUsed((n) => n + 1);
    const res = await fetch("/api/training-report-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        ...reportAiBody(athleteId, rawData.rangeStart, rawData.rangeEnd, options),
        edit: { instruction, current: verdict, removed: [...hiddenExercises] },
      }),
    });
    if (!res.ok) throw new Error("AI request failed");
    const json = await res.json();
    if (!json.verdict) throw new Error("AI request failed");
    return json.verdict as Verdict;
  };


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

  // Visual summary - strength progress reads off e1RM when there's any
  // (it's always computed, whether or not the e1RM tables are ticked),
  // else tonnage. A live toggle switches between the two.
  const [visualMetricPick, setVisualMetricPick] = useState<"e1rm" | "ttl" | null>(null);
  const visualMetric: "e1rm" | "ttl" = visualMetricPick ?? (hasE1rm ? "e1rm" : "ttl");
  const useE1rm = visualMetric === "e1rm" && hasE1rm;
  const visualUnit = useE1rm ? bwUnit : "kg";
  const visualDecimals = useE1rm ? (options.bodyweightRelative && bodyweightKg ? 2 : 1) : 0;
  const progressRows: ProgressRow[] = buildProgressRows(useE1rm ? "e1rm" : "ttl", strength, exerciseSummaries, e1rmValue);
  const trendSeries: TrendSeries[] = buildTrendSeries(useE1rm ? "e1rm" : "ttl", strength, exerciseSummaries, weeklyExMap, e1rmValue, Math.max(options.exerciseLimit, 12));
  const showProgressBars = options.progressBars !== false && progressRows.length > 0 && !dismissed.has("progress-bars");
  const metricToggle = hasE1rm && hasStrength && (
    <div style={styles.modeToggle} data-no-print="true">
      {(["e1rm", "ttl"] as const).map((m) => (
        <button key={m} style={{ ...styles.modeBtn, ...(visualMetric === m ? styles.modeBtnActive : {}) }} onClick={() => setVisualMetricPick(m)}>
          {m === "e1rm" ? "e1RM" : "Tonnage"}
        </button>
      ))}
    </div>
  );

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

  // The report as a standalone light-theme document - used by Print and
  // by "Email report" (saved as the shared /r/<id> page).
  const buildReportDocument = (style: ReportStyle = "white"): string | null => {
    const el = document.getElementById("report-content");
    if (!el) return null;

    // Strip live UI controls (the All sessions / Weekly avg toggle)
    // that don't mean anything on paper - the section title already
    // states which mode was active in plain text.
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-no-print="true"]').forEach((n) => n.remove());
    tagPrintSections(clone);

    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const title = `${esc(athleteName)} - Training Report`;
    const rangeText = rangeStart && rangeEnd ? `${esc(fmtRangeDate(rangeStart))} – ${esc(fmtRangeDate(rangeEnd))}` : "All time";
    const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&display=swap" rel="stylesheet">`;

    if (style === "colour") {
      const c = reportThemeColours(branding);
      const brandMark = branding.logoUrl
        ? `<img src="${esc(branding.logoUrl)}" alt="${esc(branding.displayName)}" style="height:30px;max-width:200px;object-fit:contain;display:block;background:#fff;border-radius:8px;padding:4px 8px" />`
        : `<div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:20px;letter-spacing:2px;color:${c.brand}">${esc(branding.displayName)}</div>`;
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
${fonts}
<style>
  :root {
    --ink: #ffffff; --panel: #f6f8fb; --panel2: #edf1f6; --line: #e1e6ee;
    --text: #121a24; --mute: #64707f; --accent: ${c.text}; --accent-dim: ${c.tint};
    --good: #1a8f57; --good-dim: #e6f7ee;
  }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html { background: #eef2f7; }
  body {
    margin: 0 auto; padding: 24px; max-width: 920px; background: #eef2f7; color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
  }
  table { width: 100%; border-collapse: collapse; }
  ${PRINT_FLOW_CSS}
  #vb-report > div {
    background: #fff; border: 1px solid var(--line); border-radius: 16px;
    padding: 20px 22px; margin-bottom: 16px !important; box-shadow: 0 1px 3px rgba(16, 24, 40, .05);
  }
  @page { margin: 12mm; }
  @media print { html, body { background: #eef2f7; } body { padding: 0; } }
  @media (max-width: 600px) { body { padding: 12px; } #vb-report > div { padding: 16px 14px; } }
</style>
</head>
<body>
  <div style="background:${c.band};border-radius:18px;padding:26px 26px 24px;margin-bottom:16px;color:#fff">
    ${brandMark}
    <div style="font-family:'Barlow Condensed',sans-serif;font-size:34px;font-weight:700;line-height:1.05;margin-top:18px;letter-spacing:.5px">${esc(athleteName)}</div>
    <div style="font-size:14px;opacity:.85;margin-top:4px">Training Report${athleteGroup ? ` · ${esc(athleteGroup)}` : ""}</div>
    <div style="display:inline-block;margin-top:14px;font-size:12px;font-weight:700;letter-spacing:.04em;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:5px 12px">${rangeText}</div>
  </div>
  <div id="vb-report">${clone.innerHTML}</div>
  <div style="font-size:11px;color:#8a94a1;text-align:center;margin-top:8px">Generated ${esc(generated)}</div>
</body>
</html>`;
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
${fonts}
<style>
  :root {
    --ink: #ffffff; --panel: #f7f8fa; --panel2: #eef0f3; --line: #d8dde3;
    --text: #16202a; --mute: #6b7684; --accent: #1f6fd6; --accent-dim: #e7f0fb;
    --good: #1a8f57; --good-dim: #e6f7ee;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto; padding: 24px; max-width: 900px; background: #fff; color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
  }
  table { width: 100%; border-collapse: collapse; }
  ${PRINT_FLOW_CSS}
  @page { margin: 16mm; }
  @media (max-width: 600px) { body { padding: 14px; } }
</style>
</head>
<body>
  ${brandHeaderHtml(branding)}
  <div style="font-size:13px;font-weight:600;margin-top:4px;">${esc(athleteName)}${athleteGroup ? ` · ${esc(athleteGroup)}` : ""}, Training Load Report</div>
  <div style="font-size:11px;color:var(--mute);${options.e1rm ? "margin-bottom:2px;" : "margin-bottom:20px;"}">Generated ${esc(generated)}${rangeStart && rangeEnd ? ` · ${esc(rangeStart)} to ${esc(rangeEnd)}` : " · All time"}</div>
  ${options.e1rm ? `<div style="font-size:11px;color:var(--mute);margin-bottom:20px;">e1RM formula: ${esc(formulaName)} · Mode: ${esc(oneRmSource === "fixed" ? "Fixed (vs reference max)" : "Rolling")}</div>` : ""}
  ${clone.innerHTML}
</body>
</html>`;
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
  const [printMenuOpen, setPrintMenuOpen] = useState(false);
  const handlePrint = (style: ReportStyle) => {
    setPrintMenuOpen(false);
    const doc = buildReportDocument(style);
    if (!doc) return;
    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) return;
    printWindow.document.write(doc);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  const [emailOpen, setEmailOpen] = useState(false);
  const [autoEmailDone, setAutoEmailDone] = useState(false);
  useEffect(() => {
    if (initialEmailOpen && !autoEmailDone && !aiLoading && athleteId) {
      setEmailOpen(true);
      setAutoEmailDone(true);
    }
  }, [initialEmailOpen, autoEmailDone, aiLoading, athleteId]);
  const rangeLabel = rangeStart && rangeEnd ? `${fmtRangeDate(rangeStart)} – ${fmtRangeDate(rangeEnd)}` : "All time";

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
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={{ position: "relative" }}>
              <button style={styles.ghostBtn} onClick={() => setPrintMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={printMenuOpen}>
                🖨 Print / PDF ▾
              </button>
              {printMenuOpen && (
                <div style={styles.printMenu} role="menu">
                  <button style={styles.printMenuItem} role="menuitem" onClick={() => handlePrint("white")}>
                    <b>White</b>
                    <span style={styles.printMenuHint}>Print-friendly, saves ink</span>
                  </button>
                  <button style={styles.printMenuItem} role="menuitem" onClick={() => handlePrint("colour")}>
                    <b>Colour</b>
                    <span style={styles.printMenuHint}>Branded - best for PDFs to send</span>
                  </button>
                  <div style={styles.printMenuFoot}>To save a PDF, choose &ldquo;Save as PDF&rdquo; in the print window.</div>
                </div>
              )}
            </div>
            {athleteId && (
              <button style={styles.ghostBtn} onClick={() => setEmailOpen(true)}>
                ✉️ Email report
              </button>
            )}
            <button style={styles.primaryBtnSmall} onClick={handleCopy}>
              📋 Copy
            </button>
            <button style={styles.closeBtn} onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div id="report-content" style={{ padding: 20 }}>
          {hiddenExercises.size > 0 && (
            <div data-no-print="true" style={styles.hiddenBar}>
              <span>Removed from this report:</span>
              {[...hiddenExercises].map((n) => (
                <button key={n} style={styles.hiddenChip} onClick={() => restoreExercise(n)} title="Put back">
                  {n} ↺
                </button>
              ))}
              <button style={styles.hiddenRestoreAll} onClick={() => setHiddenExercises(new Set())}>Restore all</button>
            </div>
          )}
          {!hasStrength && !hasE1rm && !hasHyrox && !hasCardio && !hasPowerSpeed && !hasRpe && !notes.length && (
            <div style={styles.emptyNote}>
              No logged data found in this range. Log weights in strength sessions to generate a
              load report.
            </div>
          )}

          {visual && options.headlineCards !== false && !dismissed.has("headline") && (
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("headline")} />
              <HeadlineCards
                headline={visual.headline}
                previous={visual.previous}
                previousLabel={rangeStart && rangeEnd ? `previous ${Math.round(daySpan(rangeStart, rangeEnd) / 7)} weeks` : null}
              />
            </div>
          )}

          {visual && options.competitions !== false && visual.competitions.length > 0 && !dismissed.has("competitions") && (
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("competitions")} />
              <div data-section-title="true" style={styles.sectionTitle}>Coming Up</div>
              <CompetitionStrip competitions={visual.competitions} />
            </div>
          )}

          {/* Coach's Summary: the three Good / Better / How boxes - AI
              drafts them (with the figures behind each point) when "Draft
              with AI" is on; every box is editable. */}
          {(options.coachVerdict !== false || options.aiSummary) && !dismissed.has("coach-verdict") && (
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("coach-verdict")} />
              <div data-section-title="true" style={styles.sectionTitle}>Coach&apos;s Summary</div>
              <CoachVerdict
                value={verdict}
                loading={aiLoading}
                onChange={(next) => {
                  setVerdict(next);
                  setVerdictEdited(true);
                }}
              />
              {athleteId && !aiLoading && (
                <VerdictAiEdit
                  request={requestVerdictEdit}
                  used={aiEditsUsed}
                  onAccept={(next) => {
                    setVerdict(next);
                    setVerdictEdited(true);
                  }}
                />
              )}
            </div>
          )}

          {visual && options.goalProgress !== false && visual.goals.length > 0 && !dismissed.has("goal-progress") && (
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("goal-progress")} />
              <div data-section-title="true" style={styles.sectionTitle}>Goal Progress</div>
              <GoalProgressList goals={visual.goals} />
            </div>
          )}

          {visual && options.pbWall !== false && visual.pbs.length > 0 && !dismissed.has("pb-wall") && (
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("pb-wall")} />
              <div data-section-title="true" style={styles.sectionTitle}>Personal Bests</div>
              <PBWall pbs={visual.pbs} onHide={hideExercise} />
            </div>
          )}

          {showProgressBars && (
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("progress-bars")} />
              <div style={styles.visualHead}>
                <div data-section-title="true" style={{ ...styles.sectionTitle, marginBottom: 0 }}>Strength Progress</div>
                {metricToggle}
              </div>
              <div style={styles.visualSub}>
                {useE1rm ? "Estimated 1RM" : "Total training load"}, first session in range → latest
              </div>
              <ProgressBars rows={progressRows} unit={visualUnit} decimals={visualDecimals} onHide={hideExercise} />
            </div>
          )}

          {options.smallMultiples !== false && trendSeries.length > 0 && !dismissed.has("small-multiples") && (
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("small-multiples")} />
              <div style={styles.visualHead}>
                <div data-section-title="true" style={{ ...styles.sectionTitle, marginBottom: 0 }}>Exercise Trends</div>
                {!showProgressBars && metricToggle}
              </div>
              <div style={styles.visualSub}>
                Weekly {useE1rm ? "best estimated 1RM" : "training load"} per exercise, each on its own scale
              </div>
              <SmallMultiples series={trendSeries} unit={visualUnit} decimals={visualDecimals} onHide={hideExercise} />
            </div>
          )}

          {visual && options.benchmarks !== false && visual.benchmarks.length > 0 && !dismissed.has("benchmarks") && (
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("benchmarks")} />
              <div data-section-title="true" style={styles.sectionTitle}>Benchmark Workouts</div>
              <div style={styles.visualSub}>The same workout done more than once - first attempt against the latest</div>
              <BenchmarkTables groups={visual.benchmarks} />
            </div>
          )}

          {visual && options.hrZones !== false && visual.hrZones && !dismissed.has("hr-zones") && (
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("hr-zones")} />
              <div data-section-title="true" style={styles.sectionTitle}>Heart-Rate Zones</div>
              <div style={styles.visualSub}>Cardio and hybrid sessions combined</div>
              <HrZoneChart split={visual.hrZones} />
            </div>
          )}

          {visual && options.consistency !== false && visual.days.length > 0 && !dismissed.has("consistency") && (
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("consistency")} />
              <div data-section-title="true" style={styles.sectionTitle}>Consistency</div>
              <ConsistencyCalendar days={visual.days} />
              {visual.weekly.length > 1 && (
                <div style={{ marginTop: 18 }}>
                  <div style={styles.metricSubheading}>Sessions per week</div>
                  <WeeklySessionsChart weekly={visual.weekly} />
                </div>
              )}
            </div>
          )}

          {visual && options.readiness !== false && visual.readiness && !dismissed.has("readiness") && (
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("readiness")} />
              <div data-section-title="true" style={styles.sectionTitle}>Readiness vs Training</div>
              <ReadinessPanel readiness={visual.readiness} />
            </div>
          )}

          {visual && options.adherence !== false && visual.adherence.length > 0 && !dismissed.has("adherence") && (
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("adherence")} />
              <div data-section-title="true" style={styles.sectionTitle}>Skipped &amp; Swapped</div>
              <div style={styles.visualSub}>Programmed exercises in sessions they trained - % is how often each was done as written</div>
              <AdherenceList rows={visual.adherence} onHide={hideExercise} />
            </div>
          )}

          {options.highlights &&
            !showProgressBars &&
            !dismissed.has("highlights") &&
            ((options.ttl && (topProgressed.length > 0 || toReview.length > 0)) ||
              (options.e1rm && (strength.topProgressed.length > 0 || strength.toReview.length > 0))) && (
              <div style={{ marginBottom: 24, position: "relative" }}>
                <DismissBtn onClick={() => dismiss("highlights")} />
                <div data-section-title="true" style={styles.sectionTitle}>Highlights</div>
                {options.ttl && (topProgressed.length > 0 || toReview.length > 0) && (
                  <div style={{ marginBottom: options.e1rm ? 14 : 0 }}>
                    {options.e1rm && <div style={styles.metricSubheading}>Total Training Load</div>}
                    <div style={styles.highlightsGrid}>
                      <div>
                        <div style={styles.highlightHeading}>🚀 Top progressed</div>
                        {topProgressed.length === 0 && <div style={styles.highlightEmpty}>Not enough data yet.</div>}
                        {topProgressed.map((e) => (
                          <div key={e.name} style={styles.highlightRow}>
                            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{e.name}<HideExerciseBtn name={e.name} onHide={hideExercise} /></span>
                            <span style={{ color: pctColor(e.overallPct), fontWeight: 700 }}>{fmtPct(e.overallPct)}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={styles.highlightHeading}>🔍 Worth a review</div>
                        {toReview.length === 0 && <div style={styles.highlightEmpty}>Not enough data yet.</div>}
                        {toReview.map((e) => (
                          <div key={e.name} style={styles.highlightRow}>
                            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{e.name}<HideExerciseBtn name={e.name} onHide={hideExercise} /></span>
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
                            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{e.name}<HideExerciseBtn name={e.name} onHide={hideExercise} /></span>
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
                            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{e.name}<HideExerciseBtn name={e.name} onHide={hideExercise} /></span>
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
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("sessions-completion")} />
              <div data-section-title="true" style={styles.sectionTitle}>Sessions Logged & Completion</div>
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
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("squad-comparison")} />
              <div data-section-title="true" style={styles.sectionTitle}>Squad Comparison</div>
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
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("radar")} />
              <div data-section-title="true" style={styles.sectionTitle}>Radar Snapshot</div>
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
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("line-chart")} />
              <div data-section-title="true" style={styles.sectionTitle}>Trend Over Time</div>
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

          {options.hyroxSessionsList && hasHyrox && !dismissed.has("hyrox-sessions-list") && (
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("hyrox-sessions-list")} />
              <div data-section-title="true" style={styles.sectionTitle}>Hybrid Sessions</div>
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
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("cardio-sessions-list")} />
              <div data-section-title="true" style={styles.sectionTitle}>Cardio Sessions</div>
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
                <div data-section-title="true" style={styles.sectionTitle}>Cardio Metrics</div>
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
                <div data-section-title="true" style={styles.sectionTitle}>Hybrid Metrics</div>
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
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("powerspeed-sessions-list")} />
              <div data-section-title="true" style={styles.sectionTitle}>Power / Speed Sessions</div>
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
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("powerspeed-trends")} />
              <div data-section-title="true" style={styles.sectionTitle}>Power / Speed Trends</div>
              {/* single-entry summaries have nothing to chart - MultiTrendLineChart returns null below 2 points, leaving a label with no chart under it */}
              {powerSpeedSummaries.filter((ex) => ex.entries.length >= 2).map((ex) => (
                <div key={ex.name} style={{ marginBottom: 16 }}>
                  <div style={styles.metricSubheading}>
                    {ex.name}
                    <HideExerciseBtn name={ex.name} onHide={hideExercise} />
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
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("barspeed-trends")} />
              <div data-section-title="true" style={styles.sectionTitle}>Velocity Based Training</div>
              {velocitySummaries.filter((ex) => ex.entries.length >= 2).map((ex) => (
                <div key={ex.name} style={{ marginBottom: 16 }}>
                  <div style={styles.metricSubheading}>
                    {ex.name}
                    <HideExerciseBtn name={ex.name} onHide={hideExercise} />
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
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("session-rpe")} />
              <div data-section-title="true" style={{ ...styles.sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
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
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("training-load")} />
              <div data-section-title="true" style={styles.sectionTitle}>Training Load (sRPE)</div>
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
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("load-monitoring")} />
              <div data-section-title="true" style={styles.sectionTitle}>Training Load &amp; Availability</div>

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
            <div style={{ marginBottom: SECTION_GAP, position: "relative" }}>
              <DismissBtn onClick={() => dismiss("athlete-notes")} />
              <div data-section-title="true" style={styles.sectionTitle}>Athlete Notes</div>
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

          {/* Per-exercise tables: the detail behind the charts above.
              Collapsed by default so the report leads with the visuals;
              Print includes them only when expanded. */}
          {((options.loadProgression && ((options.ttl && hasStrength) || (options.e1rm && hasE1rm))) ||
            (options.ttl && hasStrength) ||
            (options.e1rm && hasE1rm)) && (
            <div style={{ marginBottom: SECTION_GAP }}>
              {/* The tick box never prints; the "Full detail" heading and
                  tables only appear on the report when it's ticked. */}
              <label data-no-print="true" style={styles.detailTick}>
                <input type="checkbox" checked={detailOpen} onChange={(e) => setDetailOpen(e.target.checked)} />
                Include full detail - session-by-session tables for every exercise
              </label>
              {detailOpen && (
                <div style={styles.detailHead}>
                  <div data-section-title="true" style={{ ...styles.sectionTitle, marginBottom: 0 }}>Full detail</div>
                </div>
              )}
              {detailOpen && (
                <div style={{ marginTop: 14 }}>
            {options.loadProgression && options.ttl && hasStrength && !dismissed.has("load-progression-ttl") && (
              <div style={{ marginBottom: 24, position: "relative" }}>
                <DismissBtn onClick={() => dismiss("load-progression-ttl")} />
                <div data-section-title="true" style={styles.sectionTitle}>Load Progression{options.e1rm ? " - TTL" : ""}</div>
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
                            <td style={styles.td}>{e.name} <HideExerciseBtn name={e.name} onHide={hideExercise} /></td>
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
                <div data-section-title="true" style={styles.sectionTitle}>Load Progression - e1RM</div>
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
                              <HideExerciseBtn name={e.name} onHide={hideExercise} />
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
                  <div data-section-title="true" style={{ ...styles.sectionTitle, marginBottom: 0 }}>
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
                            <HideExerciseBtn name={exName} onHide={hideExercise} />
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
                        <div style={styles.exTitle}>{exName} <HideExerciseBtn name={exName} onHide={hideExercise} /></div>
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
                  <div data-section-title="true" style={{ ...styles.sectionTitle, marginBottom: 0 }}>
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
                            <HideExerciseBtn name={exName} onHide={hideExercise} />
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
                        <div style={styles.exTitle}>{exName} <HideExerciseBtn name={exName} onHide={hideExercise} /></div>
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
                </div>
              )}
            </div>
          )}

          <div style={styles.credit}>
            <span style={styles.creditMark}>VIS BUILD</span>
            <span>{REPORT_CREDIT_TEXT}</span>
          </div>
        </div>
        {emailOpen && athleteId && (
          <EmailReportDialog
            athleteId={athleteId}
            athleteName={athleteName}
            savedEmail={athleteEmail ?? null}
            rangeLabel={rangeLabel}
            summary={visual?.headline ?? null}
            buildHtml={buildReportDocument}
            onSavedEmail={onAthleteEmailSaved}
            onShared={onShared}
            onClose={() => setEmailOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

// Space between report sections (screen and print).
const SECTION_GAP = 40;

const styles: Record<string, React.CSSProperties> = {
  printMenu: { position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 20, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 6, width: 250, boxShadow: "0 12px 32px rgba(0,0,0,.35)" },
  printMenuItem: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, width: "100%", background: "transparent", border: "none", color: "var(--text)", borderRadius: 8, padding: "9px 10px", fontSize: 13, textAlign: "left", cursor: "pointer" },
  printMenuHint: { fontSize: 11, color: "var(--mute)", fontWeight: 400 },
  printMenuFoot: { fontSize: 11, color: "var(--mute)", padding: "6px 10px 4px", borderTop: "1px solid var(--line)", marginTop: 4 },
  visualHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4, paddingRight: 28 },
  visualSub: { fontSize: 12, color: "var(--mute)", marginBottom: 12 },
  detailHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" },
  hiddenBar: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 12, color: "var(--mute)", background: "var(--panel)", border: "1px dashed var(--line)", borderRadius: 10, padding: "8px 10px", marginBottom: 16 },
  hiddenChip: { background: "transparent", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 999, padding: "3px 10px", fontSize: 12, cursor: "pointer" },
  hiddenRestoreAll: { background: "none", border: "none", color: "var(--accent)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "3px 4px" },
  detailTick: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--mute)", cursor: "pointer", borderTop: "1px solid var(--line)", paddingTop: 14, marginBottom: 10 },
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
    whiteSpace: "nowrap",
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
    whiteSpace: "nowrap",
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
