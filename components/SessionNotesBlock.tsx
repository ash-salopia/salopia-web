"use client";

// ============================================================
// SessionNotesBlock
// Used on all session types (strength, cardio, hyrox, power_speed).
// Coach view: editable textarea with template picker.
// Athlete view: read-only display (readOnly=true).
// ============================================================

import { useState, useRef } from "react";

const TEMPLATES: Record<string, string> = {
  "Sprint Warm-Up Protocol": `Sprint Warm-Up Protocol
─────────────────────────
1. General warm-up: 5 min easy jog / cycle
2. Dynamic mobility: leg swings, hip circles, ankle rolls (2×10 each)
3. Activation: glute bridges, banded clamshells (2×15)
4. Running drills: A-march, A-skip, B-skip, straight leg bound (2×20m each)
5. Strides: 3×60m @ 75–80% — full recovery between each
─────────────────────────
Coaching cues:
- Drive phase: shin angle, triple extension, arm mechanics
- Eyes forward, relaxed shoulders
- Full recovery between maximal efforts`,

  "Plyometric Progression": `Plyometric Session Protocol
─────────────────────────
Classification: [Introductory / Intermediate / Advanced / Maximal]
Total contacts today: ___

Warm-up jumps (low intensity):
- Ankle hops 2x20 contacts
- Squat jumps 2x8

Main block: [exercises below]

Coaching cues:
- Land soft, absorb through ankle > knee > hip
- Reactive jumps: minimise ground contact time
- Full recovery for maximal output`,

  "French Contrast Block": `French Contrast Method
─────────────────────────
Structure: 4 exercises as one complex, 3-5 min rest between sets
Recommended: 3-4 sets of full complex

Exercise 1 - Heavy compound (85-95% 1RM): ___
Exercise 2 - Plyometric (bodyweight): ___
Exercise 3 - Loaded ballistic (30% BW): ___
Exercise 4 - Assisted/unloaded explosive: ___

Rest within complex: 30-60s between exercises
Rest between complexes: 3-5 min (CNS recovery)`,

  "General Warm-Up": `General Warm-Up
─────────────────────────
5 min: [cardio modality]
Mobility circuit (2 rounds):
- [movement 1]
- [movement 2]
- [movement 3]
Activation:
- [activation 1]
- [activation 2]`,
};

interface Props {
  value: string;
  onChange: (val: string) => void;
  readOnly?: boolean;
  sessionType?: string;
}

export default function SessionNotesBlock({ value, onChange, readOnly = false, sessionType }: Props) {
  const [isOpen, setIsOpen] = useState(!!value);
  const [showTemplates, setShowTemplates] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function applyTemplate(text: string) {
    onChange(value ? `${value}\n\n${text}` : text);
    setShowTemplates(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  // Don't render at all if athlete view and no notes
  if (readOnly && !value) return null;

  const lineCount = value ? value.split("\n").length : 0;

  return (
    <div style={s.wrap}>
      <button style={s.header} onClick={() => setIsOpen((o) => !o)}>
        <span style={s.headerLeft}>
          <span style={s.icon}>📋</span>
          <span style={s.label}>Session Notes</span>
          {value && (
            <span style={s.badge}>{lineCount} line{lineCount !== 1 ? "s" : ""}</span>
          )}
        </span>
        <span style={{ ...s.chevron, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
      </button>

      {isOpen && (
        <div style={s.body}>
          {!readOnly && (
            <div style={s.templateRow}>
              <button style={s.templateBtn} onClick={() => setShowTemplates((v) => !v)}>
                Load template ▾
              </button>
              {showTemplates && (
                <div style={s.templateDropdown}>
                  {Object.keys(TEMPLATES).map((name) => (
                    <button
                      key={name}
                      style={s.templateItem}
                      onClick={() => applyTemplate(TEMPLATES[name])}
                    >
                      {name}
                    </button>
                  ))}
                  <button style={{ ...s.templateItem, color: "var(--mute)", borderTop: "1px solid var(--line)" }}
                    onClick={() => setShowTemplates(false)}>
                    Close
                  </button>
                </div>
              )}
            </div>
          )}

          {readOnly ? (
            <pre style={s.readOnlyText}>{value}</pre>
          ) : (
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={`Warm-up protocol, coaching cues, drill progressions...\n\ne.g. A-skip 2x20m, B-skip 2x20m, strides x3 @ 75%\nCoaching focus: drive phase mechanics, shin angle`}
              rows={6}
              style={s.textarea}
            />
          )}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    border: "1px solid var(--line)",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 12,
  },
  header: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "var(--ink)",
    border: "none",
    padding: "10px 14px",
    cursor: "pointer",
    color: "var(--text)",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  icon: { fontSize: 14 },
  label: { fontSize: 13, fontWeight: 600, color: "var(--mute)" },
  badge: {
    fontSize: 10,
    background: "var(--accent-dim)",
    color: "var(--accent)",
    borderRadius: 4,
    padding: "2px 6px",
    fontWeight: 700,
  },
  chevron: {
    fontSize: 12,
    color: "var(--mute)",
    transition: "transform 0.2s",
  },
  body: {
    background: "var(--panel)",
    padding: "10px 14px 14px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  templateRow: { position: "relative" as const },
  templateBtn: {
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    borderRadius: 6,
    padding: "5px 10px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  },
  templateDropdown: {
    position: "absolute" as const,
    top: "calc(100% + 4px)",
    left: 0,
    zIndex: 20,
    background: "var(--panel2)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: 4,
    minWidth: 200,
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    display: "flex",
    flexDirection: "column" as const,
  },
  templateItem: {
    background: "transparent",
    border: "none",
    color: "var(--text)",
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left" as const,
    borderRadius: 6,
  },
  textarea: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 12,
    lineHeight: 1.6,
    resize: "vertical" as const,
    fontFamily: "monospace",
    minHeight: 120,
  },
  readOnlyText: {
    fontSize: 13,
    color: "var(--mute)",
    whiteSpace: "pre-wrap" as const,
    fontFamily: "inherit",
    lineHeight: 1.6,
    margin: 0,
  },
};
