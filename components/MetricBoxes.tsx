"use client";

// Shared "dedicated metric boxes" row - one input per tracked metric,
// identical across the coach builder, athlete app, and Live Group so
// a squad cardio session logs the same clean fields everywhere. Only
// renders boxes for metrics actually ticked on in tracked_metrics.

import { METRIC_META, METRIC_ORDER, type MetricKey, type MetricValues, type DistanceUnit } from "@/lib/cardio-metrics";

const DISTANCE_UNITS: DistanceUnit[] = ["m", "km", "mi"];

export function MetricToggles({
  tracked,
  onChange,
  available,
}: {
  tracked: MetricKey[];
  onChange: (next: MetricKey[]) => void;
  available?: MetricKey[]; // restricts which metrics can be ticked (e.g. by equipment type) - defaults to every metric
}) {
  const set = new Set(tracked);
  const options = available ? METRIC_ORDER.filter((k) => available.includes(k)) : METRIC_ORDER;
  return (
    <div style={s.toggleRow}>
      {options.map((key) => {
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

// All 3 distance units shown at once, active one in green - used both
// inline on a distance box (per-entry override) and standalone in the
// builder (coach presets which unit a fresh box should start on).
export function DistanceUnitPills({ value, onChange }: { value: DistanceUnit; onChange: (next: DistanceUnit) => void }) {
  return (
    <span style={s.unitPillRow}>
      {DISTANCE_UNITS.map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => onChange(u)}
          style={{ ...s.unitPill, ...(value === u ? s.unitPillActive : {}) }}
        >
          {u}
        </button>
      ))}
    </span>
  );
}

export function MetricBoxes({
  tracked,
  values,
  onChange,
  size = "normal",
  defaultDistanceUnit,
}: {
  tracked: MetricKey[];
  values: MetricValues;
  onChange: (next: MetricValues) => void;
  size?: "normal" | "compact";
  // Coach-preset starting unit for a fresh (not-yet-touched) distance
  // box, set in the builder - see DistanceUnitPills there. Only applies
  // until the box's own values.distance_unit is set, same as any other
  // default.
  defaultDistanceUnit?: DistanceUnit;
}) {
  if (!tracked.length) return null;
  // Distance is the one metric where the natural unit varies by context
  // - a 500m interval rep vs a 10km/6mi continuous run - so its unit is
  // a per-box toggle (stored alongside the value, see MetricValues)
  // rather than the fixed unit every other metric has.
  const distanceUnit: DistanceUnit = values.distance_unit ?? defaultDistanceUnit ?? "km";
  return (
    <div style={s.boxRow}>
      {tracked.map((key) => {
        const meta = METRIC_META[key];
        const isDistance = key === "distance";
        return (
          <div key={key} style={size === "compact" ? s.boxCompact : s.box}>
            <div style={s.boxLabelRow}>
              <div style={s.boxLabel}>{meta.label}</div>
              {isDistance
                ? <DistanceUnitPills value={distanceUnit} onChange={(u) => onChange({ ...values, distance_unit: u })} />
                : (meta.unit && <div style={s.boxUnit}>({meta.unit})</div>)}
            </div>
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
  boxLabelRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginBottom: 3, flexWrap: "wrap" as const },
  boxLabel: { fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.03em" },
  boxUnit: { fontSize: 10, fontWeight: 700, color: "var(--mute)" },
  unitPillRow: { display: "flex", gap: 2 },
  unitPill: {
    background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)",
    borderRadius: 4, padding: "1px 5px", fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const,
    cursor: "pointer", lineHeight: 1.4,
  },
  unitPillActive: { background: "var(--good-dim)", borderColor: "var(--good)", color: "var(--good)" },
  boxInput: { width: "100%", boxSizing: "border-box" as const, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 7, padding: "7px 9px", fontSize: 13 },
};
