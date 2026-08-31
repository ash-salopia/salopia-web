"use client";

import { useState } from "react";
import { todayISO } from "@/lib/date-utils";

// 0088 — athlete logs an ad-hoc sport / other session they did themselves
// ("played 5-a-side, 60 min, RPE 7"). Only reachable when the coach has the
// load-monitoring toggle on.

export default function LogSportModal({
  token,
  onClose,
  onLogged,
}: {
  token: string;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [activity, setActivity] = useState("");
  const [date, setDate] = useState(todayISO());
  const [duration, setDuration] = useState("");
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!activity.trim()) { setError("What was the activity?"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/athlete-link/sport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          activity: activity.trim(),
          durationMin: duration === "" ? null : Math.round(parseFloat(duration)),
          rpe,
          notes,
          date,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      onLogged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.title}>Log a sport / other session</div>
        <p style={s.note}>Anything that isn&apos;t a gym session — club training, a match, a swim, a bike ride.</p>

        <label style={s.label}>Activity</label>
        <input style={s.input} value={activity} placeholder="e.g. 5-a-side football"
          onChange={(e) => setActivity(e.target.value)} />

        <label style={s.label}>Date</label>
        <input style={s.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />

        <label style={s.label}>Duration (minutes)</label>
        <input style={{ ...s.input, width: 130 }} type="number" inputMode="numeric" value={duration}
          placeholder="60" onChange={(e) => setDuration(e.target.value)} />

        <label style={s.label}>How hard did it feel? (session RPE)</label>
        <div style={s.rpeRow}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button key={n} type="button"
              style={{ ...s.rpeBtn, ...(rpe === n ? s.rpeBtnOn : {}) }}
              onClick={() => setRpe(rpe === n ? null : n)}>
              {n}
            </button>
          ))}
        </div>

        <label style={s.label}>Notes (optional)</label>
        <textarea style={s.textarea} rows={2} value={notes}
          placeholder="How it went, any niggles…" onChange={(e) => setNotes(e.target.value)} />

        {error && <div style={s.error}>{error}</div>}

        <div style={s.footer}>
          <button style={s.ghostBtn} onClick={onClose}>Cancel</button>
          <button style={{ ...s.primaryBtn, opacity: saving ? 0.6 : 1 }} onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Log session"}
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto" },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 4 },
  note: { fontSize: 12.5, color: "var(--mute)", marginBottom: 14, lineHeight: 1.5 },
  label: { display: "block", fontSize: 12, fontWeight: 700, color: "var(--mute)", margin: "12px 0 5px", textTransform: "uppercase", letterSpacing: "0.03em" },
  input: { width: "100%", background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 14 },
  textarea: { width: "100%", background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 14, resize: "vertical" },
  rpeRow: { display: "flex", gap: 5, flexWrap: "wrap" },
  rpeBtn: { width: 34, height: 34, borderRadius: 8, border: "1px solid var(--line)", background: "var(--panel2)", color: "var(--text)", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  rpeBtnOn: { background: "#F59E0B", borderColor: "#F59E0B", color: "#1a1206" },
  error: { fontSize: 13, color: "#FF6B6B", marginTop: 10 },
  footer: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
};
