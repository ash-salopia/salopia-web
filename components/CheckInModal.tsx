"use client";

import { useState, useEffect } from "react";
import { CHECKIN_QUESTIONS, WELLNESS_QUESTIONS, PAIN_LOCATIONS, scoreCheckIn, DEFAULT_CHECKIN_RULES, type CheckInAnswers, type Suggestion, type CheckInRules } from "@/lib/checkin";
import { getOrgSettings } from "@/lib/data/settings";

const TYPE_COLOR: Record<Suggestion["type"], string> = {
  warn: "var(--warn)",
  info: "var(--blue)",
  good: "var(--good)",
  swap: "#B388FF",
};
const TYPE_ICON: Record<Suggestion["type"], string> = {
  warn: "!",
  info: "i",
  good: "ok",
  swap: "swap",
};

interface Props {
  onClose: () => void;
  // Only passed by the athlete-link surface (AthleteSessionView) —
  // when present, submitting the check-in also persists it via
  // /api/athlete-link/checkin and calls onSubmitted on success. The
  // coach-side "Live" page caller passes neither, so its behaviour
  // (advisory only, never saved) is unchanged.
  token?: string;
  onSubmitted?: () => void;
  // 0088 — extra questions when the org's load-monitoring tick-boxes are on.
  // Passed by the athlete surface from server-resolved settings.
  wellnessEnabled?: boolean;
  painEnabled?: boolean;
}

