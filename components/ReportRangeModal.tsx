"use client";

import { useState } from "react";
import { todayISO, addDaysISO } from "@/lib/date-utils";

type RangeMode = "4w" | "8w" | "12w" | "all" | "custom";

export interface ReportOptions {
  // Metrics - at least one required to generate.
  ttl: boolean; // Total Training Load (tonnage)
  e1rm: boolean; // Estimated 1RM (strength)
  // Per-metric display components - apply to whichever metric(s) above are ticked.
  loadProgression: boolean; // progression table: first/latest/delta/% change per exercise
  highlights: boolean; // top 3 progressed / 3 to review, ranked independently per metric
  sparkline: boolean; // mini-trend per row
  radar: boolean; // Week 1 vs latest snapshot, normalised to % of baseline
  lineChart: boolean; // per-exercise value-over-time chart
  aiSummary: boolean; // AI overview + recurring-notes-themes paragraphs
  coachContext: string; // free-text context fed to the AI summary only (e.g. "returning from hamstring injury") - never shown on the report itself
  athleteNotes: boolean; // raw athlete notes list
  // e1RM-only options - only meaningful (and only enabled in the UI) when e1rm is ticked.
  bodyweightRelative: boolean; // show e1RM ÷ bodyweight instead of raw kg
  exerciseLimit: number; // cap on exercises shown in radar/line chart
  lowConfidenceCap: number; // rep count above which an e1RM estimate is flagged low-confidence
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  ttl: true,
  e1rm: false,
  loadProgression: true,
  highlights: true,
  sparkline: false,
  radar: false,
  lineChart: false,
  aiSummary: true,
  coachContext: "",
  athleteNotes: false,
  bodyweightRelative: false,
  exerciseLimit: 8,
  lowConfidenceCap: 12,
};

const METRIC_FIELDS: { key: "ttl" | "e1rm"; label: string; hint: string }[] = [
  { key: "ttl", label: "Total Training Load (TTL)", hint: "Total tonnage - sets × reps × weight" },
  { key: "e1rm", label: "Estimated 1RM (e1RM)", hint: "Strength progression, independent of volume" },
];

const COMPONENT_FIELDS: { key: keyof ReportOptions; label: string; hint: string }[] = [
  { key: "aiSummary", label: "AI summary", hint: "Short AI overview + recurring themes from notes, at the top" },
  { key: "highlights", label: "Highlights", hint: "Top 3 progressed exercises, 3 to review - per metric selected" },
  { key: "loadProgression", label: "Progression table", hint: "First / latest / Δ / % change per exercise" },
  { key: "sparkline", label: "Sparklines", hint: "Small mini-trend chart per exercise row" },
  { key: "radar", label: "Radar snapshot", hint: "Week 1 vs latest, normalised across exercises" },
  { key: "lineChart", label: "Line chart over time", hint: "Per-exercise trend, plotted by week" },
];

const SCOPE_FIELDS: { key: keyof ReportOptions; label: string; hint: string }[] = [
  { key: "athleteNotes", label: "Athlete notes", hint: "Raw list of the athlete's own session/exercise notes" },
];

