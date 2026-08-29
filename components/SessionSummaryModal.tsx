"use client";

import type { Session, SessionExercise } from "@/types";

interface Props {
  session: Session;
  onClose: () => void;
}

function parseWeight(s: string | undefined | null): number {
  const n = parseFloat(s ?? "");
  return isNaN(n) ? 0 : n;
}

function parseReps(s: string | undefined | null): number {
  if (!s) return 0;
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

interface ExerciseSummary {
  id: string;
  name: string;
  setsDone: number;
  setsTotal: number;
  volume: number;
  bestSet: string | null;
  optedOut: boolean;
}

// Deliberately just the heaviest completed weighted set, or (for a
// time/bodyweight exercise) the first completed set's time/reps - a
// quick recap for the athlete, not the precision the coach's reports
// need.
function summariseExercise(ex: SessionExercise): ExerciseSummary {
  const log = ex.log ?? [];
  const done = log.filter((s) => s.done);
  const timeMode = (ex.time ?? "").trim().length > 0;

  let volume = 0;
  let bestWeight = 0;
  let bestSet: string | null = null;

  for (const s of done) {
    const w = ex.is_bodyweight ? 0 : parseWeight(s.weight);
    const r = timeMode ? 0 : parseReps(s.reps);
    if (w > 0 && r > 0) volume += w * r;

    if (timeMode) {
      const t = (s.time ?? "").trim();
      if (t && !bestSet) bestSet = w > 0 ? `${t} @ ${w}kg` : t;
    } else if (w > 0 && w >= bestWeight) {
      bestWeight = w;
      bestSet = r > 0 ? `${w}kg × ${r}` : `${w}kg`;
    } else if (!bestSet && r > 0) {
      bestSet = `${r} reps`;
    }
  }

  return {
    id: ex.id,
    name: ex.name,
    setsDone: done.length,
    setsTotal: log.length,
    volume,
    bestSet,
    optedOut: ex.opted_out,
  };
}

export default function SessionSummaryModal({ session, onClose }: Props) {
  const exSummaries = (session.exercises ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(summariseExercise);

  const active = exSummaries.filter((e) => !e.optedOut);
  const exercisesCompleted = active.filter((e) => e.setsTotal > 0 && e.setsDone === e.setsTotal).length;
  const setsDone = active.reduce((sum, e) => sum + e.setsDone, 0);
  const setsTotal = active.reduce((sum, e) => sum + e.setsTotal, 0);
  const totalVolume = active.reduce((sum, e) => sum + e.volume, 0);

  const dateLabel = new Date(session.date + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.title}>Session summary</div>
        <div style={s.subtitle}>{session.name} · {dateLabel}</div>

        <div style={s.statsRow}>
          <div style={s.stat}>
            <div style={s.statValue}>{exercisesCompleted}/{active.length}</div>
            <div style={s.statLabel}>Exercises</div>
          </div>
          <div style={s.stat}>
            <div style={s.statValue}>{setsDone}/{setsTotal}</div>
            <div style={s.statLabel}>Sets</div>
          </div>
          {totalVolume > 0 && (
            <div style={s.stat}>
              <div style={s.statValue}>{Math.round(totalVolume).toLocaleString()}kg</div>
              <div style={s.statLabel}>Volume</div>
            </div>
          )}
          {session.rpe != null && (
            <div style={s.stat}>
              <div style={s.statValue}>{session.rpe}/10</div>
              <div style={s.statLabel}>RPE</div>
            </div>
          )}
        </div>

        <div style={s.exList}>
          {exSummaries.map((e) => (
            <div key={e.id} style={s.exRow}>
              <div style={s.exName}>{e.name}</div>
              <div style={s.exMeta}>
                {e.optedOut
                  ? "Skipped"
                  : `${e.setsDone}/${e.setsTotal} sets${e.bestSet ? ` · ${e.bestSet}` : ""}`}
              </div>
            </div>
          ))}
          {!exSummaries.length && <div style={s.empty}>No exercises in this session.</div>}
        </div>

        {session.athlete_notes && (
          <div style={s.notesBox}>
            <div style={s.notesLabel}>Your notes</div>
            <div style={s.notesText}>{session.athlete_notes}</div>
          </div>
        )}

        <button style={s.closeBtn} onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(6,9,12,.75)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 60, padding: 16,
  },
  modal: {
    background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16,
    padding: 20, width: "100%", maxWidth: 460, maxHeight: "85vh", overflowY: "auto",
  },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, color: "var(--text)" },
  subtitle: { fontSize: 13, color: "var(--mute)", marginTop: 2, marginBottom: 16 },
  statsRow: { display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" },
  stat: {
    flex: "1 1 70px", background: "var(--ink)", border: "1px solid var(--line)",
    borderRadius: 10, padding: "10px 8px", textAlign: "center" as const,
  },
  statValue: { fontSize: 17, fontWeight: 800, color: "var(--accent)" },
  statLabel: { fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: 0.4, marginTop: 2 },
  exList: { display: "flex", flexDirection: "column" as const, gap: 6, marginBottom: 12 },
  exRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
    background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 12px",
  },
  exName: { fontSize: 13, fontWeight: 700, color: "var(--text)" },
  exMeta: { fontSize: 12, color: "var(--mute)", whiteSpace: "nowrap" as const, flexShrink: 0 },
  empty: { fontSize: 13, color: "var(--mute)", fontStyle: "italic", textAlign: "center" as const, padding: "12px 0" },
  notesBox: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", marginBottom: 16 },
  notesLabel: { fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 4 },
  notesText: { fontSize: 13, color: "var(--text)", lineHeight: 1.4, whiteSpace: "pre-wrap" as const },
  closeBtn: {
    width: "100%", background: "var(--accent)", color: "#0a1420", border: "none",
    borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer",
  },
};
