"use client";

// ============================================================
// SessionRPEBlock
// End-of-session RPE (rate of perceived exertion, 1-10) — a single
// tap saves immediately, same pattern as the exercise-level "Could
// you have progressed this?" prompt, rather than notes' save-on-blur
// (a discrete 1-10 value has no meaningful "still typing" state).
// Tapping an already-selected value changes it, not clears it — RPE
// is a single point-in-time rating, not a toggle.
// ============================================================

import { useState } from "react";

const RPE_LABELS: Record<number, string> = {
  1: "Very light", 2: "Very light", 3: "Light", 4: "Light", 5: "Moderate",
  6: "Moderate", 7: "Hard", 8: "Hard", 9: "Very hard", 10: "Max effort",
};

interface Props {
  value: number | null;
  onSave: (rpe: number) => Promise<void>;
}

export default function SessionRPEBlock({ value, onSave }: Props) {
  const [localValue, setLocalValue] = useState<number | null>(value);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState("");

  const handleTap = async (n: number) => {
    if (saving != null) return;
    setError("");
    setSaving(n);
    const prev = localValue;
    setLocalValue(n);
    try {
      await onSave(n);
    } catch (e) {
      setLocalValue(prev);
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <span style={s.icon}>🔥</span>
        <span style={s.label}>Session RPE</span>
        {localValue != null && (
          <span style={s.badge}>{localValue}/10 · {RPE_LABELS[localValue]}</span>
        )}
      </div>
      <div style={s.subtitle}>How hard did that session feel, overall?</div>
      {error && <div style={s.error}>{error}</div>}
      <div style={s.scale}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => handleTap(n)}
            disabled={saving != null}
            style={{
              ...s.scaleBtn,
              ...(localValue === n ? s.scaleBtnActive : {}),
              ...(saving === n ? { opacity: 0.6 } : {}),
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <div style={s.anchors}>
        <span>Easy</span>
        <span>Max effort</span>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { border: "1px solid var(--line)", borderRadius: 10, background: "var(--panel)", padding: "12px 14px", marginTop: 16, marginBottom: 12 },
  headerRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const },
  icon: { fontSize: 14 },
  label: { fontSize: 13, fontWeight: 600, color: "var(--text)" },
  badge: { fontSize: 11, background: "var(--accent-dim)", color: "var(--accent)", borderRadius: 4, padding: "2px 7px", fontWeight: 700, marginLeft: "auto" },
  subtitle: { fontSize: 12, color: "var(--mute)", marginTop: 4, marginBottom: 10 },
  error: { fontSize: 12, color: "#FF6B6B", marginBottom: 8 },
  scale: { display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4 },
  scaleBtn: {
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 6,
    padding: "8px 0",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "center" as const,
  },
  scaleBtnActive: { background: "var(--accent)", color: "#0a1420", borderColor: "var(--accent)" },
  anchors: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--mute)", marginTop: 4 },
};
