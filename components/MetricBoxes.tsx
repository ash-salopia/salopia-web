"use client";

// Shared "dedicated metric boxes" row - one input per tracked metric,
// identical across the coach builder, athlete app, and Live Group so
// a squad cardio session logs the same clean fields everywhere. Only
// renders boxes for metrics actually ticked on in tracked_metrics.

import { useState } from "react";
import { METRIC_META, METRIC_ORDER, type MetricKey, type MetricValues, type DistanceUnit } from "@/lib/cardio-metrics";

const DISTANCE_UNITS: DistanceUnit[] = ["m", "km", "mi"];

// Shows only the "key" metrics as checkboxes up front, with the rest
// tucked behind a "+ More" toggle - a Cardio/Hyrox exercise can have up
// to 13 trackable metrics, and showing every checkbox for every
// exercise in a multi-step session was a wall of clutter. `keyMetrics`
// (from LibraryEntry.default_key_metrics, resolved per-instance via
// resolveKeyMetrics) decides what counts as "key"; when it's empty
// (custom-typed exercise, no library match) this falls back to the
// first 5 of whatever's available, so decluttering still works with
// zero extra config. A metric that's ticked on but not "key" (e.g. an
// older session, or a coach ticking something from the library-default
// key set) keeps "More" auto-expanded so it never hides a value that's
// actually in use (0076).
export function MetricToggles({
  tracked,
  onChange,
  available,
  keyMetrics,
}: {
  tracked: MetricKey[];
  onChange: (next: MetricKey[]) => void;
  available?: MetricKey[]; // restricts which metrics can be ticked (e.g. by equipment type) - defaults to every metric
  keyMetrics?: MetricKey[]; // shown by default, before "More" - defaults to the first 5 of `available`
}) {
  const [showMore, setShowMore] = useState(false);
  const set = new Set(tracked);
  const options = available ? METRIC_ORDER.filter((k) => available.includes(k)) : METRIC_ORDER;
  const keySource = keyMetrics && keyMetrics.length ? keyMetrics : options.slice(0, 5);
  const keySet = new Set(keySource.filter((k) => options.includes(k)));
  const primary = options.filter((k) => keySet.has(k));
  const rest = options.filter((k) => !keySet.has(k));
  const hasHiddenActive = rest.some((k) => set.has(k));
  const expanded = showMore || hasHiddenActive;

  const renderChip = (key: MetricKey) => {
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
  };

  return (
    <div>
      <div style={s.toggleRow}>
        {primary.map(renderChip)}
        {rest.length > 0 && (
          <button type="button" onClick={() => setShowMore((v) => !v)} style={s.moreBtn}>
            {expanded ? "− Less" : `+ More (${rest.length})`}
          </button>
        )}
      </div>
      {expanded && rest.length > 0 && (
        <div style={{ ...s.toggleRow, ...s.moreRow }}>{rest.map(renderChip)}</div>
      )}
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
  moreBtn: {
    background: "transparent", border: "1px solid var(--line)", color: "var(--mute)",
    borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer",
  },
  moreRow: {
    marginTop: -4, marginBottom: 8, paddingLeft: 8, borderLeft: "2px solid var(--line)",
  },
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
