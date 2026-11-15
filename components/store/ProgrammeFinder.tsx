"use client";

import { useState } from "react";
import { EQUIPMENT, GOALS, TAGS, type FinderAnswers } from "@/lib/store/match";

// "Find your ideal programme" (0131) - a few quick questions, one per
// screen. Scoring happens in lib/store/match.ts; this only collects the
// answers. Every question can be skipped.

type Step = "age" | "goal" | "equipment" | "issues" | "level" | "days";
const STEPS: Step[] = ["age", "goal", "equipment", "issues", "level", "days"];

export const EMPTY_ANSWERS: FinderAnswers = { age: null, goal: null, equipment: [], issues: [], level: null, days: null };

export default function ProgrammeFinder({
  initial,
  onDone,
  onClose,
}: {
  initial: FinderAnswers;
  onDone: (a: FinderAnswers) => void;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [a, setA] = useState<FinderAnswers>(initial);
  const [ageText, setAgeText] = useState(initial.age != null ? String(initial.age) : "");
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const next = () => (last ? onDone(a) : setI(i + 1));

  const toggle = (field: "equipment" | "issues", key: string) => {
    const cur = a[field];
    let nextList = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    if (field === "equipment") nextList = key === "none" ? (nextList.includes("none") ? ["none"] : []) : nextList.filter((k) => k !== "none");
    setA({ ...a, [field]: nextList });
  };

  const option = (on: boolean, label: string, onClick: () => void, key?: string) => (
    <button key={key ?? label} type="button" onClick={onClick} style={{ ...s.option, ...(on ? s.optionOn : null) }}>
      {label}
    </button>
  );

  return (
    <div style={s.backdrop} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Find your ideal programme">
        <div style={s.topRow}>
          <div style={s.progress}>Question {i + 1} of {STEPS.length}</div>
          <button type="button" style={s.close} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={s.bar}><div style={{ ...s.barFill, width: `${((i + 1) / STEPS.length) * 100}%` }} /></div>

        {step === "age" && (
          <>
            <h2 style={s.q}>How old are you?</h2>
            <p style={s.hint}>For a junior athlete, enter their age.</p>
            <input
              style={s.input}
              inputMode="numeric"
              autoFocus
              placeholder="e.g. 15"
              value={ageText}
              onChange={(e) => {
                const t = e.target.value.replace(/[^0-9]/g, "").slice(0, 3);
                setAgeText(t);
                const n = parseInt(t, 10);
                setA({ ...a, age: Number.isFinite(n) && n >= 5 && n <= 100 ? n : null });
              }}
              onKeyDown={(e) => { if (e.key === "Enter") next(); }}
            />
          </>
        )}

        {step === "goal" && (
          <>
            <h2 style={s.q}>What&apos;s your main goal?</h2>
            <div style={s.options}>
              {GOALS.map((g) => option(a.goal === g.key, g.label, () => setA({ ...a, goal: a.goal === g.key ? null : g.key }), g.key))}
            </div>
          </>
        )}

        {step === "equipment" && (
          <>
            <h2 style={s.q}>What equipment can you use?</h2>
            <p style={s.hint}>Pick everything you have access to.</p>
            <div style={s.options}>
              {EQUIPMENT.map((e) => option(a.equipment.includes(e.key), e.key === "none" ? "Nothing - bodyweight only" : e.label, () => toggle("equipment", e.key), e.key))}
            </div>
          </>
        )}

        {step === "issues" && (
          <>
            <h2 style={s.q}>Any injuries or things to work around?</h2>
            <p style={s.hint}>Pick any that apply - we&apos;ll point you to programmes built with them in mind.</p>
            <div style={s.options}>
              {TAGS.map((t) => option(a.issues.includes(t.key), t.issue, () => toggle("issues", t.key), t.key))}
              {option(a.issues.length === 0, "None of these", () => setA({ ...a, issues: [] }), "none")}
            </div>
          </>
        )}

        {step === "level" && (
          <>
            <h2 style={s.q}>How experienced are you with training?</h2>
            <div style={s.options}>
              {option(a.level === "beginner", "New to it, or coming back after a long break", () => setA({ ...a, level: a.level === "beginner" ? null : "beginner" }), "b")}
              {option(a.level === "intermediate", "Train regularly - comfortable with the main lifts", () => setA({ ...a, level: a.level === "intermediate" ? null : "intermediate" }), "i")}
              {option(a.level === "advanced", "Experienced - years of structured training", () => setA({ ...a, level: a.level === "advanced" ? null : "advanced" }), "a")}
            </div>
          </>
        )}

        {step === "days" && (
          <>
            <h2 style={s.q}>How many days a week can you train?</h2>
            <div style={s.options}>
              {[2, 3, 4, 5].map((d) => option(a.days === d, d === 5 ? "5 or more" : `${d} days`, () => setA({ ...a, days: a.days === d ? null : d }), String(d)))}
            </div>
          </>
        )}

        <div style={s.nav}>
          {i > 0 ? <button type="button" style={s.back} onClick={() => setI(i - 1)}>Back</button> : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            {!last && <button type="button" style={s.skip} onClick={next}>Skip</button>}
            <button type="button" style={s.next} onClick={next}>{last ? "Show my matches" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", color: "var(--text)" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  progress: { fontSize: 12, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.06em" },
  close: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer", padding: 4 },
  bar: { height: 4, background: "var(--line)", borderRadius: 2, margin: "10px 0 18px", overflow: "hidden" },
  barFill: { height: "100%", background: "var(--accent)", transition: "width .2s" },
  q: { fontSize: 22, fontWeight: 800, margin: "0 0 6px", lineHeight: 1.25 },
  hint: { fontSize: 14, color: "var(--mute)", margin: "0 0 14px" },
  input: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "12px 14px", fontSize: 18, width: 140, marginTop: 6 },
  options: { display: "flex", flexDirection: "column", gap: 8, marginTop: 8 },
  option: { textAlign: "left", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "12px 14px", fontSize: 15, fontWeight: 600, cursor: "pointer" },
  optionOn: { borderColor: "var(--accent)", background: "var(--accent-dim)", color: "var(--accent)" },
  nav: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22, gap: 8 },
  back: { background: "transparent", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "10px 14px", fontSize: 14, cursor: "pointer" },
  skip: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 14, cursor: "pointer", padding: "10px 8px" },
  next: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 800, cursor: "pointer" },
};
