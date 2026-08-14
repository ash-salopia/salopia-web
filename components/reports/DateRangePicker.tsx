"use client";

// Date-range preset picker - extracted from ReportRangeModal.tsx so the
// bulk Reporting tab can reuse the identical UI without duplicating it.

import type { ReportRangeMode } from "@/lib/date-utils";

const PRESETS: { key: ReportRangeMode; label: string }[] = [
  { key: "4w", label: "Last 4 weeks" },
  { key: "8w", label: "Last 8 weeks" },
  { key: "12w", label: "Last 12 weeks" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom range" },
];

export default function DateRangePicker({
  mode,
  onModeChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
}: {
  mode: ReportRangeMode;
  onModeChange: (mode: ReportRangeMode) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (v: string) => void;
  onCustomEndChange: (v: string) => void;
}) {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: mode === "custom" ? 12 : 16 }}>
        {PRESETS.map((p) => (
          <label
            key={p.key}
            style={{
              ...s.option,
              borderColor: mode === p.key ? "var(--accent)" : "var(--line)",
              background: mode === p.key ? "var(--accent-dim)" : "transparent",
            }}
          >
            <input
              type="radio"
              checked={mode === p.key}
              onChange={() => onModeChange(p.key)}
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
            <div style={s.fieldLabel}>From</div>
            <input
              type="date"
              value={customStart}
              onChange={(e) => onCustomStartChange(e.target.value)}
              style={s.input}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={s.fieldLabel}>To</div>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => onCustomEndChange(e.target.value)}
              style={s.input}
            />
          </div>
        </div>
      )}
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
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
