"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RepsTimeField
// One box, toggled between reps-based and time-based prescription - // some exercises are reps-based (8 reps), others time-based (30s
// hold). Mode defaults to whichever of reps/time already has a value
// (matches the inference SessionReviewEditor already uses elsewhere),
// but an explicit toggle click always wins over that inference so a
// coach can switch to time mode on a fresh, still-empty field. Toggling
// back restores what was typed before the switch.
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
  // Defensive against legacy exercise rows saved before the time field
  // existed (or imported via CSV/voice parse without it) - their JSONB
  // can genuinely lack these keys, so they arrive as undefined at
  // runtime despite the prop type.
  reps = reps ?? "";
  time = time ?? "";
  const [explicitMode, setExplicitMode] = useState<"reps" | "time" | null>(null);
  const [focused, setFocused] = useState(false);
  // What was in each mode before switching away, so toggling back puts it
  // back (12 reps -> time -> reps shows 12 again) rather than an empty box.
  const [stash, setStash] = useState<{ reps: string; time: string }>({ reps: "", time: "" });
  const mode: "reps" | "time" = explicitMode ?? (time.trim() ? "time" : "reps");
  const value = mode === "time" ? time : reps;

  const handleChange = (v: string) => {
    if (mode === "time") {
      onChange({ time: v });
    } else {
      // Typing "A"/"a" into an EMPTY box auto-completes to "AMRAP". Only
      // from empty - otherwise backspacing "AMRAP" down to "A" re-filled
      // it and the box could never be cleared.
      onChange({ reps: !reps.trim() && (v === "A" || v === "a") ? "AMRAP" : v });
    }
  };

  const toggle = () => {
    const next: "reps" | "time" = mode === "time" ? "reps" : "time";
    setExplicitMode(next);
    // The saved prescription only ever holds the mode in use (a stale
    // value under the other mode would confuse the athlete app), but the
    // value switched away from is kept here and restored on the way back.
    if (next === "time") {
      setStash((prev) => ({ ...prev, reps }));
      onChange({ reps: "", time: time || stash.time });
    } else {
      setStash((prev) => ({ ...prev, time }));
      onChange({ time: "", reps: reps || stash.reps });
    }
  };

  return (
    <div style={{ position: "relative" }}>
      {labelStyle && <div style={labelStyle}>{mode === "time" ? "Time" : "Reps"}</div>}
      <div style={{ display: "flex", gap: 3 }}>
        <input
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={mode === "time" ? "30s" : "-"}
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
      {focused && mode === "reps" && (
        <div style={s.hint}>A = AMRAP</div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  // Floats under the box so it doesn't push the row around.
  hint: {
    position: "absolute", top: "100%", left: 0, marginTop: 2, zIndex: 5, whiteSpace: "nowrap",
    fontSize: 10, fontWeight: 700, color: "var(--mute)", background: "var(--panel)",
    border: "1px solid var(--line)", borderRadius: 4, padding: "1px 5px", pointerEvents: "none",
  },
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
