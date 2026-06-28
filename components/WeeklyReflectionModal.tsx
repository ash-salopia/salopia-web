"use client";

import { useState, useEffect } from "react";
import { DEFAULT_REFLECTION_METRICS, type ReflectionMetric } from "@/lib/data/settings";

interface ReflectionConfig {
  reflection_enabled: boolean;
  reflection_metrics: ReflectionMetric[] | null;
  reflection_good_prompt: string;
  reflection_better_prompt: string;
  reflection_how_prompt: string;
}

interface Props {
  token: string;
  weekStart: string;
  weekLabel: string;
  onClose: () => void;
}

// Colour logic per metric type:
//   standard  — higher = better (intent, consistency, recovery)
//   neutral   — 3 = ideal, diverge out from centre (load)
//   inverted  — lower = better (stress: low stress is good for training)
const NEUTRAL_KEYS  = new Set(["load"]);
const INVERTED_KEYS = new Set(["stress"]);

function scoreColor(key: string, score: number): string {
  if (NEUTRAL_KEYS.has(key)) {
    // 3 = teal (ideal), 4/5 = blue (under), 2/1 = red (over)
    const palette: Record<number, string> = {
      5: "#74C0FC",
      4: "#A9E34B",
      3: "#38D9A9",
      2: "#FFA94D",
      1: "#FF6B6B",
    };
    return palette[score] ?? "var(--mute)";
  }
  if (INVERTED_KEYS.has(key)) {
    // 1 = green (low stress = good), 5 = red (very high stress = bad)
    const palette: Record<number, string> = {
      1: "#38D9A9",
      2: "#69DB7C",
      3: "#FFD43B",
      4: "#FFA94D",
      5: "#FF6B6B",
    };
    return palette[score] ?? "var(--mute)";
  }
  // Standard: higher = better
  const palette: Record<number, string> = {
    5: "#38D9A9",
    4: "#69DB7C",
    3: "#FFD43B",
    2: "#FFA94D",
    1: "#FF6B6B",
  };
  return palette[score] ?? "var(--mute)";
}

export function currentWeekStart(): string {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}

