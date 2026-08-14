"use client";

// Metric/component selection form - extracted from ReportRangeModal.tsx so
// the bulk Reporting tab can reuse the identical checkbox UI instead of
// duplicating it. disableCharts hides sparkline/radar/line-chart (not
// supported in the bulk PDF export - only on the single-athlete on-screen
// report), showing a note instead of just silently omitting them.

import { METRIC_FIELDS, COMPONENT_FIELDS, SCOPE_FIELDS, type ReportOptions } from "@/lib/report-options";

export default function ReportOptionsForm({
  options,
  onChange,
  disableCharts = false,
}: {
  options: ReportOptions;
  onChange: (next: ReportOptions) => void;
  disableCharts?: boolean;
}) {
  const hasMetric = options.ttl || options.e1rm;
  const set = <K extends keyof ReportOptions>(key: K, value: ReportOptions[K]) =>
    onChange({ ...options, [key]: value });

  const CHART_KEYS = new Set(["sparkline", "radar", "lineChart"]);

  return (
    <>
      <div style={s.sectionLabel}>Metrics to include</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
        {METRIC_FIELDS.map((f) => (
          <label key={f.key} style={s.checkOption}>
            <input
              type="checkbox"
              checked={options[f.key]}
              onChange={(e) => set(f.key, e.target.checked)}
              style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
            />
            <span>
              <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>{f.label}</span>
              <span style={{ fontSize: 11, color: "var(--mute)" }}>{f.hint}</span>
            </span>
          </label>
        ))}
        {!hasMetric && <div style={s.warnText}>Select at least one metric to generate a report.</div>}
      </div>

      <div style={s.sectionLabel}>Display components</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
        {COMPONENT_FIELDS.map((f) => {
          const isChart = CHART_KEYS.has(f.key as string);
          const disabled = disableCharts && isChart;
          return (
            <label key={f.key} style={{ ...s.checkOption, opacity: disabled ? 0.45 : 1 }}>
              <input
                type="checkbox"
                checked={disabled ? false : (options[f.key] as boolean)}
                disabled={disabled}
                onChange={(e) => set(f.key as keyof ReportOptions, e.target.checked as any)}
                style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
              />
              <span>
                <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>{f.label}</span>
                <span style={{ fontSize: 11, color: "var(--mute)" }}>
                  {disabled ? "Not available in PDF exports - view online for charts" : f.hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div style={{ ...s.sectionLabel, opacity: options.aiSummary ? 1 : 0.5 }}>Context for AI summary</div>
      <div style={{ marginBottom: 16, opacity: options.aiSummary ? 1 : 0.5, pointerEvents: options.aiSummary ? "auto" : "none" }}>
        <div style={{ ...s.fieldLabel, marginBottom: 6 }}>
          Anything the AI should factor in - e.g. &quot;returning from hamstring injury&quot;, so a jump in leg
          e1RM reads as recovery, not just progress
        </div>
        <textarea
          value={options.coachContext}
          disabled={!options.aiSummary}
          onChange={(e) => set("coachContext", e.target.value.slice(0, 500))}
          placeholder="Optional - e.g. returning from injury, competition taper, illness…"
          maxLength={500}
          style={{ ...s.input, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
        />
      </div>

      <div style={{ ...s.sectionLabel, opacity: options.e1rm ? 1 : 0.5 }}>e1RM options</div>
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
        <label style={s.checkOption}>
          <input
            type="checkbox"
            checked={options.bodyweightRelative}
            disabled={!options.e1rm}
            onChange={(e) => set("bodyweightRelative", e.target.checked)}
            style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
          />
          <span>
            <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>Bodyweight-relative</span>
            <span style={{ fontSize: 11, color: "var(--mute)" }}>Show e1RM ÷ bodyweight instead of raw kg</span>
          </span>
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={s.fieldLabel}>Exercise limit (radar/chart)</div>
            <input
              type="number"
              min={1}
              max={20}
              value={options.exerciseLimit}
              disabled={!options.e1rm}
              onChange={(e) => set("exerciseLimit", parseInt(e.target.value) || 1)}
              style={s.input}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={s.fieldLabel}>Low-confidence rep cap</div>
            <input
              type="number"
              min={1}
              max={30}
              value={options.lowConfidenceCap}
              disabled={!options.e1rm}
              onChange={(e) => set("lowConfidenceCap", parseInt(e.target.value) || 1)}
              style={s.input}
            />
          </div>
        </div>
      </div>

      <div style={s.sectionLabel}>Scope</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
        {SCOPE_FIELDS.map((f) => (
          <label key={f.key} style={s.checkOption}>
            <input
              type="checkbox"
              checked={options[f.key] as boolean}
              onChange={(e) => set(f.key as keyof ReportOptions, e.target.checked as any)}
              style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
            />
            <span>
              <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>{f.label}</span>
              <span style={{ fontSize: 11, color: "var(--mute)" }}>{f.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
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
};
