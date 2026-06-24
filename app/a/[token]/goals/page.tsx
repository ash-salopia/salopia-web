"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GoalWithProgress {
  id: string;
  label: string;
  goal_type: "exercise" | "weight" | "time" | "text";
  exercise_name: string | null;
  rep_max: number | null;
  target_kg: number | null;
  target_time: string;
  target_text: string;
  unit: string;
  starred: boolean;
  notes: string;
  created_by: "coach" | "athlete";
  current_best_kg: number | null;
  current_best_reps: number | null;
  current_best_is_exact: boolean;
  gap_kg: number | null;
  gap_pct: number | null;
  progress_pct: number;
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? "var(--good)" : pct >= 70 ? "var(--accent)" : "var(--warn)";
  return (
    <div style={{ background: "var(--panel2)", borderRadius: 4, height: 6, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: color, borderRadius: 4, transition: "width .4s" }} />
    </div>
  );
}

// ── Goal card ─────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  token,
  onStarToggle,
}: {
  goal: GoalWithProgress;
  token: string;
  onStarToggle: (id: string, starred: boolean) => void;
}) {
  const [starring, setStarring] = useState(false);

  const handleStar = async () => {
    setStarring(true);
    try {
      await fetch("/api/athlete-link/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, goalId: goal.id, starred: !goal.starred }),
      });
      onStarToggle(goal.id, !goal.starred);
    } catch {}
    finally { setStarring(false); }
  };

  const hasProgress = goal.goal_type === "exercise" && goal.current_best_kg !== null;
  const isAchieved = hasProgress && goal.progress_pct >= 100;

  return (
    <div style={{ ...s.card, ...(goal.starred ? s.cardStarred : {}), ...(isAchieved ? s.cardAchieved : {}) }}>
      <div style={s.cardHeader}>
        <div style={{ flex: 1 }}>
          <div style={s.cardLabel}>
            {isAchieved && <span style={s.achievedBadge}>✓ Achieved</span>}
            {goal.label}
          </div>
          {goal.notes && <div style={s.cardNotes}>{goal.notes}</div>}
        </div>
        <button style={s.starBtn} onClick={handleStar} disabled={starring}>
          {goal.starred ? "⭐" : "☆"}
        </button>
      </div>

      {/* Exercise goal progress */}
      {goal.goal_type === "exercise" && (
        <div style={s.progressSection}>
          <div style={s.statsRow}>
            <div style={s.stat}>
              <div style={s.statLabel}>Current best</div>
              <div style={s.statValue}>
                {goal.current_best_kg !== null
                  ? <>
                      {goal.current_best_kg}kg
                      {goal.current_best_reps && goal.rep_max && goal.rep_max > 1
                        ? <span style={s.statSub}> × {goal.current_best_reps} reps</span>
                        : null}
                      {!goal.current_best_is_exact && goal.rep_max === 1
                        ? <span style={s.statSub}> (best lift)</span>
                        : null}
                    </>
                  : <span style={s.statEmpty}>No data yet</span>}
              </div>
            </div>
            <div style={s.stat}>
              <div style={s.statLabel}>Target</div>
              <div style={s.statValue}>{goal.target_kg}kg</div>
            </div>
            <div style={s.stat}>
              <div style={s.statLabel}>Gap</div>
              <div style={{ ...s.statValue, color: isAchieved ? "var(--good)" : "var(--text)" }}>
                {goal.gap_kg !== null
                  ? isAchieved
                    ? "✓ Hit!"
                    : `${goal.gap_kg}kg (${goal.gap_pct}%)`
                  : "—"}
              </div>
            </div>
          </div>
          {goal.current_best_kg !== null && (
            <div style={{ marginTop: 8 }}>
              <ProgressBar pct={goal.progress_pct} />
              <div style={s.progressLabel}>{goal.progress_pct}% of target</div>
            </div>
          )}
        </div>
      )}

      {/* Weight goal */}
      {goal.goal_type === "weight" && goal.target_kg !== null && (
        <div style={s.targetLine}>
          Target: <strong>{goal.target_kg}{goal.unit ? " " + goal.unit : ""}</strong>
        </div>
      )}

      {/* Time goal */}
      {goal.goal_type === "time" && goal.target_time && (
        <div style={s.targetLine}>
          Target time: <strong>{goal.target_time}</strong>
        </div>
      )}

      {/* Text goal */}
      {goal.goal_type === "text" && goal.target_text && (
        <div style={s.targetText}>{goal.target_text}</div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AthleteGoalsPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [goals, setGoals] = useState<GoalWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<"weight" | "time" | "text">("text");
  const [newTarget, setNewTarget] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/athlete-link/goals?token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setGoals(d.goals ?? []);
      })
      .catch((e) => setError(e?.message ?? "Could not load goals"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleStarToggle = (id: string, starred: boolean) => {
    setGoals((prev) =>
      prev.map((g) => g.id === id ? { ...g, starred } : g)
        .sort((a, b) => Number(b.starred) - Number(a.starred))
    );
  };

  const handleAddGoal = async () => {
    if (!newLabel.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/athlete-link/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          label: newLabel.trim(),
          goal_type: newType,
          target_kg: newType === "weight" && newTarget ? parseFloat(newTarget) : null,
          target_time: newType === "time" ? newTarget : "",
          target_text: newType === "text" ? newTarget : "",
          notes: newNotes.trim(),
        }),
      });
      const data = await res.json();
      if (data.goal) {
        setGoals((prev) => [...prev, { ...data.goal, current_best_kg: null, gap_kg: null, gap_pct: null, progress_pct: 0 }]);
        setAdding(false);
        setNewLabel(""); setNewTarget(""); setNewNotes(""); setNewType("text");
      } else if (data.error) {
        setError("Could not add goal: " + data.error);
      }
    } catch (e: any) {
      setError("Could not add goal: " + (e?.message ?? "unknown error"));
    } finally { setSaving(false); }
  };

  const starred = goals.filter((g) => g.starred);
  const rest = goals.filter((g) => !g.starred);

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.brand}>AthletiQ</div>
        <button style={s.backBtn} onClick={() => router.push(`/a/${token}`)}>
          ← Sessions
        </button>
      </div>

      <div style={s.content}>
        <div style={s.pageTitle}>🎯 My Goals</div>

        {error && <div style={s.errorBox}>{error}</div>}

        {loading ? (
          <div style={s.loading}>Loading…</div>
        ) : goals.length === 0 && !adding ? (
          <div style={s.emptyState}>
            <div style={s.emptyIcon}>🎯</div>
            <div style={s.emptyText}>No goals set yet.</div>
            <div style={s.emptySubtext}>Your coach will add goals for you, or you can add your own below.</div>
          </div>
        ) : (
          <>
            {starred.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionTitle}>⭐ Priority goals</div>
                {starred.map((g) => (
                  <GoalCard key={g.id} goal={g} token={token} onStarToggle={handleStarToggle} />
                ))}
              </div>
            )}

            {rest.length > 0 && (
              <div style={s.section}>
                {starred.length > 0 && <div style={s.sectionTitle}>All goals</div>}
                {rest.map((g) => (
                  <GoalCard key={g.id} goal={g} token={token} onStarToggle={handleStarToggle} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Add own goal */}
        {adding ? (
          <div style={s.addForm}>
            <div style={s.addFormTitle}>Add your own goal</div>
            <div>
              <div style={s.fieldLabel}>Goal</div>
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Run a 5k, Lose 5kg" style={s.input} autoFocus />
            </div>
            <div>
              <div style={s.fieldLabel}>Type</div>
              <div style={s.typeRow}>
                {(["text", "weight", "time"] as const).map((t) => (
                  <button key={t} style={{ ...s.typeBtn, ...(newType === t ? s.typeBtnActive : {}) }}
                    onClick={() => setNewType(t)}>
                    {t === "text" ? "📝 General" : t === "weight" ? "⚖️ Weight" : "⏱ Time"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={s.fieldLabel}>{newType === "time" ? "Target time (MM:SS)" : newType === "weight" ? "Target (kg)" : "Describe your target"}</div>
              <input value={newTarget} onChange={(e) => setNewTarget(e.target.value)}
                placeholder={newType === "time" ? "e.g. 25:00" : newType === "weight" ? "e.g. 75" : "What does success look like?"}
                style={s.input} />
            </div>
            <div>
              <div style={s.fieldLabel}>Notes (optional)</div>
              <input value={newNotes} onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Any extra motivation or context…" style={s.input} />
            </div>
            <div style={s.formBtns}>
              <button style={s.cancelBtn} onClick={() => setAdding(false)}>Cancel</button>
              <button style={{ ...s.saveBtn, opacity: !newLabel.trim() || saving ? 0.5 : 1 }}
                disabled={!newLabel.trim() || saving} onClick={handleAddGoal}>
                {saving ? "Saving…" : "Add goal"}
              </button>
            </div>
          </div>
        ) : (
          <button style={s.addBtn} onClick={() => setAdding(true)}>+ Add your own goal</button>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" },
  header: { height: 56, background: "var(--ink)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0 },
  brand: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: 2, color: "var(--accent)" },
  backBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" },
  content: { padding: 16, display: "flex", flexDirection: "column", gap: 12, maxWidth: 480, width: "100%" },
  pageTitle: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, color: "var(--text)", marginBottom: 4 },
  errorBox: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  loading: { fontSize: 14, color: "var(--mute)", padding: "20px 0" },
  emptyState: { textAlign: "center", padding: "32px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  emptySubtext: { fontSize: 13, color: "var(--mute)", maxWidth: 280 },
  section: { display: "flex", flexDirection: "column", gap: 10 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.06em" },
  // Goal card
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 },
  cardStarred: { borderColor: "var(--accent)44", background: "var(--accent-dim)" },
  cardAchieved: { borderColor: "var(--good)44", background: "#0a1e0a" },
  cardHeader: { display: "flex", alignItems: "flex-start", gap: 8 },
  cardLabel: { fontSize: 15, fontWeight: 700, color: "var(--text)", lineHeight: 1.3 },
  cardNotes: { fontSize: 12, color: "var(--mute)", marginTop: 3, fontStyle: "italic" },
  starBtn: { background: "transparent", border: "none", fontSize: 20, cursor: "pointer", padding: 0, flexShrink: 0 },
  achievedBadge: { fontSize: 10, fontWeight: 700, color: "var(--good)", background: "#0a1e0a", border: "1px solid var(--good)44", borderRadius: 4, padding: "1px 6px", marginRight: 6 },
  progressSection: { display: "flex", flexDirection: "column", gap: 6 },
  statsRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 },
  stat: { background: "var(--ink)", borderRadius: 8, padding: "8px 10px" },
  statLabel: { fontSize: 10, color: "var(--mute)", fontWeight: 600, textTransform: "uppercase", marginBottom: 3 },
  statValue: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  statSub: { fontSize: 11, color: "var(--mute)", fontWeight: 400 },
  statEmpty: { fontSize: 13, color: "var(--mute)", fontWeight: 400 },
  progressLabel: { fontSize: 11, color: "var(--mute)", marginTop: 4, textAlign: "right" as const },
  targetLine: { fontSize: 13, color: "var(--mute)" },
  targetText: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5 },
  // Add form
  addBtn: { width: "100%", background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 10, padding: "12px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  addForm: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 },
  addFormTitle: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  fieldLabel: { fontSize: 11, color: "var(--mute)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 },
  input: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 14 },
  typeRow: { display: "flex", gap: 6 },
  typeBtn: { flex: 1, background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 4px", fontSize: 11, fontWeight: 600, cursor: "pointer" },
  typeBtnActive: { background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" },
  formBtns: { display: "flex", gap: 8 },
  cancelBtn: { flex: 1, background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  saveBtn: { flex: 2, background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" },
};
