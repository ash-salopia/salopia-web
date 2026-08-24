"use client";

// Shared "dedicated metric boxes" row - one input per tracked metric,
// identical across the coach builder, athlete app, and Live Group so
// a squad cardio session logs the same clean fields everywhere. Only
// renders boxes for metrics actually ticked on in tracked_metrics.

import { METRIC_META, METRIC_ORDER, type MetricKey, type MetricValues } from "@/lib/cardio-metrics";

export function MetricToggles({
  tracked,
  onChange,
}: {
  tracked: MetricKey[];
  onChange: (next: MetricKey[]) => void;
}) {
  const set = new Set(tracked);
  return (
    <div style={s.toggleRow}>
      {METRIC_ORDER.map((key) => {
        const on = set.has(key);
        return (
          <label key={key} style={s.toggleChip}>
            <input
              type="checkbox"
              checked={on}
              onChange={() => {
                const next = new Set(set);
                if (on) next.delete(key); else next.add(key);
                onChange(METRIC_ORDER.filter((k) => next.has(k)));
              }}
              style={{ accentColor: "var(--accent)" }}
            />
            <span style={{ color: on ? "var(--accent)" : "var(--mute)" }}>{METRIC_META[key].label}</span>
          </label>
        );
      })}
    </div>
  );
}

export function MetricBoxes({
  tracked,
  values,
  onChange,
  size = "normal",
}: {
  tracked: MetricKey[];
  values: MetricValues;
  onChange: (next: MetricValues) => void;
  size?: "normal" | "compact";
}) {
  if (!tracked.length) return null;
  return (
    <div style={s.boxRow}>
      {tracked.map((key) => {
        const meta = METRIC_META[key];
        return (
          <div key={key} style={size === "compact" ? s.boxCompact : s.box}>
            <div style={s.boxLabel}>{meta.label}{meta.unit ? ` (${meta.unit})` : ""}</div>
            <input
              value={values[key] ?? ""}
              onChange={(e) => onChange({ ...values, [key]: e.target.value })}
              placeholder={meta.placeholder}
              inputMode="decimal"
              style={s.boxInput}
            />
          </div>
        );
      })}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  toggleRow: { display: "flex", flexWrap: "wrap" as const, gap: 10, marginBottom: 8 },
  toggleChip: { display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, cursor: "pointer" },
  boxRow: { display: "flex", flexWrap: "wrap" as const, gap: 8 },
  box: { minWidth: 90, flex: "1 1 90px" },
  boxCompact: { minWidth: 72, flex: "1 1 72px" },
  boxLabel: { fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.03em", marginBottom: 3 },
  boxInput: { width: "100%", boxSizing: "border-box" as const, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 7, padding: "7px 9px", fontSize: 13 },
};
