"use client";

import { useState } from "react";
import { saveWithRetry } from "@/lib/save-queue";
import { RECOVERY_COLOR } from "@/lib/recovery-constants";

const METRICS: { key: "recovery_score" | "soreness" | "fatigue"; label: string; low: string; high: string }[] = [
  { key: "recovery_score", label: "How recovered do you feel?", low: "Not at all", high: "Fully recovered" },
  { key: "soreness", label: "Soreness", low: "None", high: "Very sore" },
  { key: "fatigue", label: "Fatigue", low: "Fresh", high: "Exhausted" },
];

export default function RecoverySessionFeedbackModal({
  token,
  sessionId,
  onSubmitted,
  onSkip,
}: {
  token: string;
  sessionId: string;
  onSubmitted: () => void;
  onSkip: () => void;
}) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [painNotes, setPainNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setSaving(true);
    setError("");
    const result = await saveWithRetry(`feedback:${sessionId}`, "/api/athlete-link/session-feedback", {
      token,
      sessionId,
      completion: true,
      recovery_score: scores.recovery_score ?? null,
      soreness: scores.soreness ?? null,
      fatigue: scores.fatigue ?? null,
      pain_notes: painNotes,
      notes,
    });
    setSaving(false);
    if (result.ok || result.queued) onSubmitted();
    else setError(result.error);
  };

  return (
    <div style={s.overlay} onClick={onSkip}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.title}>How was it?</div>
        <div style={s.subtitle}>A quick check-in for your coach — all optional.</div>

        {METRICS.map((m) => (
          <div key={m.key} style={s.metricBlock}>
            <div style={s.metricLabel}>{m.label}</div>
            <div style={s.scoreRow}>
              {[1, 2, 3, 4, 5].map((n) => {
                const active = scores[m.key] === n;
                return (
                  <button
                    key={n}
                    style={{ ...s.scoreBtn, ...(active ? s.scoreBtnActive : {}) }}
                    onClick={() => setScores((prev) => ({ ...prev, [m.key]: n }))}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <div style={s.scaleAnchors}>
              <span>{m.low}</span>
              <span>{m.high}</span>
            </div>
          </div>
        ))}

        <div>
          <label style={s.label}>Pain or concerns (optional)</label>
          <textarea value={painNotes} onChange={(e) => setPainNotes(e.target.value)} rows={2} style={s.input} />
        </div>
        <div>
          <label style={s.label}>Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={s.input} />
        </div>

        {error && <div style={s.error}>{error}</div>}

        <div style={s.btnRow}>
          <button style={s.ghostBtn} onClick={onSkip}>Skip</button>
          <button disabled={saving} style={{ ...s.primaryBtn, opacity: saving ? 0.6 : 1 }} onClick={handleSubmit}>
            {saving ? "Saving…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, color: "var(--text)" },
  subtitle: { fontSize: 12, color: "var(--mute)", marginTop: -8 },
  metricBlock: { display: "flex", flexDirection: "column", gap: 6 },
  metricLabel: { fontSize: 13, fontWeight: 600, color: "var(--text)" },
  scoreRow: { display: "flex", gap: 6 },
  scoreBtn: { flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  scoreBtnActive: { background: RECOVERY_COLOR, color: "#062a26", borderColor: RECOVERY_COLOR },
  scaleAnchors: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--mute)" },
  label: { display: "block", fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 5 },
  input: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", resize: "vertical" as const, boxSizing: "border-box" as const },
  error: { fontSize: 13, color: "#FF6B6B" },
  btnRow: { display: "flex", justifyContent: "space-between", gap: 10 },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  primaryBtn: { background: RECOVERY_COLOR, color: "#062a26", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
};
