"use client";

import { useEffect } from "react";

interface Props {
  exerciseName: string;
  weightKg: number;
  reps: number | null;
  onClose: () => void;
}

// Auto-dismisses after a few seconds so it never blocks the athlete
// from getting back to logging the rest of the session — tapping
// anywhere closes it immediately too.
const AUTO_DISMISS_MS = 4000;

export default function PBCelebrationModal({ exerciseName, weightKg, reps, onClose }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.card} onClick={(e) => e.stopPropagation()}>
        <div style={s.emoji}>🏆</div>
        <div style={s.title}>New PB!</div>
        <div style={s.exercise}>{exerciseName}</div>
        <div style={s.value}>
          {weightKg}kg{reps ? ` × ${reps}` : ""}
        </div>
        <div style={s.sub}>Well done — nice work! 💪</div>
        <button style={s.closeBtn} onClick={onClose}>Nice!</button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 400, padding: 16,
  },
  card: {
    background: "var(--panel)", border: "1px solid var(--accent)",
    borderRadius: 20, width: "100%", maxWidth: 320,
    padding: "32px 24px 24px", textAlign: "center" as const,
    display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4,
    boxShadow: "0 0 40px var(--accent-dim)",
  },
  emoji: { fontSize: 48, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: 800, color: "var(--accent)", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1 },
  exercise: { fontSize: 15, fontWeight: 600, color: "var(--text)", marginTop: 6 },
  value: { fontSize: 28, fontWeight: 800, color: "var(--text)", marginTop: 4 },
  sub: { fontSize: 13, color: "var(--mute)", marginTop: 6, marginBottom: 16 },
  closeBtn: {
    background: "var(--accent)", color: "#0a1420", border: "none",
    borderRadius: 10, padding: "11px 32px", fontSize: 14, fontWeight: 700, cursor: "pointer",
  },
};
