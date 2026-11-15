"use client";

import { useState } from "react";
import ExerciseCard from "@/components/ExerciseCard";
import HyroxCardioBuilder from "@/components/HyroxCardioBuilder";
import SessionDefView from "@/components/SessionDefView";
import { toPrescription } from "@/lib/prescription";
import { DAYS, dayOf, weekOf } from "@/lib/programme-builder";
import type { LibraryEntry, PrescribedExercise, ProgrammeSession, Session, SessionExercise, SetLog } from "@/types";

// Edits one session inside a programme (0132). Same exercise cards
// coaches use on an athlete's calendar, in prescribe-only mode - there's
// no athlete here, so nothing to log. Changes go up via onChange and the
// page saves them (debounced). Hybrid/cardio use the same builder as the
// calendar; Power/Speed, recovery and sport sessions are shown read-only
// and are edited once loaded onto an athlete.

export const TYPE_COLOR: Record<string, string> = {
  strength: "#3B8BEB", hyrox: "#B388FF", cardio: "#4DC3FF", power_speed: "#A855F7", recovery: "#2DD4BF", sport: "#F59E0B",
};

const blankExercise = (): PrescribedExercise =>
  ({ id: crypto.randomUUID(), name: "", order: "", sets: 3, reps: "8-12", time: "", rest: "", target_load: "", tempo: "2-0-2", each_side: false, notes: "", video_url: "" }) as PrescribedExercise;

// ExerciseCard works on a session_exercises row; a programme exercise is
// the same prescription with an empty log sized to its sets.
function asSessionExercise(ex: PrescribedExercise, sessionId: string, i: number): SessionExercise {
  const sets = ex.sets && ex.sets > 0 ? ex.sets : 3;
  return {
    ...(ex as unknown as SessionExercise),
    session_id: sessionId,
    sort_order: i,
    log: Array.from({ length: sets }, () => ({ weight: "", reps: "", done: false })) as SetLog[],
  };
}

export default function ProgrammeSessionEditor({
  session,
  library,
  onChange,
  onClose,
  onDuplicate,
  onDelete,
}: {
  session: ProgrammeSession;
  library: LibraryEntry[];
  onChange: (patch: Partial<ProgrammeSession>) => void;
  onClose: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set((session.exercises ?? []).filter((e) => !e.name).map((e) => e.id)));
  const exercises = session.exercises ?? [];
  const setExercises = (next: PrescribedExercise[]) => onChange({ exercises: next });

  const editExercise = (id: string, patch: Partial<SessionExercise>) => {
    // log / session_id / sort_order are card plumbing, not prescription.
    const { log: _l, session_id: _s, sort_order: _o, ...rest } = patch as Record<string, unknown>;
    setExercises(exercises.map((e) => (e.id === id ? ({ ...e, ...rest } as PrescribedExercise) : e)));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= exercises.length) return;
    const next = [...exercises];
    [next[i], next[j]] = [next[j], next[i]];
    setExercises(next);
  };
  const addExercise = () => {
    const ex = blankExercise();
    setExercises([...exercises, ex]);
    setExpanded((prev) => new Set(prev).add(ex.id));
  };

  const editable = session.type === "strength";
  const cardioLike = session.type === "hyrox" || session.type === "cardio";

  return (
    <div style={s.panel}>
      <div style={s.head}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: TYPE_COLOR[session.type] ?? "#888", flexShrink: 0 }} />
          <input value={session.name} onChange={(e) => onChange({ name: e.target.value })} style={s.nameInput} aria-label="Session name" />
        </div>
        <div style={s.where}>Week {weekOf(session.day_offset) + 1} · {DAYS[dayOf(session.day_offset)]}</div>
      </div>
      <div style={s.toolbar}>
        <button style={s.ghost} onClick={onDuplicate}>Duplicate</button>
        <button style={{ ...s.ghost, color: "#FF6B6B" }} onClick={onDelete}>Delete</button>
        <button style={{ ...s.ghost, marginLeft: "auto" }} onClick={onClose}>Done</button>
      </div>

      <textarea
        value={session.notes ?? ""}
        onChange={(e) => onChange({ notes: e.target.value })}
        placeholder="Session notes (optional) - shown to the athlete"
        style={s.notes}
      />

      {editable ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {exercises.map((ex, i) => (
            <ExerciseCard
              key={ex.id}
              prescribeOnly
              exercise={asSessionExercise(ex, session.id, i)}
              library={library}
              onEdit={(patch) => editExercise(ex.id, patch)}
              onRemove={() => setExercises(exercises.filter((e) => e.id !== ex.id))}
              onLogChange={() => {}}
              onMoveUp={i > 0 ? () => move(i, -1) : undefined}
              onMoveDown={i < exercises.length - 1 ? () => move(i, 1) : undefined}
              expanded={expanded.has(ex.id)}
              onToggleExpand={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(ex.id)) next.delete(ex.id);
                  else next.add(ex.id);
                  return next;
                })
              }
            />
          ))}
          {!exercises.length && <div style={s.empty}>No exercises yet.</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={s.addBtn} onClick={addExercise}>+ Add exercise</button>
            {exercises.length > 0 && (
              <button style={{ ...s.addBtn, flex: "0 0 auto", padding: "9px 14px" }} onClick={() => setExercises([...exercises, toPrescription(exercises[exercises.length - 1] as unknown as Record<string, unknown>)])}>
                + Copy last
              </button>
            )}
          </div>
        </div>
      ) : cardioLike ? (
        <HyroxCardioBuilder
          session={session as unknown as Session}
          color={TYPE_COLOR[session.type] ?? "#888"}
          library={library}
          zonesEnabled={false}
          onTypeChange={(hyroxType, cardioType) =>
            onChange(session.type === "hyrox" ? { hyrox_type: hyroxType as ProgrammeSession["hyrox_type"], hyrox_config: null } : { cardio_type: cardioType, cardio_config: null })
          }
          onConfigChange={(config) =>
            onChange(session.type === "hyrox" ? { hyrox_config: config as ProgrammeSession["hyrox_config"] } : { cardio_config: config as ProgrammeSession["cardio_config"] })
          }
        />
      ) : (
        <>
          <div style={s.readonlyNote}>
            {session.type === "power_speed" ? "Power / Speed" : session.type === "recovery" ? "Recovery" : "This"} sessions can&apos;t be edited inside a
            programme yet - edit the template it came from, or edit it on the athlete&apos;s calendar once loaded. You can still move,
            copy and delete it here.
          </div>
          <SessionDefView def={session} />
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  panel: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 },
  head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  nameInput: { flex: 1, minWidth: 0, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 16, fontWeight: 700 },
  where: { fontSize: 12, fontWeight: 700, color: "var(--mute)", whiteSpace: "nowrap" },
  toolbar: { display: "flex", gap: 6, flexWrap: "wrap" },
  ghost: { background: "transparent", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  notes: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 13, minHeight: 44, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" },
  empty: { color: "var(--mute)", fontSize: 13, padding: "6px 0" },
  addBtn: { flex: 1, background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 8, padding: "9px 0", fontSize: 13, cursor: "pointer" },
  readonlyNote: { fontSize: 12, color: "var(--mute)", background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", lineHeight: 1.5 },
};