export default function CheckInModal({ onClose, token, onSubmitted, wellnessEnabled, painEnabled }: Props) {
  const [answers, setAnswers] = useState<CheckInAnswers>({ energy: 3, sleep: 3, soreness: 2, volume: 3 });
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [rules, setRules] = useState<CheckInRules>(DEFAULT_CHECKIN_RULES);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getOrgSettings()
      .then((s) => {
        if ((s as any).checkin_rules) setRules((s as any).checkin_rules);
      })
      .catch(() => {});
  }, []);

  const set = (key: keyof CheckInAnswers, value: number | string) => {
    setAnswers((a) => ({ ...a, [key]: value }));
  };
  const [painOpen, setPainOpen] = useState(false);

  const handleSubmit = async () => {
    setSuggestions(scoreCheckIn(answers, rules).suggestions);
    if (!token) return;
    setSaving(true);
    try {
      await fetch("/api/athlete-link/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...answers }),
      });
      onSubmitted?.();
    } catch {
      // Fail open - suggestions already shown, nothing blocks the athlete
      // just because the save didn't go through this time.
    } finally {
      setSaving(false);
    }
  };

  if (suggestions) {
    return (
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div style={styles.title}>Today's Recommendations</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
            {suggestions.map((s, i) => (
              <div key={i} style={{ background: `${TYPE_COLOR[s.type]}18`, border: `1px solid ${TYPE_COLOR[s.type]}44`, borderRadius: 10, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: TYPE_COLOR[s.type], background: `${TYPE_COLOR[s.type]}22`, borderRadius: 4, padding: "2px 6px", flexShrink: 0, marginTop: 2 }}>
                  {TYPE_ICON[s.type].toUpperCase()}
                </span>
                <span style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.4 }}>{s.text}</span>
              </div>
            ))}
          </div>
          <button style={styles.primaryBtn} onClick={onClose}>Got it</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.title}>Session Check-in</div>
        <p style={styles.note}>Answer honestly - we will suggest any adaptations for today's session.</p>
        {CHECKIN_QUESTIONS.map((q) => (
          <div key={q.key} style={{ marginBottom: 16 }}>
            <div style={styles.questionLabel}>{q.label}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  onClick={() => set(q.key, v)}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 8,
                    border: `1px solid ${answers[q.key] === v ? "var(--accent)" : "var(--line)"}`,
                    background: answers[q.key] === v ? "var(--accent)" : "var(--panel2)",
                    color: answers[q.key] === v ? "#0a1420" : "var(--text)",
                    fontWeight: 700, fontSize: 15, cursor: "pointer",
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
            <div style={styles.scaleLabels}>
              <span>{q.low}</span>
              <span>{q.high}</span>
            </div>
          </div>
        ))}

        {wellnessEnabled && WELLNESS_QUESTIONS.map((q) => (
          <div key={q.key} style={{ marginBottom: 16 }}>
            <div style={styles.questionLabel}>{q.label}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  onClick={() => set(q.key, v)}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 8,
                    border: `1px solid ${answers[q.key] === v ? "var(--accent)" : "var(--line)"}`,
                    background: answers[q.key] === v ? "var(--accent)" : "var(--panel2)",
                    color: answers[q.key] === v ? "#0a1420" : "var(--text)",
                    fontWeight: 700, fontSize: 15, cursor: "pointer",
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
            <div style={styles.scaleLabels}>
              <span>{q.low}</span>
              <span>{q.high}</span>
            </div>
          </div>
        ))}

        {painEnabled && (
          <div style={{ marginBottom: 16 }}>
            <div style={styles.questionLabel}>Any pain or niggles today?</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
              {Array.from({ length: 11 }, (_, i) => i).map((v) => (
                <button
                  key={v}
                  onClick={() => { set("pain_score", v); setPainOpen(v > 0); }}
                  style={{
                    width: 34, padding: "8px 0", borderRadius: 8,
                    border: `1px solid ${answers.pain_score === v ? "var(--accent)" : "var(--line)"}`,
                    background: answers.pain_score === v ? "var(--accent)" : "var(--panel2)",
                    color: answers.pain_score === v ? "#0a1420" : "var(--text)",
                    fontWeight: 700, fontSize: 13, cursor: "pointer",
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
            <div style={styles.scaleLabels}>
              <span>No pain</span>
              <span>Worst imaginable</span>
            </div>
            {(painOpen || (answers.pain_score ?? 0) > 0) && (
              <div style={{ marginTop: 10 }}>
                <div style={{ ...styles.questionLabel, fontSize: 13 }}>Where?</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                  {PAIN_LOCATIONS.map((loc) => {
                    const active = answers.pain_location === loc || (loc === "Other" && answers.pain_location != null && !PAIN_LOCATIONS.includes(answers.pain_location));
                    return (
                      <button
                        key={loc}
                        onClick={() => set("pain_location", loc === "Other" ? "Other: " : loc)}
                        style={{
                          padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                          border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
                          background: active ? "var(--accent)" : "var(--panel2)",
                          color: active ? "#0a1420" : "var(--text)",
                        }}
                      >
                        {loc}
                      </button>
                    );
                  })}
                </div>
                {answers.pain_location != null && !PAIN_LOCATIONS.includes(answers.pain_location) && (
                  <input
                    autoFocus
                    value={answers.pain_location.replace(/^Other:\s?/, "")}
                    onChange={(e) => set("pain_location", `Other: ${e.target.value}`)}
                    placeholder="Describe where…"
                    style={{ marginTop: 8, width: "100%", background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 11px", fontSize: 13 }}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {(wellnessEnabled || painEnabled) && (
          <div style={{ marginBottom: 16 }}>
            <div style={styles.questionLabel}>Anything else? (optional)</div>
            <textarea
              value={answers.wellness_notes ?? ""}
              onChange={(e) => set("wellness_notes", e.target.value)}
              rows={2}
              placeholder="A note for your coach…"
              style={{ width: "100%", background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 11px", fontSize: 13, resize: "vertical" as const }}
            />
          </div>
        )}

        <div style={styles.footer}>
          <button style={styles.ghostBtn} onClick={onClose}>Skip</button>
          <button style={{ ...styles.primaryBtn, opacity: saving ? 0.6 : 1 }} onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : "Get recommendations"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 460, maxHeight: "85vh", overflowY: "auto" },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 6 },
  note: { fontSize: 13, color: "var(--mute)", marginBottom: 16 },
  questionLabel: { fontWeight: 600, fontSize: 14, marginBottom: 6, color: "var(--text)" },
  scaleLabels: { display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--mute)", marginTop: 4 },
  footer: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
};
