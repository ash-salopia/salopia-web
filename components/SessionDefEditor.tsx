"use client";

import RepsTimeField from "@/components/RepsTimeField";
import RecoveryDefEditor from "@/components/recovery/RecoveryDefEditor";
import type { PrescribedExercise, RecoveryCategory, RecoveryConfig, RecoveryFormat, SessionType } from "@/types";

const DOW = [
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
  { v: 0, label: "Sun" },
];

// Minimal shape shared by TemplateDef and ProgrammeSession - both are
// "session structures with no date yet", differing only in that a
// template def can repeat on weekdays and a programme session can't
// (it's loaded onto an athlete one explicit date at a time).
export interface SessionDefLike {
  name: string;
  type: SessionType;
  exercises: PrescribedExercise[];
  recovery_category: RecoveryCategory | null;
  recovery_format: RecoveryFormat | null;
  recovery_config: RecoveryConfig;
  days?: number[]; // present (and shown) on template defs only
}

// Shared editor for a session structure - used by both the Template
// Library (with weekday repeat) and the Programme Builder (without).
// Branches by type exactly like RecoverySessionEditor/the real session
// page do: strength gets the exercise list, recovery gets RecoveryDefEditor,
// everything else gets the "configure after loading" placeholder note.
export default function SessionDefEditor({
  def,
  onUpdate,
}: {
  def: SessionDefLike;
  onUpdate: (patch: Partial<SessionDefLike>) => void;
}) {
  const showDays = def.days !== undefined;

  const toggleDay = (v: number) => {
    const days = (def.days ?? []).includes(v) ? (def.days ?? []).filter((d) => d !== v) : [...(def.days ?? []), v];
    onUpdate({ days });
  };

  const exercises = def.exercises ?? [];

  const addExercise = () => {
    const newEx: PrescribedExercise = {
      id: crypto.randomUUID(),
      name: "",
      order: "",
      sets: 3,
      reps: "8",
      time: "",
      rest: "",
      target_load: "",
      tempo: "2-0-2",
      each_side: false,
      notes: "",
      video_url: "",
    };
    onUpdate({ exercises: [...exercises, newEx] });
  };

  // Keyed by position, not ex.id - some legacy exercise rows (pre-dating
  // this field, or imported via CSV/voice parse) were saved without an
  // id at all, and matching on id would let an edit to one silently
  // land on every other id-less row in the same list.
  const updateExercise = (index: number, patch: Partial<PrescribedExercise>) => {
    onUpdate({ exercises: exercises.map((e, i) => (i === index ? { ...e, ...patch } : e)) });
  };

  const removeExercise = (index: number) => {
    onUpdate({ exercises: exercises.filter((_, i) => i !== index) });
  };

  return (
    <div style={styles.editorPane}>
      <div style={styles.editorRow}>
        <input
          value={def.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          style={styles.defNameInput}
        />
        <select
          value={def.type}
          onChange={(e) => onUpdate({ type: e.target.value as SessionType })}
          style={styles.typeSelect}
        >
          <option value="strength">Strength</option>
          <option value="hyrox">Hyrox</option>
          <option value="cardio">Cardio</option>
          <option value="power_speed">Power / Speed</option>
          <option value="recovery">Recovery</option>
        </select>
      </div>

      {showDays && (
        <>
          <div style={styles.dowLabel}>Repeat on (leave blank to load once on the chosen start date)</div>
          <div style={styles.dowRow}>
            {DOW.map((d) => (
              <button
                key={d.v}
                style={{ ...styles.dowBtn, ...((def.days ?? []).includes(d.v) ? styles.dowBtnOn : {}) }}
                onClick={() => toggleDay(d.v)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </>
      )}

      {def.type === "strength" && (
        <>
          <div style={styles.exerciseList}>
            {exercises.map((ex, i) => (
              <div key={ex.id ?? `idx-${i}`} style={styles.exRow}>
                <input
                  value={ex.name}
                  onChange={(e) => updateExercise(i, { name: e.target.value })}
                  placeholder="Exercise name"
                  style={styles.exNameInput}
                />
                <input
                  value={ex.sets}
                  onChange={(e) => updateExercise(i, { sets: parseInt(e.target.value) || 0 })}
                  placeholder="Sets"
                  inputMode="numeric"
                  style={styles.exMiniInput}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <RepsTimeField
                    reps={ex.reps}
                    time={ex.time}
                    onChange={(patch) => updateExercise(i, patch)}
                    inputStyle={styles.exMiniInput}
                  />
                </div>
                <input
                  value={ex.rpe ?? ""}
                  onChange={(e) => updateExercise(i, { rpe: e.target.value === "" ? null : parseFloat(e.target.value) || null })}
                  placeholder="RPE"
                  inputMode="decimal"
                  style={styles.exMiniInput}
                />
                <label style={styles.exBodyweightLabel} title="Prescribe each set's own %1RM instead of a fixed load - e.g. a 70/80/90% ramp">
                  <input
                    type="checkbox"
                    checked={!!ex.use_percent_1rm}
                    onChange={(e) => updateExercise(i, { use_percent_1rm: e.target.checked })}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  %RM
                </label>
                {ex.use_percent_1rm && (
                  <input
                    value={(ex.set_percents ?? []).join(",")}
                    onChange={(e) => updateExercise(i, { set_percents: e.target.value.split(",").map((s) => s.trim()) })}
                    placeholder="e.g. 70,80,90"
                    style={styles.exMiniInput}
                  />
                )}
                <label style={styles.exBodyweightLabel} title="Bodyweight only - no load field, athlete logs reps/time only">
                  <input
                    type="checkbox"
                    checked={!!ex.is_bodyweight}
                    onChange={(e) => updateExercise(i, { is_bodyweight: e.target.checked })}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  BW
                </label>
                <button style={styles.exRemoveBtn} onClick={() => removeExercise(i)}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <button style={styles.addExBtn} onClick={addExercise}>
            + Add exercise
          </button>
        </>
      )}

      {def.type === "recovery" && <RecoveryDefEditor def={def} onUpdate={onUpdate} />}

      {def.type !== "strength" && def.type !== "recovery" && (
        <div style={styles.hyroxNote}>
          Hyrox/Cardio configuration isn&apos;t built yet - this session type will load with
          no preset config. Set it up after loading onto an athlete.
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  editorPane: { flex: 1, minWidth: 0, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 },
  editorRow: { display: "flex", gap: 8, marginBottom: 14 },
  defNameInput: { flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 14, fontWeight: 700 },
  typeSelect: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 13 },
  dowLabel: { fontSize: 11, color: "var(--mute)", marginBottom: 6 },
  dowRow: { display: "flex", gap: 6, marginBottom: 16 },
  dowBtn: { flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  dowBtnOn: { background: "var(--accent)", color: "#0a1420", borderColor: "var(--accent)" },
  exerciseList: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 },
  exRow: { display: "flex", gap: 6, alignItems: "center" },
  exNameInput: { flex: 2, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "7px 8px", fontSize: 13 },
  exMiniInput: { flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "7px 8px", fontSize: 13 },
  exBodyweightLabel: { display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "var(--mute)", fontWeight: 700, flexShrink: 0, cursor: "pointer" },
  exRemoveBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 16, cursor: "pointer" },
  addExBtn: { width: "100%", background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 8, padding: "10px 0", fontSize: 13, cursor: "pointer" },
  hyroxNote: { fontSize: 12, color: "var(--mute)", background: "var(--ink)", borderRadius: 8, padding: 12 },
};