export function weekStartLabel(weekStart: string): string {
  const d = new Date(weekStart + "T12:00:00Z");
  return "w/c " + d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function WeeklyReflectionModal({ token, weekStart, weekLabel, onClose }: Props) {
  const [config, setConfig]   = useState<ReflectionConfig | null>(null);
  const [scores, setScores]   = useState<Record<string, number>>({});
  const [good, setGood]       = useState("");
  const [better, setBetter]   = useState("");
  const [how, setHow]         = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState("");

  const metrics: ReflectionMetric[] = config?.reflection_metrics ?? DEFAULT_REFLECTION_METRICS;

  useEffect(() => {
    if (!token || !weekStart) return;
    fetch(`/api/athlete-link/reflections?token=${token}&week=${weekStart}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setConfig(d.config);
        if (d.reflection) {
          setScores(d.reflection.scores ?? {});
          setGood(d.reflection.good ?? "");
          setBetter(d.reflection.better ?? "");
          setHow(d.reflection.how ?? "");
          setSaved(true);
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, weekStart]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/athlete-link/reflections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, week_start: weekStart, scores, good, better, how }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setSaved(true);
    } catch (e: any) {
      setError(e.message ?? "Could not save reflection");
    } finally {
      setSaving(false);
    }
  };

  const hasAnyInput = Object.keys(scores).length > 0 || good || better || how;

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modal}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={s.title}>📝 Weekly Reflection</div>
            <div style={s.subtitle}>{weekLabel}</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error && <div style={s.errorBox}>{error}</div>}

        {loading ? (
          <div style={s.loading}>Loading…</div>
        ) : (
          <div style={s.body}>

            {saved && !saving && (
              <div style={s.savedBanner}>✓ Reflection saved for this week</div>
            )}

            {/* ── Per-metric scoring ── */}
            <div style={s.section}>
              <div style={s.sectionLabel}>Rate your week</div>

              {metrics.map(metric => {
                const val = scores[metric.key] ?? 0;
                const scoreDefs = metric.scores ?? null;
                const selectedDef = scoreDefs?.find(o => o.score === val);

                return (
                  <div key={metric.key} style={s.metricBlock}>
                    <div style={s.metricTitle}>{metric.label}</div>

                    {/* Score buttons — always show 5 down to 1 */}
                    <div style={s.scoreRow}>
                      {[5, 4, 3, 2, 1].map(n => {
                        const def = scoreDefs?.find(o => o.score === n);
                        const active = val === n;
                        const color = scoreColor(metric.key, n);
                        return (
                          <button
                            key={n}
                            title={def ? `${def.label} — ${def.meaning}` : String(n)}
                            style={{
                              ...s.scoreBtn,
                              background: active ? color : "var(--ink)",
                              border: active ? `2px solid ${color}` : "1px solid var(--line)",
                              color: active ? "#0a1420" : "var(--mute)",
                              fontWeight: active ? 800 : 500,
                              transform: active ? "scale(1.08)" : "scale(1)",
                            }}
                            onClick={() => {
                              setScores(prev => ({ ...prev, [metric.key]: n }));
                              setSaved(false);
                            }}
                          >
                            {n}
                          </button>
                        );
                      })}
                    </div>

                    {/* Selected label + meaning */}
                    {val > 0 && selectedDef && (
                      <div style={{
                        ...s.selectedLabel,
                        borderLeftColor: scoreColor(metric.key, val),
                      }}>
                        <span style={{ fontWeight: 700, color: scoreColor(metric.key, val) }}>
                          {selectedDef.label}
                        </span>
                        {" — "}
                        <span style={{ color: "var(--mute)" }}>{selectedDef.meaning}</span>
                      </div>
                    )}
                    {val > 0 && !selectedDef && (
                      <div style={s.genericLabel}>Score: {val} / 5</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Good / Better / How ── */}
            <div style={s.section}>
              <div style={s.sectionLabel}>Reflection</div>

              {([
                { field: "good",   value: good,   set: (v: string) => { setGood(v);   setSaved(false); }, color: "#69DB7C", arrow: "↑", prompt: config?.reflection_good_prompt   ?? "What went well this week?" },
                { field: "better", value: better, set: (v: string) => { setBetter(v); setSaved(false); }, color: "#FFA94D", arrow: "↗", prompt: config?.reflection_better_prompt ?? "What could have been better?" },
                { field: "how",    value: how,    set: (v: string) => { setHow(v);    setSaved(false); }, color: "var(--accent)", arrow: "→", prompt: config?.reflection_how_prompt    ?? "How will you improve next week?" },
              ] as const).map(({ field, value, set, color, arrow, prompt }) => (
                <div key={field} style={s.textField}>
                  <div style={s.textFieldLabel}>
                    <span style={{ color, fontSize: 15, marginRight: 4 }}>{arrow}</span>
                    {prompt}
                  </div>
                  <textarea
                    style={s.textarea}
                    value={value}
                    onChange={e => set(e.target.value)}
                    placeholder="Write freely…"
                    rows={3}
                  />
                </div>
              ))}
            </div>

            <button
              style={{ ...s.saveBtn, opacity: (!hasAnyInput || saving) ? 0.45 : 1 }}
              disabled={!hasAnyInput || saving}
              onClick={handleSave}
            >
              {saving ? "Saving…" : saved ? "Update reflection" : "Save reflection"}
            </button>

          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)",
    display: "flex", alignItems: "flex-end", justifyContent: "center",
    zIndex: 300, padding: 0,
  },
  modal: {
    background: "var(--panel)", borderRadius: "18px 18px 0 0",
    width: "100%", maxWidth: 520, maxHeight: "92vh",
    display: "flex", flexDirection: "column", overflow: "hidden",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "16px 18px 12px", borderBottom: "1px solid var(--line)", flexShrink: 0,
  },
  title:    { fontSize: 17, fontWeight: 700, color: "var(--text)" },
  subtitle: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer", padding: 4 },
  errorBox: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "8px 12px", fontSize: 13, margin: "10px 18px 0", flexShrink: 0 },
  loading:  { padding: 32, textAlign: "center" as const, color: "var(--mute)", fontSize: 14 },
  savedBanner: {
    background: "#0a1e0a", border: "1px solid var(--good)44", color: "var(--good)",
    borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600,
  },
  body: {
    overflowY: "auto", padding: "14px 18px 32px",
    display: "flex", flexDirection: "column", gap: 20,
  },
  section:      { display: "flex", flexDirection: "column", gap: 14 },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.07em" },
  metricBlock:  { display: "flex", flexDirection: "column", gap: 8, background: "var(--ink)", borderRadius: 12, padding: "12px 14px" },
  metricTitle:  { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  scoreRow:     { display: "flex", gap: 8 },
  scoreBtn: {
    flex: 1, height: 44, borderRadius: 10, fontSize: 15,
    cursor: "pointer", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.15s",
  },
  selectedLabel: {
    fontSize: 12, lineHeight: 1.5,
    borderLeft: "3px solid", paddingLeft: 8, marginTop: 2,
  },
  genericLabel: { fontSize: 12, color: "var(--mute)" },
  textField:      { display: "flex", flexDirection: "column", gap: 6 },
  textFieldLabel: { fontSize: 13, fontWeight: 600, color: "var(--text)" },
  textarea: {
    background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)",
    borderRadius: 10, padding: "10px 12px", fontSize: 13, fontFamily: "inherit",
    resize: "vertical" as const, lineHeight: 1.6, minHeight: 80,
  },
  saveBtn: {
    background: "var(--accent)", color: "#0a1420", border: "none",
    borderRadius: 12, padding: "15px 0", fontSize: 15, fontWeight: 700,
    cursor: "pointer", width: "100%", marginTop: 4,
  },
};