export default function ReportRangeModal({
  athleteName,
  onGenerate,
  onClose,
}: {
  athleteName: string;
  onGenerate: (start: string | null, end: string | null, options: ReportOptions) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<RangeMode>("4w");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [options, setOptions] = useState<ReportOptions>(DEFAULT_REPORT_OPTIONS);

  const presets: { key: RangeMode; label: string }[] = [
    { key: "4w", label: "Last 4 weeks" },
    { key: "8w", label: "Last 8 weeks" },
    { key: "12w", label: "Last 12 weeks" },
    { key: "all", label: "All time" },
    { key: "custom", label: "Custom range" },
  ];

  const hasMetric = options.ttl || options.e1rm;
  const canGenerate = hasMetric && (mode !== "custom" || (customStart && customEnd && customEnd >= customStart));

  const handleGenerate = () => {
    if (mode === "all") {
      onGenerate(null, null, options);
      return;
    }
    if (mode === "custom") {
      if (!canGenerate) return;
      onGenerate(customStart, customEnd, options);
      return;
    }
    const weeks = mode === "4w" ? 4 : mode === "8w" ? 8 : 12;
    const end = todayISO();
    const start = addDaysISO(end, -weeks * 7);
    onGenerate(start, end, options);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.headerRow}>
          <div style={styles.title}>Reports{athleteName ? ` - ${athleteName}` : ""}</div>
          <button style={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>
        <div style={styles.scrollBody}>
        <div style={styles.helpText}>Choose how far back this report should cover.</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: mode === "custom" ? 12 : 16 }}>
          {presets.map((p) => (
            <label
              key={p.key}
              style={{
                ...styles.option,
                borderColor: mode === p.key ? "var(--accent)" : "var(--line)",
                background: mode === p.key ? "var(--accent-dim)" : "transparent",
              }}
            >
              <input
                type="radio"
                checked={mode === p.key}
                onChange={() => setMode(p.key)}
                style={{ accentColor: "var(--accent)" }}
              />
              <span style={{ fontWeight: 600, color: mode === p.key ? "var(--accent)" : "var(--text)" }}>
                {p.label}
              </span>
            </label>
          ))}
        </div>

        {mode === "custom" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={styles.fieldLabel}>From</div>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={styles.fieldLabel}>To</div>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={styles.input}
              />
            </div>
          </div>
        )}

        <div style={styles.sectionLabel}>Metrics to include</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
          {METRIC_FIELDS.map((f) => (
            <label key={f.key} style={styles.checkOption}>
              <input
                type="checkbox"
                checked={options[f.key]}
                onChange={(e) => setOptions((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
              />
              <span>
                <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>{f.label}</span>
                <span style={{ fontSize: 11, color: "var(--mute)" }}>{f.hint}</span>
              </span>
            </label>
          ))}
          {!hasMetric && <div style={styles.warnText}>Select at least one metric to generate a report.</div>}
        </div>

        <div style={styles.sectionLabel}>Display components</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
          {COMPONENT_FIELDS.map((f) => (
            <label key={f.key} style={styles.checkOption}>
              <input
                type="checkbox"
                checked={options[f.key] as boolean}
                onChange={(e) => setOptions((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
              />
              <span>
                <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>{f.label}</span>
                <span style={{ fontSize: 11, color: "var(--mute)" }}>{f.hint}</span>
              </span>
            </label>
          ))}
        </div>

        <div style={{ ...styles.sectionLabel, opacity: options.aiSummary ? 1 : 0.5 }}>Context for AI summary</div>
        <div style={{ marginBottom: 16, opacity: options.aiSummary ? 1 : 0.5, pointerEvents: options.aiSummary ? "auto" : "none" }}>
          <div style={{ ...styles.fieldLabel, marginBottom: 6 }}>
            Anything the AI should factor in - e.g. &quot;returning from hamstring injury&quot;, so a jump in leg e1RM reads as recovery, not just progress
          </div>
          <textarea
            value={options.coachContext}
            disabled={!options.aiSummary}
            onChange={(e) => setOptions((prev) => ({ ...prev, coachContext: e.target.value.slice(0, 500) }))}
            placeholder="Optional - e.g. returning from injury, competition taper, illness…"
            maxLength={500}
            style={{ ...styles.input, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        <div style={{ ...styles.sectionLabel, opacity: options.e1rm ? 1 : 0.5 }}>e1RM options</div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 16,
            opacity: options.e1rm ? 1 : 0.5,
            pointerEvents: options.e1rm ? "auto" : "none",
          }}
        >
          <label style={styles.checkOption}>
            <input
              type="checkbox"
              checked={options.bodyweightRelative}
              disabled={!options.e1rm}
              onChange={(e) => setOptions((prev) => ({ ...prev, bodyweightRelative: e.target.checked }))}
              style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
            />
            <span>
              <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>Bodyweight-relative</span>
              <span style={{ fontSize: 11, color: "var(--mute)" }}>Show e1RM ÷ bodyweight instead of raw kg</span>
            </span>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={styles.fieldLabel}>Exercise limit (radar/chart)</div>
              <input
                type="number"
                min={1}
                max={20}
                value={options.exerciseLimit}
                disabled={!options.e1rm}
                onChange={(e) => setOptions((prev) => ({ ...prev, exerciseLimit: parseInt(e.target.value) || 1 }))}
                style={styles.input}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={styles.fieldLabel}>Low-confidence rep cap</div>
              <input
                type="number"
                min={1}
                max={30}
                value={options.lowConfidenceCap}
                disabled={!options.e1rm}
                onChange={(e) => setOptions((prev) => ({ ...prev, lowConfidenceCap: parseInt(e.target.value) || 1 }))}
                style={styles.input}
              />
            </div>
          </div>
        </div>

        <div style={styles.sectionLabel}>Scope</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
          {SCOPE_FIELDS.map((f) => (
            <label key={f.key} style={styles.checkOption}>
              <input
                type="checkbox"
                checked={options[f.key] as boolean}
                onChange={(e) => setOptions((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
              />
              <span>
                <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>{f.label}</span>
                <span style={{ fontSize: 11, color: "var(--mute)" }}>{f.hint}</span>
              </span>
            </label>
          ))}
        </div>
        </div>

        <div style={styles.footer}>
          <button
            disabled={!canGenerate}
            style={{ ...styles.primaryBtn, opacity: canGenerate ? 1 : 0.5 }}
            onClick={handleGenerate}
          >
            Generate report
          </button>
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
    alignItems: "center",
    justifyContent: "center",
    zIndex: 60,
    padding: 16,
  },
  modal: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 16,
    width: "100%",
    maxWidth: 380,
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 20px 10px",
    flexShrink: 0,
  },
  scrollBody: { overflowY: "auto", padding: "0 20px 4px" },
  footer: {
    flexShrink: 0,
    padding: 16,
    borderTop: "1px solid var(--line)",
  },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700 },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 20, cursor: "pointer" },
  helpText: { fontSize: 12, color: "var(--mute)", marginBottom: 12 },
  option: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 10px",
    borderRadius: 8,
    border: "1px solid",
    cursor: "pointer",
  },
  fieldLabel: { fontSize: 11, color: "var(--mute)", marginBottom: 4 },
  warnText: { fontSize: 11, color: "#ff7d7d", padding: "4px 2px" },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 },
  checkOption: { display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 2px", cursor: "pointer" },
  input: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
  },
  primaryBtn: {
    width: "100%",
    background: "var(--accent)",
    color: "#0a1420",
    border: "none",
    borderRadius: 10,
    padding: "12px 0",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
};
