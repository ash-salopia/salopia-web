"use client";

import { useState, useEffect } from "react";
import {
  listGoalsForAthlete,
  createGoal,
  deleteGoal,
  toggleGoalStar,
  updateGoal,
  type AthleteGoal,
} from "@/lib/data/goals";

const REP_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];
const REP_LABELS: Record<number, string> = {
  1: "1RM", 2: "2RM", 3: "3RM", 4: "4RM", 5: "5RM",
  6: "6RM", 8: "8RM", 10: "10RM", 12: "12RM", 15: "15RM", 20: "20RM",
};

type GoalType = "exercise" | "weight" | "time" | "text";
type Tier = "primary" | "secondary" | "";

interface Props {
  athleteId: string;
  athleteName: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function GoalsManager({ athleteId, athleteName, onClose }: Props) {
  const [goals, setGoals] = useState<AthleteGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [goalType, setGoalType] = useState<GoalType>("exercise");
  const [label, setLabel] = useState("");
  const [exerciseName, setExerciseName] = useState("");
  const [repMax, setRepMax] = useState(1);
  const [targetKg, setTargetKg] = useState("");
  const [targetTime, setTargetTime] = useState("");
  const [targetText, setTargetText] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [tier, setTier] = useState<Tier>("");
  const [unit, setUnit] = useState("kg");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    listGoalsForAthlete(athleteId)
      .then(setGoals)
      .catch(() => setError("Could not load goals"))
      .finally(() => setLoading(false));
  }, [athleteId]);

  const resetForm = () => {
    setLabel(""); setExerciseName(""); setRepMax(1); setTargetKg("");
    setTargetTime(""); setTargetText(""); setTargetDate(""); setTier("");
    setUnit("kg"); setNotes(""); setAdding(false);
  };

  const autoLabel = goalType === "exercise" && exerciseName
    ? `${exerciseName} ${REP_LABELS[repMax] ?? `${repMax}RM`}`
    : "";

  const handleCreate = async () => {
    const finalLabel = label.trim() || autoLabel;
    if (!finalLabel) { setError("Please enter a goal label"); return; }
    if (goalType === "exercise" && !exerciseName.trim()) { setError("Enter an exercise name"); return; }
    if (goalType === "exercise" && !targetKg) { setError("Enter a target weight"); return; }
    if (goalType === "weight" && !targetKg) { setError("Enter a target weight"); return; }

    setSaving(true);
    setError("");
    try {
      const goal = await createGoal(athleteId, {
        label: finalLabel,
        goal_type: goalType,
        exercise_name: goalType === "exercise" ? exerciseName.trim() : null,
        rep_max: goalType === "exercise" ? repMax : null,
        target_kg: (goalType === "exercise" || goalType === "weight") && targetKg
          ? parseFloat(targetKg) : null,
        target_time: goalType === "time" ? targetTime : "",
        target_text: goalType === "text" ? targetText : "",
        unit: goalType === "weight" ? unit : goalType === "exercise" ? "kg" : "",
        starred: tier === "primary",
        notes,
        created_by: "coach",
        ...(targetDate ? { target_date: targetDate } : {}),
        ...(tier ? { tier } : {}),
      } as any);
      setGoals((prev) => [...prev, goal].sort((a, b) => {
        const tierOrder: Record<string, number> = { primary: 0, secondary: 1, null: 2 };
        return (tierOrder[(a as any).tier ?? 'null'] ?? 2) - (tierOrder[(b as any).tier ?? 'null'] ?? 2);
      }));
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create goal");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteGoal(id);
      setGoals((prev) => prev.filter((g) => g.id !== id));
    } catch {
      setError("Could not delete goal");
    }
  };

  const handleStar = async (goal: AthleteGoal) => {
    const next = !goal.starred;
    setGoals((prev) => prev.map((g) => g.id === goal.id ? { ...g, starred: next } : g));
    try { await toggleGoalStar(goal.id, next); }
    catch { setGoals((prev) => prev.map((g) => g.id === goal.id ? { ...g, starred: goal.starred } : g)); }
  };

  const handleEdit = async (goal: AthleteGoal, patch: Partial<AthleteGoal & { target_date?: string; tier?: string }>) => {
    try {
      await updateGoal(goal.id, patch as any);
      setGoals((prev) => prev.map((g) => g.id === goal.id ? { ...g, ...patch } : g));
    } catch {
      setError("Could not update goal");
    }
  };

  const primary = goals.filter((g) => (g as any).tier === "primary");
  const secondary = goals.filter((g) => (g as any).tier === "secondary");
  const other = goals.filter((g) => !(g as any).tier);

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.title}>Goals - {athleteName}</span>
          <button style={s.closeBtn} onClick={onClose}>x</button>
        </div>

        {error && <div style={s.errorBox}>{error}</div>}

        {loading ? (
          <div style={s.loading}>Loading...</div>
        ) : (
          <>
            {goals.length === 0 && !adding && (
              <div style={s.empty}>No goals set yet. Add one below.</div>
            )}

            {primary.length > 0 && (
              <div>
                <div style={s.tierLabel}>Primary goals</div>
                {primary.map((g) => <GoalRow key={g.id} goal={g} onStar={handleStar} onDelete={handleDelete} onEdit={handleEdit} />)}
              </div>
            )}

            {secondary.length > 0 && (
              <div>
                <div style={{ ...s.tierLabel, color: "var(--mute)" }}>Secondary goals</div>
                {secondary.map((g) => <GoalRow key={g.id} goal={g} onStar={handleStar} onDelete={handleDelete} onEdit={handleEdit} />)}
              </div>
            )}

            {other.length > 0 && (
              <div>
                {(primary.length > 0 || secondary.length > 0) && (
                  <div style={{ ...s.tierLabel, color: "var(--mute)" }}>Other goals</div>
                )}
                {other.map((g) => <GoalRow key={g.id} goal={g} onStar={handleStar} onDelete={handleDelete} onEdit={handleEdit} />)}
              </div>
            )}

            {adding ? (
              <div style={s.addForm}>
                <div style={s.sectionLabel}>New goal</div>

                {/* Tier */}
                <div>
                  <div style={s.fieldLabel}>Priority tier</div>
                  <div style={s.typeRow}>
                    {(["primary", "secondary", ""] as Tier[]).map((t) => (
                      <button key={t || "none"}
                        style={{ ...s.typeBtn, ...(tier === t ? s.typeBtnActive : {}) }}
                        onClick={() => setTier(t)}>
                        {t === "primary" ? "Primary" : t === "secondary" ? "Secondary" : "None"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Type */}
                <div>
                  <div style={s.fieldLabel}>Goal type</div>
                  <div style={s.typeRow}>
                    {(["exercise", "weight", "time", "text"] as GoalType[]).map((t) => (
                      <button key={t}
                        style={{ ...s.typeBtn, ...(goalType === t ? s.typeBtnActive : {}) }}
                        onClick={() => { setGoalType(t); setUnit(t === "weight" ? "kg" : ""); }}>
                        {t === "exercise" ? "Exercise" : t === "weight" ? "Weight" : t === "time" ? "Time" : "Other"}
                      </button>
                    ))}
                  </div>
                </div>

                {goalType === "exercise" && (
                  <>
                    <div>
                      <div style={s.fieldLabel}>Exercise name</div>
                      <input value={exerciseName} onChange={(e) => setExerciseName(e.target.value)}
                        placeholder="e.g. Barbell Back Squat" style={s.input} autoFocus />
                    </div>
                    <div style={s.twoCol}>
                      <div>
                        <div style={s.fieldLabel}>Rep goal</div>
                        <select value={repMax} onChange={(e) => setRepMax(Number(e.target.value))} style={s.input}>
                          {REP_OPTIONS.map((r) => <option key={r} value={r}>{REP_LABELS[r]}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={s.fieldLabel}>Target (kg)</div>
                        <input type="number" value={targetKg} onChange={(e) => setTargetKg(e.target.value)}
                          placeholder="e.g. 150" style={s.input} />
                      </div>
                    </div>
                    {autoLabel && <div style={s.autoLabel}>Label: <strong>{autoLabel}</strong></div>}
                  </>
                )}

                {goalType === "weight" && (
                  <>
                    <div>
                      <div style={s.fieldLabel}>Goal label</div>
                      <input value={label} onChange={(e) => setLabel(e.target.value)}
                        placeholder="e.g. Body weight, Competition total" style={s.input} autoFocus />
                    </div>
                    <div style={s.twoCol}>
                      <div>
                        <div style={s.fieldLabel}>Target</div>
                        <input type="number" value={targetKg} onChange={(e) => setTargetKg(e.target.value)}
                          placeholder="e.g. 80" style={s.input} />
                      </div>
                      <div>
                        <div style={s.fieldLabel}>Unit</div>
                        <input value={unit} onChange={(e) => setUnit(e.target.value)}
                          placeholder="kg, lbs, etc." style={s.input} />
                      </div>
                    </div>
                  </>
                )}

                {goalType === "time" && (
                  <>
                    <div>
                      <div style={s.fieldLabel}>Goal label</div>
                      <input value={label} onChange={(e) => setLabel(e.target.value)}
                        placeholder="e.g. 5k run, 400m sprint" style={s.input} autoFocus />
                    </div>
                    <div>
                      <div style={s.fieldLabel}>Target time (MM:SS or HH:MM:SS)</div>
                      <input value={targetTime} onChange={(e) => setTargetTime(e.target.value)}
                        placeholder="e.g. 20:00" style={s.input} />
                    </div>
                  </>
                )}

                {goalType === "text" && (
                  <>
                    <div>
                      <div style={s.fieldLabel}>Goal label</div>
                      <input value={label} onChange={(e) => setLabel(e.target.value)}
                        placeholder="e.g. Complete first competition" style={s.input} autoFocus />
                    </div>
                    <div>
                      <div style={s.fieldLabel}>Target / description</div>
                      <textarea value={targetText} onChange={(e) => setTargetText(e.target.value)}
                        placeholder="Describe what success looks like..." style={s.textarea} />
                    </div>
                  </>
                )}

                {/* Target date (all types) */}
                <div style={s.twoCol}>
                  <div>
                    <div style={s.fieldLabel}>Achieve by (optional)</div>
                    <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} style={s.input} />
                  </div>
                  <div>
                    <div style={s.fieldLabel}>Notes (optional)</div>
                    <input value={notes} onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any context..." style={s.input} />
                  </div>
                </div>

                <div style={s.formActions}>
                  <button style={s.cancelBtn} onClick={resetForm}>Cancel</button>
                  <button style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}
                    disabled={saving} onClick={handleCreate}>
                    {saving ? "Saving..." : "Add goal"}
                  </button>
                </div>
              </div>
            ) : (
              <button style={s.addBtn} onClick={() => setAdding(true)}>+ Add goal</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function GoalRow({ goal, onStar, onDelete, onEdit }: {
  goal: AthleteGoal;
  onStar: (g: AthleteGoal) => void;
  onDelete: (id: string) => void;
  onEdit: (goal: AthleteGoal, patch: any) => void;
}) {
  const [editing, setEditing] = useState(false);
  const g = goal as any;
  const tier: string | null = g.tier ?? null;

  // Edit state
  const [editLabel, setEditLabel] = useState(goal.label);
  const [editTargetKg, setEditTargetKg] = useState(String(goal.target_kg ?? ""));
  const [editTargetTime, setEditTargetTime] = useState(goal.target_time ?? "");
  const [editTargetText, setEditTargetText] = useState(goal.target_text ?? "");
  const [editTargetDate, setEditTargetDate] = useState(g.target_date ?? "");
  const [editTier, setEditTier] = useState<string>(tier ?? "");
  const [editNotes, setEditNotes] = useState(goal.notes ?? "");

  const handleSave = () => {
    onEdit(goal, {
      label: editLabel.trim() || goal.label,
      target_kg: editTargetKg ? parseFloat(editTargetKg) : null,
      target_time: editTargetTime,
      target_text: editTargetText,
      target_date: editTargetDate || null,
      tier: editTier || null,
      notes: editNotes,
      starred: editTier === "primary" ? true : goal.starred,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{ ...s.goalRow, flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>Editing goal</span>
          <button style={s.deleteBtn} onClick={() => setEditing(false)}>Cancel</button>
        </div>
        <div>
          <div style={s.fieldLabel2}>Label</div>
          <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} style={s.editInput} />
        </div>
        {goal.goal_type === "exercise" && (
          <div>
            <div style={s.fieldLabel2}>Target weight (kg)</div>
            <input type="number" value={editTargetKg} onChange={(e) => setEditTargetKg(e.target.value)} style={s.editInput} />
          </div>
        )}
        {goal.goal_type === "time" && (
          <div>
            <div style={s.fieldLabel2}>Target time</div>
            <input value={editTargetTime} onChange={(e) => setEditTargetTime(e.target.value)} style={s.editInput} />
          </div>
        )}
        {goal.goal_type === "text" && (
          <div>
            <div style={s.fieldLabel2}>Target description</div>
            <input value={editTargetText} onChange={(e) => setEditTargetText(e.target.value)} style={s.editInput} />
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div style={s.fieldLabel2}>Tier</div>
            <select value={editTier} onChange={(e) => setEditTier(e.target.value)} style={s.editInput}>
              <option value="">None</option>
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
            </select>
          </div>
          <div>
            <div style={s.fieldLabel2}>Achieve by</div>
            <input type="date" value={editTargetDate} onChange={(e) => setEditTargetDate(e.target.value)} style={s.editInput} />
          </div>
        </div>
        <div>
          <div style={s.fieldLabel2}>Notes</div>
          <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} style={s.editInput} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={s.saveBtn} onClick={handleSave}>Save changes</button>
          <button style={s.deleteBtn2} onClick={() => onDelete(goal.id)}>Delete goal</button>
        </div>
      </div>
    );
  }

  const subtitle = goal.goal_type === "exercise"
    ? `Target: ${goal.target_kg}kg`
    : goal.goal_type === "weight"
    ? `Target: ${goal.target_kg}${goal.unit ? " " + goal.unit : ""}`
    : goal.goal_type === "time"
    ? `Target: ${goal.target_time}`
    : goal.target_text || "";

  return (
    <div style={{
      ...s.goalRow,
      borderLeftColor: tier === "primary" ? "var(--accent)" : tier === "secondary" ? "var(--mute)" : "var(--line)",
      borderLeftWidth: tier ? 3 : 1,
    }}>
      <button style={s.starBtn} onClick={() => onStar(goal)}>{goal.starred ? "★" : "☆"}</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={s.goalLabel}>{goal.label}</div>
        {subtitle && <div style={s.goalSub}>{subtitle}</div>}
        {g.target_date && (
          <div style={s.goalDate}>
            Achieve by: {new Date(g.target_date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        )}
        {goal.notes && <div style={s.goalNotes}>{goal.notes}</div>}
      </div>
      <div style={s.goalMeta}>
        {tier && <span style={{ ...s.tierBadge, background: tier === "primary" ? "var(--accent-dim)" : "var(--panel2)", color: tier === "primary" ? "var(--accent)" : "var(--mute)" }}>{tier}</span>}
        <span style={s.createdBy}>{goal.created_by === "athlete" ? "Athlete" : "Coach"}</span>
        <button style={s.editBtn} onClick={() => setEditing(true)}>Edit</button>
        <button style={s.deleteBtn} onClick={() => onDelete(goal.id)}>×</button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--text)" },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 22, cursor: "pointer", padding: "0 4px" },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  loading: { fontSize: 14, color: "var(--mute)", textAlign: "center", padding: 16 },
  empty: { fontSize: 13, color: "var(--mute)", fontStyle: "italic", textAlign: "center", padding: "8px 0" },
  tierLabel: { fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 6, marginTop: 4 },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 8 },
  goalRow: { display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, marginBottom: 6 },
  starBtn: { background: "transparent", border: "none", fontSize: 14, cursor: "pointer", padding: 0, flexShrink: 0, marginTop: 1, color: "var(--accent)" },
  goalLabel: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  goalSub: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  goalDate: { fontSize: 11, color: "var(--accent)", marginTop: 3 },
  goalNotes: { fontSize: 11, color: "var(--mute)", fontStyle: "italic", marginTop: 2 },
  goalMeta: { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 },
  tierBadge: { fontSize: 10, borderRadius: 4, padding: "2px 6px", fontWeight: 700 },
  createdBy: { fontSize: 10, color: "var(--mute)", background: "var(--panel2)", borderRadius: 4, padding: "2px 6px" },
  editBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer" },
  editInput: { width: "100%", background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 13 },
  fieldLabel2: { fontSize: 10, color: "var(--mute)", fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 3 },
  deleteBtn2: { flex: 1, background: "transparent", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "8px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  addBtn: { background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%" },
  addForm: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 },
  typeRow: { display: "flex", gap: 6 },
  typeBtn: { flex: 1, background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "7px 4px", fontSize: 11, fontWeight: 600, cursor: "pointer", textAlign: "center" as const },
  typeBtnActive: { background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" },
  fieldLabel: { fontSize: 11, color: "var(--mute)", fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 4 },
  input: { width: "100%", background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14 },
  textarea: { width: "100%", minHeight: 70, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14, resize: "vertical" as const, fontFamily: "inherit" },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  autoLabel: { fontSize: 12, color: "var(--mute)", fontStyle: "italic" },
  formActions: { display: "flex", gap: 8, marginTop: 4 },
  cancelBtn: { flex: 1, background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  saveBtn: { flex: 2, background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" },
};
