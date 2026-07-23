"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RepsTimeField
// One box, toggled between reps-based and time-based prescription —
// some exercises are reps-based (8 reps), others time-based (30s
// hold). Mode defaults to whichever of reps/time already has a value
// (matches the inference SessionReviewEditor already uses elsewhere),
// but an explicit toggle click always wins over that inference so a
// coach can switch to time mode on a fresh, still-empty field.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";

interface Props {
  reps: string;
  time: string;
  onChange: (patch: { reps?: string; time?: string }) => void;
  inputStyle: React.CSSProperties;
  labelStyle?: React.CSSProperties;
}

export default function RepsTimeField({ reps, time, onChange, inputStyle, labelStyle }: Props) {
  const [explicitMode, setExplicitMode] = useState<"reps" | "time" | null>(null);
  const mode: "reps" | "time" = explicitMode ?? (time.trim() ? "time" : "reps");
  const value = mode === "time" ? time : reps;

  const handleChange = (v: string) => {
    if (mode === "time") {
      onChange({ time: v });
    } else {
      // Auto-complete "A"/"a" to "AMRAP", matching ExerciseCard's reps input.
      onChange({ reps: v === "A" || v === "a" ? "AMRAP" : v });
    }
  };

  const toggle = () => {
    const next: "reps" | "time" = mode === "time" ? "reps" : "time";
    setExplicitMode(next);
    // Clear the field being switched away from so a stale value can't
    // linger unseen under the other mode.
    onChange(next === "time" ? { reps: "" } : { time: "" });
  };

  return (
    <div>
      {labelStyle && <div style={labelStyle}>{mode === "time" ? "Time" : "Reps"}</div>}
      <div style={{ display: "flex", gap: 3 }}>
        <input
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={mode === "time" ? "30s" : "—"}
          style={{ ...inputStyle, flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          onClick={toggle}
          title={`Switch to ${mode === "time" ? "reps" : "time"}`}
          style={s.toggleBtn}
        >
          {mode === "time" ? "⏱" : "#"}
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  toggleBtn: {
    flexShrink: 0,
    width: 26,
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  },
};
