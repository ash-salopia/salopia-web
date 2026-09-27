"use client";

// Athlete-facing Power/Speed session view. Previously P/S sessions fell
// through to the generic strength set-logger (weight/reps rows), which
// couldn't show the per-rep metric prescription. This renders the
// coach's tracked metrics as input boxes — set-level (Load/Reps) and
// per-rep (Time/Distance/Height/…) — and saves the PSSetLog[] via the
// same /api/athlete-link/log route the strength logger uses.

import { useState, Fragment } from "react";
import { saveWithRetry } from "@/lib/save-queue";
import SessionRPEBlock from "@/components/SessionRPEBlock";
import SessionNotesBlock from "@/components/SessionNotesBlock";
import AthletePageHeading from "@/components/AthletePageHeading";
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

  const exercises = [...(session.exercises ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

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
      <NoteBox label="Session Notes" text={session.session_notes} videoUrl={(session as any).session_notes_video_url} />
      <NoteBox label="Warm-up" text={(session as any).warmup_notes} videoUrl={(session as any).warmup_video_url} />

      {exercises.map((ex) => (
        <ExerciseLog
          key={ex.id}
          ex={ex}
          saving={saving === ex.id}
          onSave={(log) => saveExerciseLog(ex.id, log)}
        />
      ))}
      {exercises.length === 0 && <div style={s.empty}>No exercises in this session.</div>}

      <NoteBox label="Cool-down" text={(session as any).cooldown_notes} videoUrl={(session as any).cooldown_video_url} />

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

// Shared read-only note box for Session Notes / Warm-up / Cool-down
// (0105) - self-hides when there's neither text nor a video link, so
// call sites don't each need their own conditional.
function NoteBox({ label, text, videoUrl }: { label: string; text?: string | null; videoUrl?: string | null }) {
  if (!text && !videoUrl) return null;
  return (
    <div style={s.coachNote}>
      <span style={s.coachNoteLabel}>{label}</span>
      {text}
      {videoUrl && (
        <a href={videoUrl} target="_blank" rel="noopener noreferrer" style={s.coachNoteVideo}>
          ▸ Watch video
        </a>
      )}
    </div>
  );
}

function ExerciseLog({ ex, saving, onSave }: { ex: any; saving: boolean; onSave: (log: PSSetLog[]) => void }) {
  const tracked = resolveTrackedMetrics(ex.ps_tracked_metrics, ex.tempo, ex.intensity_label);
  const reps = parseInt(String(ex.reps ?? "")) || 4;
  const completionOnly = !!ex.completion_only;
  const [log, setLog] = useState<PSSetLog[]>(() => normalizePSLog(ex.log, reps, tracked));
  // Collapsed by default - independent per exercise, tap the header to
  // open/close. A session with several P/S exercises was previously
  // always fully expanded end to end, forcing a lot of scrolling to
  // reach later exercises (reported live).
  const [expanded, setExpanded] = useState(false);

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
      <button style={s.exHead} onClick={() => setExpanded((v) => !v)}>
        <span style={s.exName}>{ex.order ? `${ex.order}. ` : ""}{ex.name}</span>
        <span style={s.exHeadRight}>
          <span style={s.exBadge}>{done}/{log.length}</span>
          <span style={{ ...s.exChevron, transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
        </span>
      </button>

      {expanded && (
        <>
          <div style={s.exPresc}>
            {ex.sets}×{reps}
            {ex.distance ? ` · ${ex.distance}` : ""}
            {ex.rest ? ` · rest ${ex.rest}` : ""}
            {!completionOnly && tracked.length ? ` · ${tracked.map((k) => PS_METRIC_META[k].short).join(" / ")}` : ""}
          </div>
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
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 560, margin: "0 auto" },
  backLink: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 13, cursor: "pointer", padding: 0 },
  meta: { fontSize: 12, color: "var(--mute)", padding: "0 16px 12px" },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 },
  coachNote: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "var(--text)", marginBottom: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" as const },
  coachNoteLabel: { display: "block", fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, marginBottom: 3 },
  coachNoteVideo: { display: "block", marginTop: 6, fontSize: 13, fontWeight: 600, color: "var(--accent)", textDecoration: "none" },
  empty: { fontSize: 13, color: "var(--mute)", fontStyle: "italic", padding: "16px 0" },
  savingNote: { fontSize: 11, color: "var(--mute)" },
  exCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 12, display: "flex", flexDirection: "column" as const, gap: 8 },
  exHead: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left" as const },
  exName: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  exHeadRight: { display: "flex", alignItems: "center", gap: 8 },
  exBadge: { fontSize: 11, fontWeight: 700, color: "var(--mute)", background: "var(--ink)", borderRadius: 6, padding: "2px 7px" },
  exChevron: { fontSize: 22, color: "var(--mute)", transition: "transform 0.2s" },
  exPresc: { fontSize: 12, color: "var(--mute)" },
  exCues: { fontSize: 12, color: "var(--mute)", fontStyle: "italic" as const, lineHeight: 1.5 },
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
