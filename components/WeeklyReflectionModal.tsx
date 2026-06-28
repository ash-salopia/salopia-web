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
  weekStart: string; // YYYY-MM-DD (Monday of the week)
  weekLabel: string; // e.g. "Week of 23 Jun"
  onClose: () => void;
}

const SCORE_LABELS = ["", "Poor", "Below average", "Average", "Good", "Excellent"];
const SCORE_COLORS = ["", "#FF6B6B", "#FFA94D", "#FFD43B", "#69DB7C", "#38D9A9"];

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return mon;
}

export function currentWeekStart(): string {
  const mon = getMonday(new Date());
  return mon.toISOString().slice(0, 10);
}

export function weekStartLabel(weekStart: string): string {
  const d = new Date(weekStart + "T12:00:00Z");
  return "w/c " + d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function WeeklyReflectionModal({ token, weekStart, weekLabel, onClose }: Props) {
  const [config, setConfig] = useState<ReflectionConfig | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [good, setGood] = useState("");
  const [better, setBetter] = useState("");
  const [how, setHow] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const metrics = config?.reflection_metrics ?? DEFAULT_REFLECTION_METRICS;

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
          setSaved(true); // already has a submission
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

  const allScored = metrics.every(m => scores[m.key] != null);

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modal}>
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

            {/* 1–5 Score sliders */}
            <div style={s.section}>
              <div style={s.sectionLabel}>Rate your week (1–5)</div>
              {metrics.map(metric => {
                const val = scores[metric.key] ?? 0;
                return (
                  <div key={metric.key} style={s.metricRow}>
                    <div style={s.metricLabel}>{metric.label}</div>
                    <div style={s.scoreRow}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          style={{
                            ...s.scoreBtn,
                            background: val === n ? SCORE_COLORS[n] : "var(--ink)",
                            border: val === n ? `1px solid ${SCORE_COLORS[n]}` : "1px solid var(--line)",
                            color: val === n ? "#0a1420" : "var(--mute)",
                            fontWeight: val === n ? 700 : 500,
                          }}
                          onClick={() => setScores(prev => ({ ...prev, [metric.key]: n }))}
                        >
                          {n}
                        </button>
                      ))}
                      {val > 0 && (
                        <span style={{ fontSize: 11, color: SCORE_COLORS[val], marginLeft: 4, fontWeight: 600 }}>
                          {SCORE_LABELS[val]}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Good / Better / How */}
            <div style={s.section}>
              <div style={s.sectionLabel}>Reflection</div>

              <div style={s.textField}>
                <div style={s.textFieldLabel}>
                  <span style={{ color: "#69DB7C" }}>↑</span> {config?.reflection_good_prompt ?? "What went well this week?"}
                </div>
                <textarea
                  style={s.textarea}
                  value={good}
                  onChange={e => { setGood(e.target.value); setSaved(false); }}
                  placeholder="Write freely…"
                  rows={3}
                />
              </div>

              <div style={s.textField}>
                <div style={s.textFieldLabel}>
                  <span style={{ color: "#FFA94D" }}>↗</span> {config?.reflection_better_prompt ?? "What could have been better?"}
                </div>
                <textarea
                  style={s.textarea}
                  value={better}
                  onChange={e => { setBetter(e.target.value); setSaved(false); }}
                  placeholder="Write freely…"
                  rows={3}
                />
              </div>

              <div style={s.textField}>
                <div style={s.textFieldLabel}>
                  <span style={{ color: "var(--accent)" }}>→</span> {config?.reflection_how_prompt ?? "How will you improve next week?"}
                </div>
                <textarea
                  style={s.textarea}
                  value={how}
                  onChange={e => { setHow(e.target.value); setSaved(false); }}
                  placeholder="Write freely…"
                  rows={3}
                />
              </div>
            </div>

            <button
              style={{
                ...s.saveBtn,
                opacity: saving || (!allScored && !good && !better && !how) ? 0.5 : 1,
              }}
              disabled={saving || (!allScored && !good && !better && !how)}
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
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
    display: "flex", alignItems: "flex-end", justifyContent: "center",
    zIndex: 300, padding: 0,
  },
  modal: {
    background: "var(--panel)", borderRadius: "16px 16px 0 0",
    width: "100%", maxWidth: 520, maxHeight: "90vh",
    display: "flex", flexDirection: "column", overflow: "hidden",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "16px 18px 12px", borderBottom: "1px solid var(--line)", flexShrink: 0,
  },
  title: { fontSize: 17, fontWeight: 700, color: "var(--text)" },
  subtitle: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer", padding: 4 },
  errorBox: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "8px 12px", fontSize: 13, margin: "10px 18px 0", flexShrink: 0 },
  loading: { padding: 24, textAlign: "center" as const, color: "var(--mute)", fontSize: 14 },
  savedBanner: {
    background: "#0a1e0a", border: "1px solid var(--good)44", color: "var(--good)",
    borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, flexShrink: 0,
  },
  body: { overflowY: "auto", padding: "14px 18px 24px", display: "flex", flexDirection: "column", gap: 16 },
  section: { display: "flex", flexDirection: "column", gap: 12 },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.06em" },
  metricRow: { display: "flex", flexDirection: "column" as const, gap: 6 },
  metricLabel: { fontSize: 13, fontWeight: 600, color: "var(--text)" },
  scoreRow: { display: "flex", alignItems: "center", gap: 6 },
  scoreBtn: {
    width: 38, height: 38, borderRadius: 8, fontSize: 14, cursor: "pointer",
    flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.15s",
  },
  textField: { display: "flex", flexDirection: "column", gap: 6 },
  textFieldLabel: { fontSize: 13, fontWeight: 600, color: "var(--text)" },
  textarea: {
    background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)",
    borderRadius: 10, padding: "10px 12px", fontSize: 13, fontFamily: "inherit",
    resize: "vertical" as const, lineHeight: 1.5,
  },
  saveBtn: {
    background: "var(--accent)", color: "#0a1420", border: "none",
    borderRadius: 10, padding: "14px 0", fontSize: 14, fontWeight: 700,
    cursor: "pointer", width: "100%",
  },
};
