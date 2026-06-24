"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import VideoModal from "@/components/VideoModal";
import CheckInModal from "@/components/CheckInModal";
import SessionNotesBlock from "@/components/SessionNotesBlock";
import type { Session, SetLog } from "@/types";

export default function AthleteSessionView({
  session: initialSession,
  athleteName,
  token,
}: {
  session: Session;
  athleteName: string;
  token: string;
}) {
  const router = useRouter();
  const [session, setSession] = useState(initialSession);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [videoModal, setVideoModal] = useState<{ url: string; title: string } | null>(null);
  const [checkInOpen, setCheckInOpen] = useState(false);

  const exercises = (session.exercises ?? []).sort((a, b) => a.sort_order - b.sort_order);
  const totalSets = exercises.reduce((n, e) => n + (e.log ?? []).length, 0);
  const doneSets = exercises.reduce(
    (n, e) => n + (e.log ?? []).filter((s) => s.done || s.weight.trim().length > 0).length,
    0
  );
  const pct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;

  const handleSetUpdate = async (exerciseId: string, setIndex: number, patch: Partial<SetLog>) => {
    const exercise = session.exercises?.find((e) => e.id === exerciseId);
    if (!exercise) return;
    const newLog = (exercise.log ?? []).map((s, i) => (i === setIndex ? { ...s, ...patch } : s));

    // Optimistic update — reflect the change immediately, then confirm
    // with the server. If the save fails, the error banner shows but
    // the local change stays visible rather than snapping back, since
    // a flickering UI is worse for someone mid-set than a brief
    // inconsistency that a retry/refresh will resolve.
    setSession((prev) => ({
      ...prev,
      exercises: prev.exercises?.map((e) => (e.id === exerciseId ? { ...e, log: newLog } : e)),
    }));

    setSaving(exerciseId);
    setError("");
    try {
      const res = await fetch("/api/athlete-link/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, sessionId: session.id, exerciseId, log: newLog }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not save");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your set");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div style={styles.page}>
      <button style={styles.backLink} onClick={() => router.push(`/a/${token}`)}>
        ← Back to sessions
      </button>

      <div style={styles.header}>
        <div style={styles.headerTopRow}>
          <div>
            <div style={styles.sessionName}>{session.name}</div>
            <div style={styles.sessionMeta}>
              {session.date} · {athleteName}
            </div>
          </div>
          <button style={styles.checkInBtn} onClick={() => setCheckInOpen(true)}>
            ✓ Check-in
          </button>
        </div>
      </div>

      {checkInOpen && <CheckInModal onClose={() => setCheckInOpen(false)} />}

      {totalSets > 0 && (
        <div style={styles.progressWrap}>
          <div style={styles.progressBarBg}>
            <div style={{ ...styles.progressBarFill, width: `${pct}%` }} />
          </div>
          <span style={styles.progressLabel}>
            {doneSets}/{totalSets} sets · {pct}%
          </span>
        </div>
      )}

      {error && <div style={styles.errorBox}>{error}</div>}

      <SessionNotesBlock
        value={(session as any).session_notes ?? ""}
        onChange={() => {}}
        readOnly={true}
      />

      <div style={styles.exerciseList}>
        {exercises.map((ex) => (
          <div key={ex.id} style={styles.card}>
            <div style={styles.exHeadRow}>
              <div style={styles.exName}>{ex.name || "Exercise"}</div>
              {ex.video_url && (
                <button
                  style={styles.watchBtn}
                  onClick={() => setVideoModal({ url: ex.video_url, title: ex.name })}
                >
                  ▶ Watch
                </button>
              )}
            </div>
            <div style={styles.prescLine}>
              {ex.sets} sets × {ex.time && !ex.reps ? ex.time : ex.reps || "—"}
              {ex.rest ? ` · rest ${ex.rest}` : ""}
              {ex.target_load ? ` · ${ex.target_load}` : ""}
            </div>
            {ex.notes && <div style={styles.notes}>{ex.notes}</div>}

            <div style={styles.setGrid}>
              {(ex.log ?? []).map((set, i) => {
                const hasWeight = set.weight.trim().length > 0;
                return (
                  <div key={i} style={{ ...styles.setChip, ...(hasWeight || set.done ? styles.setChipDone : {}) }}>
                    <div style={styles.setIdx}>{i + 1}</div>
                    <input
                      value={set.weight}
                      onChange={(e) => {
                        const v = e.target.value;
                        const shouldBeDone = v.trim().length > 0;
                        const patch: Partial<SetLog> = { weight: v };
                        if (shouldBeDone !== set.done) patch.done = shouldBeDone;
                        // Auto-fill reps with lower bound of range if reps not yet entered
                        // but NOT for AMRAP (athlete enters actual reps themselves)
                        const isAmrap = ex.reps?.toUpperCase() === "AMRAP";
                        if (shouldBeDone && !set.reps.trim() && ex.reps && !isAmrap) {
                          const lower = ex.reps.match(/(\d+)/)?.[1] ?? "";
                          if (lower) patch.reps = lower;
                        }
                        handleSetUpdate(ex.id, i, patch);
                      }}
                      placeholder="kg"
                      inputMode="decimal"
                      style={styles.setInput}
                    />
                    <input
                      value={set.reps}
                      onChange={(e) => handleSetUpdate(ex.id, i, { reps: e.target.value })}
                      placeholder={ex.reps?.toUpperCase() === "AMRAP" ? "reps" : (ex.reps || "reps")}
                      inputMode="numeric"
                      style={styles.setInput}
                    />
                    <button
                      style={{ ...styles.doneBtn, ...(set.done ? styles.doneBtnOn : {}) }}
                      onClick={() => handleSetUpdate(ex.id, i, { done: !set.done })}
                    >
                      ✓
                    </button>
                  </div>
                );
              })}
            </div>
            {saving === ex.id && <div style={styles.savingLabel}>Saving…</div>}
          </div>
        ))}
        {!exercises.length && <div style={styles.empty}>No exercises in this session.</div>}
      </div>

      {videoModal && (
        <VideoModal
          videoUrl={videoModal.url}
          title={videoModal.title}
          onClose={() => setVideoModal(null)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", maxWidth: 480, margin: "0 auto", padding: "20px 16px" },
  backLink: {
    background: "transparent",
    border: "none",
    color: "var(--mute)",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
    marginBottom: 16,
  },
  header: { marginBottom: 16 },
  progressWrap: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 },
  progressBarBg: { flex: 1, height: 8, background: "var(--panel2)", borderRadius: 6, overflow: "hidden" },
  progressBarFill: { height: "100%", background: "var(--good)", borderRadius: 6, transition: "width .3s" },
  progressLabel: { fontSize: 12, color: "var(--mute)", fontWeight: 600, whiteSpace: "nowrap" },
  headerTopRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  checkInBtn: {
    background: "var(--accent-dim)",
    border: "none",
    color: "var(--accent)",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  sessionName: { fontSize: 22, fontWeight: 700, color: "var(--text)" },
  sessionMeta: { fontSize: 13, color: "var(--mute)", marginTop: 2 },
  errorBox: {
    background: "#2a0c0c",
    border: "1px solid #FF6B6B44",
    color: "#FF6B6B",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    marginBottom: 16,
  },
  exerciseList: { display: "flex", flexDirection: "column", gap: 12 },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14 },
  exHeadRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  exName: { fontWeight: 700, fontSize: 15, color: "var(--text)" },
  watchBtn: {
    background: "var(--accent-dim)",
    border: "none",
    color: "var(--accent)",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  prescLine: { fontSize: 13, color: "var(--mute)", marginTop: 4 },
  notes: { fontSize: 12, color: "var(--mute)", marginTop: 6, fontStyle: "italic" },
  setGrid: { display: "flex", flexDirection: "column", gap: 6, marginTop: 12 },
  setChip: { display: "flex", alignItems: "center", gap: 6, background: "var(--ink)", borderRadius: 8, padding: 6 },
  setChipDone: { boxShadow: "inset 0 0 0 1px var(--good)" },
  setIdx: {
    width: 22,
    height: 22,
    borderRadius: 6,
    background: "var(--panel2)",
    color: "var(--mute)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  },
  setInput: {
    flex: 1,
    background: "var(--panel2)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 6,
    padding: "8px 8px",
    fontSize: 14,
  },
  doneBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    border: "1px solid var(--line)",
    background: "transparent",
    color: "var(--line)",
    cursor: "pointer",
    flexShrink: 0,
    fontSize: 14,
  },
  doneBtnOn: { background: "var(--good-dim)", color: "var(--good)", borderColor: "var(--good)" },
  savingLabel: { fontSize: 11, color: "var(--mute)", marginTop: 6 },
  empty: { color: "var(--mute)", fontSize: 14, padding: "20px 0", textAlign: "center" },
};
