"use client";

// Athlete-facing Power/Speed session view. Previously P/S sessions fell
// through to the generic strength set-logger (weight/reps rows), which
// couldn't show the per-rep metric prescription. This renders the
// coach's tracked metrics as input boxes — set-level (Load/Reps) and
// per-rep (Time/Distance/Height/…) — and saves the PSSetLog[] via the
// same /api/athlete-link/log route the strength logger uses.

import { useState } from "react";
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
      {session.session_notes && (
        <div style={s.coachNote}><span style={s.coachNoteLabel}>Coach note</span>{session.session_notes}</div>
      )}

      {exercises.map((ex) => (
        <ExerciseLog
          key={ex.id}
          ex={ex}
          saving={saving === ex.id}
          onSave={(log) => saveExerciseLog(ex.id, log)}
        />
      ))}
      {exercises.length === 0 && <div style={s.empty}>No exercises in this session.</div>}

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

function ExerciseLog({ ex, saving, onSave }: { ex: any; saving: boolean; onSave: (log: PSSetLog[]) => void }) {
  const tracked = resolveTrackedMetrics(ex.ps_tracked_metrics, ex.tempo, ex.intensity_label);
  const reps = parseInt(String(ex.reps ?? "")) || 4;
  const completionOnly = !!ex.completion_only;
  const [log, setLog] = useState<PSSetLog[]>(() => normalizePSLog(ex.log, reps, tracked));

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
  const repMetric = (si: number, ri: number, key: PSMetricKey, val: string) =>
    commit(log.map((st, i) => {
      if (i !== si) return st;
      const rep_metrics = st.rep_metrics.map((r, idx) => (idx === ri ? { ...r, [key]: val } : r));
      const updated = { ...st, rep_metrics };
      return { ...updated, done: anyLogged(updated) || st.done };
    }));

  const done = log.filter((st) => st.done).length;

  return (
    <div style={s.exCard}>
      <div style={s.exHead}>
        <span style={s.exName}>{ex.order ? `${ex.order}. ` : ""}{ex.name}</span>
        <span style={s.exBadge}>{done}/{log.length}</span>
      </div>
      <div style={s.exPresc}>
        {ex.sets}×{reps}
        {ex.distance ? ` · ${ex.distance}` : ""}
        {ex.rest ? ` · rest ${ex.rest}` : ""}
        {!completionOnly && tracked.length ? ` · ${tracked.map((k) => PS_METRIC_META[k].short).join(" / ")}` : ""}
      </div>
      {ex.notes && <div style={s.exCues}>{ex.notes}</div>}
      {saving && <div style={s.savingNote}>Saving…</div>}

      {log.map((set, si) => (
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

          {!completionOnly && repMetrics.length > 0 && (
            Array.from({ length: Math.max(1, set.rep_metrics.length) }).map((_, ri) => (
              <div key={ri} style={s.repRow}>
                <span style={s.repLabel}>R{ri + 1}</span>
                {repMetrics.map((key) => (
                  <label key={key} style={s.repBox}>
                    <input value={set.rep_metrics[ri]?.[key] ?? ""} inputMode="decimal"
                      placeholder={PS_METRIC_META[key].placeholder}
                      onChange={(e) => repMetric(si, ri, key, e.target.value)} style={s.input} />
                    <span style={s.repUnit}>{PS_METRIC_META[key].short}</span>
                  </label>
                ))}
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 16, maxWidth: 560, margin: "0 auto" },
  backLink: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 13, cursor: "pointer", padding: 0 },
  meta: { fontSize: 12, color: "var(--mute)", padding: "0 16px 12px" },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 },
  coachNote: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "var(--text)", marginBottom: 12, lineHeight: 1.5 },
  coachNoteLabel: { display: "block", fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, marginBottom: 3 },
  empty: { fontSize: 13, color: "var(--mute)", fontStyle: "italic", padding: "16px 0" },
  savingNote: { fontSize: 11, color: "var(--mute)" },
  exCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 12, display: "flex", flexDirection: "column" as const, gap: 8 },
  exHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  exName: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  exBadge: { fontSize: 11, fontWeight: 700, color: "var(--mute)", background: "var(--ink)", borderRadius: 6, padding: "2px 7px" },
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
  repRow: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const },
  repLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", width: 24, flexShrink: 0 },
  repBox: { display: "flex", alignItems: "center", gap: 3 },
  repUnit: { fontSize: 10, color: "var(--mute)" },
  input: { width: 72, boxSizing: "border-box" as const, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "8px 9px", fontSize: 15, fontWeight: 700 },
};
