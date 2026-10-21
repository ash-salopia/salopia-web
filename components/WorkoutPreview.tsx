"use client";

import type { Session } from "@/types";
import { exerciseDose } from "@/lib/exercise-dose";

// Inline "View workout" dropdown on the athlete app's week view: the
// session's exercises at a glance (order, name, sets × reps @ load)
// without leaving the calendar. Uses the session data the calendar
// already has, so opening it costs nothing - no extra loading.

export default function WorkoutPreview({ session, color, onOpen }: { session: Session; color: string; onOpen: () => void }) {
  const exercises = (session.exercises ?? []).filter((e) => !e.opted_out);
  const note = (session.session_notes ?? "").trim();

  return (
    <div style={st.wrap}>
      {exercises.length > 0 ? (
        <div style={st.list}>
          {exercises.map((ex) => {
            const log = ex.log ?? [];
            const done = log.length > 0 && log.every((l) => l.done);
            const dose = exerciseDose(ex);
            return (
              <div key={ex.id} style={st.row}>
                {ex.order ? <span style={{ ...st.order, color }}>{ex.order}</span> : null}
                <span style={{ ...st.name, ...(done ? st.nameDone : {}) }}>
                  {ex.name}
                  {ex.each_side ? <span style={st.mute}> (each side)</span> : null}
                </span>
                {dose && <span style={st.dose}>{dose}</span>}
                {done && <span style={st.tick} aria-label="Done">✓</span>}
              </div>
            );
          })}
        </div>
      ) : note ? (
        <div style={st.note}>{note.length > 220 ? note.slice(0, 220).trimEnd() + "…" : note}</div>
      ) : (
        <div style={st.mute}>Open the workout for the full session.</div>
      )}
      <button style={{ ...st.open, color }} onClick={onOpen}>
        Open workout →
      </button>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  wrap: { padding: "8px 12px 10px", borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 },
  list: { display: "flex", flexDirection: "column", gap: 6 },
  row: { display: "flex", alignItems: "baseline", gap: 8, fontSize: 13, lineHeight: 1.35 },
  order: { fontSize: 11, fontWeight: 800, minWidth: 20, flexShrink: 0 },
  name: { flex: 1, minWidth: 0, color: "var(--text)", fontWeight: 600 },
  nameDone: { color: "var(--mute)" },
  dose: { color: "var(--mute)", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 },
  tick: { color: "#1baf7a", fontSize: 12, fontWeight: 800, flexShrink: 0 },
  note: { fontSize: 12, color: "var(--text)", lineHeight: 1.45, whiteSpace: "pre-wrap" },
  mute: { fontSize: 12, color: "var(--mute)", fontWeight: 400 },
  open: { alignSelf: "flex-end", background: "transparent", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer", padding: "2px 0" },
};
