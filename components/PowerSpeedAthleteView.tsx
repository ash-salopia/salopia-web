"use client";

// Athlete-facing Power/Speed session view. Previously P/S sessions fell
// through to the generic strength set-logger (weight/reps rows), which
// couldn't show the per-rep metric prescription. This renders the
// coach's tracked metrics as input boxes — set-level (Load/Reps) and
// per-rep (Time/Distance/Height/…) — and saves the PSSetLog[] via the
// same /api/athlete-link/log route the strength logger uses.

import { useState, useEffect, Fragment } from "react";
import { saveWithRetry } from "@/lib/save-queue";
import SessionRPEBlock from "@/components/SessionRPEBlock";
import SessionNotesBlock from "@/components/SessionNotesBlock";
import AthletePageHeading from "@/components/AthletePageHeading";
import VideoModal from "@/components/VideoModal";
import AthleteExerciseHistoryModal from "@/components/AthleteExerciseHistoryModal";
import AthleteSwapExerciseModal from "@/components/AthleteSwapExerciseModal";
import type { Session } from "@/types";
import {
  PS_METRIC_META, resolveTrackedMetrics, normalizePSLog,
  type PSMetricKey, type PSSetLog,
} from "@/lib/ps-metrics";

export default function PowerSpeedAthleteView({
  session: initialSession,
  token,
  onUpdated,
  onBack,
}: {
  session: Session;
  token: string;
  onUpdated: () => void;
  onBack: () => void;
}) {
  const [session, setSession] = useState(initialSession);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  // Video/history/swap/skip/notes (0108) all mutate fields on the
  // *parent's* session copy via onUpdated -> refetchSession (in
  // AthleteSessionView) - without this sync, this component's own
  // local `session` state (seeded once from the initial prop) would
  // never pick those changes up. Safe against clobbering an in-progress
  // set edit: each exercise's own log input state lives in ExerciseLog,
  // seeded once on mount, not re-derived from this prop on every sync.
  useEffect(() => { setSession(initialSession); }, [initialSession]);

  const exercises = [...(session.exercises ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const saveExerciseNotes = async (exerciseId: string, notes: string) => {
    const result = await saveWithRetry(`exnotes:${session.id}:${exerciseId}`, "/api/athlete-link/exercise-notes", {
      token, sessionId: session.id, exerciseId, notes,
    });
    if (!result.ok && !result.queued) setError(result.error);
  };

  const saveExerciseLog = async (exerciseId: string, log: PSSetLog[]) => {
    setSession((prev) => prev ? {
      ...prev,
      exercises: prev.exercises?.map((e) => (e.id === exerciseId ? { ...e, log: log as any } : e)),
    } : prev);
    setSaving(exerciseId);
    setError("");
    const result = await saveWithRetry(
      `log:${session.id}:${exerciseId}`,
      "/api/athlete-link/log",
      { token, sessionId: session.id, exerciseId, log },
    );
    setSaving(null);
    if (!result.ok && !result.queued) setError(result.error);
    else onUpdated();
  };

  const handleRPESave = async (rpe: number) => {
    setSession((prev) => ({ ...prev, rpe, rpe_logged_at: new Date().toISOString() } as Session));
    const result = await saveWithRetry(`rpe:${session.id}`, "/api/athlete-link/rpe", { token, sessionId: session.id, rpe });
    if (!result.ok && !result.queued) { setError(result.error); throw new Error(result.error); }
  };

  const handleNotesChange = (athlete_notes: string) => setSession((prev) => ({ ...prev, athlete_notes } as Session));
  const saveNotes = async () => {
    const result = await saveWithRetry(`notes:${session.id}`, "/api/athlete-link/session-notes", { token, sessionId: session.id, notes: session.athlete_notes ?? "" });
    if (!result.ok && !result.queued) setError(result.error);
  };

  return (
    <div style={s.page}>
      <button style={s.backLink} onClick={onBack}>← Back to sessions</button>
      <AthletePageHeading emoji="⚡" title={session.name} />
      <div style={s.meta}>{session.date} · Power / Speed</div>

      {error && <div style={s.errorBox}>{error}</div>}
      {/* Was a bespoke, always-expanded plain-div renderer (NoteBox)
          with no collapse/expand control at all - every other session
          type's athlete view (strength, hyrox/cardio) uses the real
          SessionNotesBlock here, which has one (reported live: "not
          showing a hide/unhide option", Power/Speed only) (0109). */}
      <SessionNotesBlock value={session.session_notes ?? ""} onChange={() => {}} readOnly videoUrl={(session as any).session_notes_video_url ?? ""} />
      <SessionNotesBlock value={(session as any).warmup_notes ?? ""} onChange={() => {}} readOnly label="Warm-up" icon="🔥" videoUrl={(session as any).warmup_video_url ?? ""} />

      {exercises.map((ex) => (
        <ExerciseLog
          key={ex.id}
          ex={ex}
          token={token}
          sessionId={session.id}
          saving={saving === ex.id}
          onSave={(log) => saveExerciseLog(ex.id, log)}
          onNotesChange={(notes) => {
            setSession((prev) => prev ? {
              ...prev,
              exercises: prev.exercises?.map((e) => (e.id === ex.id ? { ...e, athlete_exercise_notes: notes } as any : e)),
            } : prev);
          }}
          onSaveNotes={(notes) => saveExerciseNotes(ex.id, notes)}
          onSwapOrSkipDone={onUpdated}
        />
      ))}
      {exercises.length === 0 && <div style={s.empty}>No exercises in this session.</div>}

      <SessionNotesBlock value={(session as any).cooldown_notes ?? ""} onChange={() => {}} readOnly label="Cool-down" icon="🧊" videoUrl={(session as any).cooldown_video_url ?? ""} />

      <SessionRPEBlock value={session.rpe ?? null} onSave={handleRPESave} />
      <SessionNotesBlock
        value={session.athlete_notes ?? ""}
        onChange={handleNotesChange}
        onBlur={saveNotes}
        label="Your Notes"
        icon="📝"
        placeholder="How did the session feel? Anything to flag for your coach…"
        enableTemplates={false}
      />
    </div>
  );
}

function ExerciseLog({ ex, token, sessionId, saving, onSave, onNotesChange, onSaveNotes, onSwapOrSkipDone }: {
  ex: any;
  token: string;
  sessionId: string;
  saving: boolean;
  onSave: (log: PSSetLog[]) => void;
  onNotesChange: (notes: string) => void;
  onSaveNotes: (notes: string) => void;
  onSwapOrSkipDone: () => void;
}) {
  const tracked = resolveTrackedMetrics(ex.ps_tracked_metrics, ex.tempo, ex.intensity_label);
  const reps = parseInt(String(ex.reps ?? "")) || 4;
  const completionOnly = !!ex.completion_only;
  const [log, setLog] = useState<PSSetLog[]>(() => normalizePSLog(ex.log, reps, tracked));
  // Collapsed by default - independent per exercise, tap the header to
  // open/close. A session with several P/S exercises was previously
  // always fully expanded end to end, forcing a lot of scrolling to
  // reach later exercises (reported live).
  const [expanded, setExpanded] = useState(false);
  // Video/history/swap/notes buttons (0108) - same feature set the
  // strength athlete view already has (AthleteSessionView.tsx), ported
  // here since P/S had none of them at all.
  const [videoOpen, setVideoOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [undoingOptOut, setUndoingOptOut] = useState(false);

  const handleUndoOptOut = async () => {
    setUndoingOptOut(true);
    try {
      const res = await fetch("/api/athlete-link/opt-out-exercise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, sessionId, exerciseId: ex.id, optedOut: false }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Could not update");
      onSwapOrSkipDone();
    } finally {
      setUndoingOptOut(false);
    }
  };

  const setMetrics = tracked.filter((k) => PS_METRIC_META[k].scope === "set");
  const repMetrics = tracked.filter((k) => PS_METRIC_META[k].scope === "rep");

  const commit = (next: PSSetLog[]) => { setLog(next); onSave(next); };
  const anyLogged = (set: PSSetLog) =>
    Object.values(set.set_metrics).some((v) => (v ?? "").trim()) ||
    set.rep_metrics.some((r) => Object.values(r).some((v) => (v ?? "").trim()));

  const setDone = (si: number, done: boolean) =>
    commit(log.map((st, i) => (i === si ? { ...st, done } : st)));
  const setMetric = (si: number, key: PSMetricKey, val: string) =>
    commit(log.map((st, i) => {
      if (i !== si) return st;
      const updated = { ...st, set_metrics: { ...st.set_metrics, [key]: val } };
      return { ...updated, done: anyLogged(updated) || st.done };
    }));
  // "single_value" (set by the coach - "One value for all reps") means
  // every rep in this set shares one number, so a value entered anywhere
  // broadcasts to every rep_metrics slot rather than just the tapped
  // column - mirrors PowerSpeedExerciseCard's coach-side write. Was
  // previously ignored entirely here (always one column per rep,
  // whatever the coach had set).
  const repMetric = (si: number, ri: number, key: PSMetricKey, val: string) =>
    commit(log.map((st, i) => {
      if (i !== si) return st;
      const rep_metrics = st.single_value
        ? st.rep_metrics.map((r) => ({ ...r, [key]: val }))
        : st.rep_metrics.map((r, idx) => (idx === ri ? { ...r, [key]: val } : r));
      const updated = { ...st, rep_metrics };
      return { ...updated, done: anyLogged(updated) || st.done };
    }));

  const done = log.filter((st) => st.done).length;

  return (
    <div style={s.exCard}>
      {/* Sets/reps and the video/history/swap/note buttons are always
          visible here now, inline with the name - previously hidden
          behind expand, which meant checking what's prescribed or
          swapping/skipping needed opening the card first (reported
          live). Expand/collapse (the chevron + done badge) now only
          ever reveals the actual set-logging boxes underneath. */}
      <div style={s.exHead}>
        <button style={s.exHeadClick} onClick={() => setExpanded((v) => !v)}>
          {ex.order && <span style={s.orderBadge}>{ex.order}</span>}
          <span style={s.exName}>{ex.name}</span>
        </button>

        {!ex.opted_out && (
          <span style={s.exPrescInline}>
            {ex.sets}×{reps}
            {ex.distance ? ` · ${ex.distance}` : ""}
            {ex.rest ? ` · rest ${ex.rest}` : ""}
            {!completionOnly && tracked.length ? ` · ${tracked.map((k) => PS_METRIC_META[k].short).join(" / ")}` : ""}
          </span>
        )}

        <span style={s.actionRow}>
          {ex.name.trim() && (
            <button style={s.actionBtn} onClick={(e) => { e.stopPropagation(); setHistoryOpen(true); }} title="View history & PB">📈</button>
          )}
          {!ex.opted_out && (
            <button style={s.actionBtn} onClick={(e) => { e.stopPropagation(); setSwapOpen(true); }} title="Swap or skip this exercise">🔀</button>
          )}
          <button
            style={{ ...s.actionBtn, ...(ex.athlete_exercise_notes ? s.actionBtnActive : {}) }}
            onClick={(e) => { e.stopPropagation(); setNotesOpen((v) => !v); }}
            title="Note on this exercise"
          >
            📝
          </button>
          {ex.video_url && (
            <button style={s.actionBtn} onClick={(e) => { e.stopPropagation(); setVideoOpen(true); }} title="Watch demo video">▶</button>
          )}
        </span>

        <span style={s.exHeadRight}>
          <span style={s.exBadge}>{done}/{log.length}</span>
          <button style={s.exChevronBtn} onClick={() => setExpanded((v) => !v)} title="Show/hide set-logging boxes">
            <span style={{ ...s.exChevron, transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
          </button>
        </span>
      </div>

      {ex.swapped_from && (
        <div style={s.swappedNote}>🔀 Swapped from &quot;{ex.swapped_from}&quot;</div>
      )}

      {notesOpen && (
        <textarea
          value={ex.athlete_exercise_notes ?? ""}
          onChange={(e) => onNotesChange(e.target.value)}
          onBlur={() => onSaveNotes(ex.athlete_exercise_notes ?? "")}
          placeholder="Anything to note about this exercise - how it felt, form cues, niggles…"
          style={s.notesTextarea}
        />
      )}

      {ex.opted_out && (
        <div style={s.optedOutRow}>
          <span style={s.optedOutLabel}>⏭ Skipped for this session</span>
          <button style={s.undoSkipBtn} onClick={handleUndoOptOut} disabled={undoingOptOut}>
            {undoingOptOut ? "…" : "↩ Undo"}
          </button>
        </div>
      )}

      {expanded && !ex.opted_out && (
        <>
          {ex.notes && <div style={s.exCues}>{ex.notes}</div>}
          {saving && <div style={s.savingNote}>Saving…</div>}

          {log.map((set, si) => {
            // Column count for the rep grid below - 1 column when the
            // coach has flagged this set as "one value for all reps",
            // otherwise one column per prescribed rep.
            const colCount = set.single_value ? 1 : Math.max(1, set.rep_metrics.length);
            return (
              <div key={si} style={{ ...s.set, ...(set.done ? s.setDone : {}) }}>
                <div style={s.setTop}>
                  <span style={s.setLabel}>Set {si + 1}</span>
                  <button style={{ ...s.doneBtn, ...(set.done ? s.doneBtnOn : {}) }} onClick={() => setDone(si, !set.done)}>✓</button>
                </div>

                {!completionOnly && setMetrics.length > 0 && (
                  <div style={s.boxRow}>
                    {setMetrics.map((key) => (
                      <label key={key} style={s.box}>
                        <span style={s.boxLabel}>{PS_METRIC_META[key].label}{PS_METRIC_META[key].unit ? ` (${PS_METRIC_META[key].unit})` : ""}</span>
                        <input value={set.set_metrics[key] ?? ""} inputMode="decimal"
                          placeholder={PS_METRIC_META[key].placeholder}
                          onChange={(e) => setMetric(si, key, e.target.value)} style={s.input} />
                      </label>
                    ))}
                  </div>
                )}

                {/* Rep-level metrics: a compact grid - one row per
                    tracked metric, one narrow column per rep (or a
                    single "All" column when single_value is on) -
                    instead of the old one-row-per-rep layout, which
                    turned a 5-rep, 2-metric set into 5 separate rows. */}
                {!completionOnly && repMetrics.length > 0 && (
                  <div style={s.repGridWrap}>
                    <div style={{ ...s.repGrid, gridTemplateColumns: `40px repeat(${colCount}, minmax(44px, 1fr))` }}>
                      <div />
                      {Array.from({ length: colCount }).map((_, ci) => (
                        <div key={ci} style={s.repColHeader}>{set.single_value ? "All" : `R${ci + 1}`}</div>
                      ))}
                      {repMetrics.map((key) => (
                        <Fragment key={key}>
                          <div style={s.repRowLabel} title={PS_METRIC_META[key].label}>{PS_METRIC_META[key].short}</div>
                          {Array.from({ length: colCount }).map((_, ci) => (
                            <input key={ci} value={set.rep_metrics[ci]?.[key] ?? ""} inputMode="decimal"
                              placeholder={PS_METRIC_META[key].placeholder}
                              onChange={(e) => repMetric(si, ci, key, e.target.value)}
                              style={s.repGridInput} />
                          ))}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {videoOpen && ex.video_url && (
        <VideoModal videoUrl={ex.video_url} title={ex.name} onClose={() => setVideoOpen(false)} />
      )}
      {historyOpen && ex.name.trim() && (
        <AthleteExerciseHistoryModal token={token} exerciseName={ex.name} onClose={() => setHistoryOpen(false)} />
      )}
      {swapOpen && (
        <AthleteSwapExerciseModal
          token={token}
          sessionId={sessionId}
          exerciseId={ex.id}
          currentName={ex.name}
          alternativeNames={ex.alternative_names ?? []}
          swappedFrom={ex.swapped_from}
          onDone={() => { setSwapOpen(false); onSwapOrSkipDone(); }}
          onClose={() => setSwapOpen(false)}
        />
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 560, margin: "0 auto" },
  backLink: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 13, cursor: "pointer", padding: 0 },
  meta: { fontSize: 12, color: "var(--mute)", padding: "0 16px 12px" },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 },
  empty: { fontSize: 13, color: "var(--mute)", fontStyle: "italic", padding: "16px 0" },
  savingNote: { fontSize: 11, color: "var(--mute)" },
  exCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 12, display: "flex", flexDirection: "column" as const, gap: 8 },
  // flexWrap so a narrow phone gets a clean second line instead of
  // squeezing name/presc/buttons unreadably - name+order stays first,
  // done-badge+chevron gets pushed to the row's end (marginLeft: auto)
  // whenever there's room, wrapping under it otherwise.
  exHead: { display: "flex", flexWrap: "wrap" as const, alignItems: "center", rowGap: 6, columnGap: 10, width: "100%" },
  exHeadClick: { display: "flex", alignItems: "center", gap: 8, minWidth: 0, background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left" as const },
  // Same format as the strength athlete view's order badge - purple
  // instead of the generic accent colour, matching this app's
  // Power/Speed brand colour used everywhere else (#A855F7) (0108).
  orderBadge: { fontSize: 12, fontWeight: 800, color: "#A855F7", background: "#A855F722", borderRadius: 6, padding: "2px 7px", flexShrink: 0, fontFamily: "'Barlow Condensed', sans-serif" },
  exName: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  // Sets/reps summary, inline next to the name now rather than only
  // showing once expanded (0109).
  exPrescInline: { fontSize: 12, color: "var(--mute)", flexShrink: 0 },
  exHeadRight: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
  exBadge: { fontSize: 11, fontWeight: 700, color: "var(--mute)", background: "var(--ink)", borderRadius: 6, padding: "2px 7px" },
  exChevronBtn: { background: "transparent", border: "none", padding: 0, cursor: "pointer" },
  exChevron: { fontSize: 22, color: "var(--mute)", transition: "transform 0.2s" },
  exCues: { fontSize: 12, color: "var(--mute)", fontStyle: "italic" as const, lineHeight: 1.5 },
  // Video/history/swap/notes action row (0108) - inline next to the
  // name now rather than only showing once expanded (0109); expand is
  // purely for the set-logging boxes now, so these need their own
  // stopPropagation to avoid toggling it when tapped. marginLeft: auto
  // groups it with exHeadRight over on the row's right side (name/presc
  // stay left) - the done-badge+chevron in exHeadRight still ends up
  // the very rightmost, immediately after these (0110).
  actionRow: { display: "flex", gap: 6, flexShrink: 0, marginLeft: "auto" },
  actionBtn: { width: 34, height: 34, borderRadius: 8, border: "1px solid var(--line)", background: "var(--ink)", color: "var(--mute)", cursor: "pointer", fontSize: 14, flexShrink: 0 },
  actionBtnActive: { background: "var(--accent-dim)", borderColor: "var(--accent)44", color: "var(--accent)" },
  swappedNote: { fontSize: 11, color: "var(--accent)", fontWeight: 600 },
  notesTextarea: { width: "100%", boxSizing: "border-box" as const, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 14, lineHeight: 1.5, resize: "vertical" as const, minHeight: 60 },
  optedOutRow: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--ink)", borderRadius: 8, padding: "10px 12px" },
  optedOutLabel: { fontSize: 13, fontWeight: 600, color: "var(--mute)" },
  undoSkipBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--accent)", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  set: { background: "var(--ink)", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column" as const, gap: 8 },
  setDone: { boxShadow: "inset 0 0 0 1px #10B98144" },
  setTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  setLabel: { fontSize: 12, fontWeight: 700, color: "var(--mute)" },
  doneBtn: { width: 30, height: 30, borderRadius: 6, border: "1px solid var(--line)", background: "transparent", color: "var(--mute)", cursor: "pointer", fontSize: 13 },
  doneBtnOn: { background: "#10B98122", color: "#10B981", borderColor: "#10B981" },
  boxRow: { display: "flex", flexWrap: "wrap" as const, gap: 8 },
  box: { display: "flex", flexDirection: "column" as const, gap: 3, flex: "1 1 90px" },
  boxLabel: { fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const },
  // Rep-metric grid: one row per tracked metric, one narrow column per
  // rep (or a single "All" column for a single_value set) - replaces
  // the old one-row-per-rep layout. Horizontally scrollable so a high
  // rep count never squeezes columns unreadably narrow or breaks the
  // page's own layout.
  repGridWrap: { overflowX: "auto" as const },
  repGrid: { display: "grid", gap: 4, alignItems: "center" },
  repColHeader: { fontSize: 10, fontWeight: 700, color: "var(--mute)", textAlign: "center" as const },
  repRowLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  repGridInput: { width: "100%", boxSizing: "border-box" as const, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "6px 4px", fontSize: 13, fontWeight: 700, textAlign: "center" as const },
  input: { width: 72, boxSizing: "border-box" as const, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "8px 9px", fontSize: 15, fontWeight: 700 },
};
