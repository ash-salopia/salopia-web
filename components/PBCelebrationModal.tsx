"use client";

import { useEffect } from "react";
import { formatPBValue, pbTypeLabel, type PBType } from "@/lib/data/personal-bests";

export interface CelebratedPB {
  kind: PBType;
  weightKg: number | null;
  reps: number | null;
  timeSeconds: number | null;
  e1rmKg: number | null;
  volumeKg: number | null;
}

interface Props {
  exerciseName: string;
  pbs: CelebratedPB[];
  onClose: () => void;
}

// Auto-dismisses after a few seconds so it never blocks the athlete
// from getting back to logging the rest of the session - tapping
// anywhere closes it immediately too.
const AUTO_DISMISS_MS = 4000;

// A single save can PB more than one lane at once (0110 - e.g. a
// heavier top set that's also this session's best total volume), so
// this lists every lane that fired rather than assuming just one.
export default function PBCelebrationModal({ exerciseName, pbs, onClose }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [onClose]);

  if (!pbs.length) return null;

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.card} onClick={(e) => e.stopPropagation()}>
        <div style={s.emoji}>🏆</div>
        <div style={s.title}>{pbs.length > 1 ? "New PBs!" : "New PB!"}</div>
        <div style={s.exercise}>{exerciseName}</div>
        {pbs.map((pb, i) => {
          const label = pbTypeLabel(pb.kind);
          return (
            <div key={i} style={s.valueRow}>
              {label && <div style={s.valueLabel}>{label}</div>}
              <div style={s.value}>
                {formatPBValue({
                  pb_type: pb.kind,
                  weight_kg: pb.weightKg,
                  reps: pb.reps,
                  time_seconds: pb.timeSeconds,
                  e1rm_kg: pb.e1rmKg,
                  volume_kg: pb.volumeKg,
                })}
              </div>
            </div>
          );
        })}
        <div style={s.sub}>Well done - nice work! 💪</div>
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
  valueRow: { marginTop: 8 },
  valueLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.04em" },
  value: { fontSize: 24, fontWeight: 800, color: "var(--text)" },
  sub: { fontSize: 13, color: "var(--mute)", marginTop: 10, marginBottom: 16 },
  closeBtn: {
    background: "var(--accent)", color: "#0a1420", border: "none",
    borderRadius: 10, padding: "11px 32px", fontSize: 14, fontWeight: 700, cursor: "pointer",
  },
};
