"use client";

// Create/edit form for a Challenge - mirrors LibraryEntryForm.tsx's shape
// (same editorPane/FieldRow pattern) since it's the same "single entity,
// a handful of fields, inline side-panel form" shape as a library entry.

import { useState } from "react";
import type { Challenge } from "@/lib/data/challenges";
import {
  EQUIPMENT_ORDER, EQUIPMENT_META, METRIC_META, LOWER_IS_BETTER_METRICS, metricsForEquipment,
  type MetricKey, type EquipmentType,
} from "@/lib/cardio-metrics";

export default function ChallengeForm({
  challenge,
  onSave,
  onClose,
}: {
  challenge: Challenge | null;
  onSave: (values: {
    name: string;
    equipment: EquipmentType | null;
    metric_key: MetricKey;
    duration_cap_seconds: number | null;
    direction: "higher" | "lower";
    is_saved: boolean;
  }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(challenge?.name ?? "");
  const [equipment, setEquipment] = useState<EquipmentType | null>(challenge?.equipment ?? null);
  const [metricKey, setMetricKey] = useState<MetricKey | null>(challenge?.metric_key ?? null);
  const [durationCap, setDurationCap] = useState(challenge?.duration_cap_seconds?.toString() ?? "");
  const [direction, setDirection] = useState<"higher" | "lower">(challenge?.direction ?? "higher");
  const [directionTouched, setDirectionTouched] = useState(!!challenge); // editing an existing one - don't override its stored direction on metric change
  const [isSaved, setIsSaved] = useState(challenge?.is_saved ?? true);

  const availableMetrics = metricsForEquipment(equipment ?? undefined);

  const handleEquipmentChange = (next: EquipmentType | null) => {
    setEquipment(next);
    // Picking equipment may narrow the metric list out from under the
    // current pick - clear it rather than leave an invalid selection,
    // same "reset what no longer applies" reasoning as Library's form.
    const stillValid = metricKey && metricsForEquipment(next ?? undefined).includes(metricKey);
    if (!stillValid) setMetricKey(null);
  };

  const handleMetricChange = (key: MetricKey) => {
    setMetricKey(key);
    if (!directionTouched) setDirection(LOWER_IS_BETTER_METRICS.includes(key) ? "lower" : "higher");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !metricKey) return;
    onSave({
      name: name.trim(),
      equipment,
      metric_key: metricKey,
      duration_cap_seconds: durationCap.trim() ? parseInt(durationCap, 10) || null : null,
      direction,
      is_saved: isSaved,
    });
  };

  return (
    <form onSubmit={handleSubmit} style={s.editorPane}>
      <div style={s.headerRow}>
        <h2 style={s.editorTitle}>{challenge ? "Edit challenge" : "New challenge"}</h2>
        <button type="button" style={s.closeBtn} onClick={onClose}>
          ×
        </button>
      </div>
      <FieldRow label="Name">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. SkiErg 30 Second Sprint"
          style={s.input}
        />
      </FieldRow>
      <FieldRow label="Equipment">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={() => handleEquipmentChange(null)} style={pillStyle(equipment === null)}>
            None
          </button>
          {EQUIPMENT_ORDER.filter((eq) => eq !== "other").map((eq) => (
            <button key={eq} type="button" onClick={() => handleEquipmentChange(eq)} style={pillStyle(equipment === eq)}>
              {EQUIPMENT_META[eq].label}
            </button>
          ))}
        </div>
      </FieldRow>
      <FieldRow label="Metric to rank by">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {availableMetrics.map((key) => (
            <button key={key} type="button" onClick={() => handleMetricChange(key)} style={pillStyle(metricKey === key)}>
              {METRIC_META[key].label}
            </button>
          ))}
        </div>
        {!metricKey && <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 4 }}>Pick one metric - this is what the leaderboard ranks on.</div>}
      </FieldRow>
      <FieldRow label="Duration cap (seconds) - optional">
        <input
          value={durationCap}
          onChange={(e) => setDurationCap(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="e.g. 30"
          style={s.input}
        />
        <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 4 }}>
          Describes the task (e.g. "furthest in 30 seconds") - not itself ranked. Leave blank for tasks
          like "fastest 500m" where the metric to rank by is already the time/duration.
        </div>
      </FieldRow>
      <FieldRow label="Ranking direction">
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={() => { setDirection("higher"); setDirectionTouched(true); }} style={pillStyle(direction === "higher")}>
            Higher is better
          </button>
          <button type="button" onClick={() => { setDirection("lower"); setDirectionTouched(true); }} style={pillStyle(direction === "lower")}>
            Lower is better
          </button>
        </div>
      </FieldRow>
      <FieldRow label="Reuse">
        <label style={s.checkRow}>
          <input type="checkbox" checked={isSaved} onChange={(e) => setIsSaved(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
          <span style={{ color: isSaved ? "var(--accent)" : "var(--text)" }}>Save as a reusable challenge</span>
        </label>
        <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 4 }}>
          Off keeps this as a one-off - still logged and ranked, just not shown in the reusable picker later.
        </div>
      </FieldRow>
      <button type="submit" style={{ ...s.primaryBtn, opacity: name.trim() && metricKey ? 1 : 0.5 }} disabled={!name.trim() || !metricKey}>
        Save
      </button>
    </form>
  );
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "var(--accent-dim)" : "var(--ink)",
    border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
    color: active ? "var(--accent)" : "var(--mute)",
    borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
  };
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12, flex: 1 }}>
      <div style={s.fieldLabel}>{label}</div>
      {children}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  editorPane: {
    width: 320,
    flexShrink: 0,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: 16,
    height: "fit-content",
    maxHeight: "min(85vh, 720px)",
    overflowY: "auto" as const,
  },
  headerRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16,
    position: "sticky" as const, top: -16, background: "var(--panel)", paddingTop: 16, marginTop: -16, zIndex: 1,
  },
  editorTitle: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, margin: 0 },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer" },
  input: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
  },
  fieldLabel: { fontSize: 11, color: "var(--mute)", marginBottom: 4, fontWeight: 600 },
  checkRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" },
  primaryBtn: {
    background: "var(--accent)",
    color: "#0a1420",
    border: "none",
    borderRadius: 10,
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
};
