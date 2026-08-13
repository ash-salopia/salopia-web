"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import VideoModal from "@/components/VideoModal";
import CheckInModal from "@/components/CheckInModal";
import SessionNotesBlock from "@/components/SessionNotesBlock";
import SessionRPEBlock from "@/components/SessionRPEBlock";
import AthleteExerciseHistoryModal from "@/components/AthleteExerciseHistoryModal";
import AthleteSwapExerciseModal from "@/components/AthleteSwapExerciseModal";
import PBCelebrationModal from "@/components/PBCelebrationModal";
import RecoverySessionAthleteView from "@/components/recovery/RecoverySessionAthleteView";
import { saveWithRetry, usePendingSaveCount } from "@/lib/save-queue";
import type { Session, SessionExercise, SetLog } from "@/types";

interface DetectedPB {
  exerciseName: string;
  weightKg: number | null;
  reps: number | null;
  timeSeconds: number | null;
}

// Whether a set has anything logged in any of its currently-visible
// fields. Two independent toggles decide which fields are visible:
// weight shows unless the exercise is bodyweight-only, and reps vs
// time is decided purely by whether the exercise is prescribed in
// time mode (ex.time set) - independent of the bodyweight flag, so a
// weighted time-based exercise (e.g. a loaded carry) still logs a
// weight alongside the time. Used to guard set removal so it can only
// ever discard a genuinely empty trailing set, never real data,
// regardless of which field that data happens to live in.
function setHasData(exercise: SessionExercise, set: SetLog): boolean {
  const timeMode = (exercise.time ?? "").trim().length > 0;
  const hasWeight = !exercise.is_bodyweight && !!(set.weight ?? "").trim();
  const hasOther = timeMode ? !!(set.time ?? "").trim() : !!(set.reps ?? "").trim();
  return hasWeight || hasOther;
}

// The coach's free-text rest prescription ("90s", "2min", "1:30", or
// a bare "90") parsed into seconds for the rest timer. Returns null
// for anything unparseable so the timer button just doesn't show
// rather than starting at a nonsense duration.
function parseRestSeconds(rest: string | null | undefined): number | null {
  const s = (rest ?? "").trim().toLowerCase();
  if (!s) return null;
  const colonMatch = s.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) return parseInt(colonMatch[1], 10) * 60 + parseInt(colonMatch[2], 10);
  const minMatch = s.match(/^(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes|m)\b/);
  if (minMatch) return Math.round(parseFloat(minMatch[1]) * 60);
  const secMatch = s.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds)?\b/);
  if (secMatch) return Math.round(parseFloat(secMatch[1]));
  return null;
}

function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Most recent PRIOR occurrence (by date) of each exercise name for this
// athlete, keyed by lowercased/trimmed name, mapped to that occurrence's
// own progress answer. Used to show "you said you could progress this
// last time" - deliberately only looks at the single most recent prior
// occurrence, not any earlier one, so a "no" always clears the reminder
// for next time regardless of an older "yes" further back.
function computePriorProgress(
  allSessions: Session[],
  currentSession: Session
): Map<string, "yes" | "no" | ""> {
  const prior = allSessions
    .filter((s) => s.id !== currentSession.id && s.date < currentSession.date)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // most recent first

  const result = new Map<string, "yes" | "no" | "">();
  for (const s of prior) {
    for (const ex of s.exercises ?? []) {
      const key = ex.name.toLowerCase().trim();
      if (!result.has(key)) result.set(key, ex.progress || "");
    }
  }
  return result;
}

export default function AthleteSessionView({
  session: initialSession,
  allSessions: initialAllSessions,
  sessionId,
  athleteName,
  token,
}: {
  session?: Session;
  allSessions?: Session[];
  sessionId?: string;
  athleteName: string;
  token: string;
}) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(initialSession ?? null);
  const [allSessions, setAllSessions] = useState<Session[]>(initialAllSessions ?? []);
  const [loadError, setLoadError] = useState("");

  // Reusable so a swap/opt-out action can pull the freshly updated
  // exercise row without having to replicate the server's field logic
  // (e.g. which name counts as "the original" for a revert) client-side.
  const refetchSession = useCallback(() => {
    const id = sessionId ?? initialSession?.id;
    if (!id) return;
    fetch(`/api/athlete-link/sessions?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const sessions: Session[] = data.sessions ?? [];
        const found = sessions.find((s) => s.id === id);
        if (found) {
          setSession(found);
          setAllSessions(sessions);
        } else {
          setLoadError("Session not found.");
        }
      })
      .catch(() => setLoadError("Could not load session."));
  }, [token, sessionId, initialSession]);

  useEffect(() => {
    if (initialSession) return; // server already gave us the session
    refetchSession();
  }, [initialSession, refetchSession]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [videoModal, setVideoModal] = useState<{ url: string; title: string } | null>(null);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [historyExercise, setHistoryExercise] = useState<string | null>(null);
  const [swapExerciseId, setSwapExerciseId] = useState<string | null>(null);
  const [pbCelebration, setPbCelebration] = useState<DetectedPB | null>(null);
  const [openNotesFor, setOpenNotesFor] = useState<Set<string>>(new Set());
  // Bodyweight exercises hide the weight field by default, but an
  // athlete who's progressed past bodyweight (e.g. added a vest to
  // chin-ups) needs a way to log that load before the coach updates
  // the prescription - this per-exercise toggle reveals it on demand,
  // purely client-side (doesn't change the exercise's is_bodyweight
  // flag or its PB shape).
  const [showLoadFor, setShowLoadFor] = useState<Set<string>>(new Set());
  // Rest timer - one active at a time, keyed by end timestamp rather
  // than a decrementing counter so it stays accurate even if the tab
  // is backgrounded for a while.
  const [restTimer, setRestTimer] = useState<{ exerciseId: string; endAt: number; total: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pendingSaves = usePendingSaveCount();

  useEffect(() => {
    if (!restTimer) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [restTimer?.exerciseId, restTimer?.endAt]);

  const restRemaining = restTimer ? Math.max(0, Math.ceil((restTimer.endAt - now) / 1000)) : 0;

  useEffect(() => {
    if (!restTimer || restRemaining > 0) return;
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([200, 100, 200]);
    const t = setTimeout(() => setRestTimer(null), 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restRemaining === 0, restTimer?.exerciseId]);

  const exercises = (session?.exercises ?? []).sort((a, b) => a.sort_order - b.sort_order);
  // Opted-out exercises have no sets to log, so they're excluded from
  // progress totals - otherwise a skipped exercise would permanently
  // depress the session's completion percentage.
  const loggableExercises = exercises.filter((e) => !e.opted_out);
  const totalSets = loggableExercises.reduce((n, e) => n + (e.log ?? []).length, 0);
  const doneSets = loggableExercises.reduce(
    // A %1RM-prescribed set's weight box is pre-filled with the
    // calculated target before the athlete does anything, so its
    // presence alone can't count as "completed" the way a typed-in
    // weight normally does - only an explicit done-tap does.
    (n, e) => n + (e.log ?? []).filter((s) => s.done || (!e.use_percent_1rm && (s.weight ?? "").trim().length > 0)).length,
    0
  );
  const pct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;
  const priorProgress = session ? computePriorProgress(allSessions, session) : new Map();

  const handleProgressAnswer = async (exerciseId: string, progress: "yes" | "no") => {
    const exercise = session?.exercises?.find((e) => e.id === exerciseId);
    if (!exercise) return;

    // Optimistic update, same pattern as handleSetUpdate below.
    setSession((prev) => prev ? ({
      ...prev,
      exercises: prev.exercises?.map((e) => (e.id === exerciseId ? { ...e, progress } : e)),
    }) : prev);

    const result = await saveWithRetry(
      `progress:${session?.id}:${exerciseId}`,
      "/api/athlete-link/progress",
      { token, exerciseId, progress }
    );
    if (!result.ok && !result.queued) {
      setError(result.error);
    }
  };

  const handleUndoOptOut = async (exerciseId: string) => {
    setError("");
    try {
      const res = await fetch("/api/athlete-link/opt-out-exercise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, sessionId: session?.id, exerciseId, optedOut: false }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Could not update");
      refetchSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update");
    }
  };

  const handleAthleteNotesChange = (athlete_notes: string) => {
    setSession((prev) => (prev ? { ...prev, athlete_notes } : prev));
  };

  // Fires once, when the athlete leaves the notes field, rather than on
  // every keystroke - a save fired per keystroke can race on a patchy
  // gym connection (an earlier, shorter in-flight request landing after
  // a later, fuller one) and leave a truncated note.
  const saveAthleteNotes = async (sessionId: string, notes: string) => {
    const result = await saveWithRetry(`notes:${sessionId}`, "/api/athlete-link/session-notes", {
      token,
      sessionId,
      notes,
    });
    if (result.ok) {
      setError("");
    } else if (!result.queued) {
      setError(result.error);
    }
  };

  const handleRPESave = async (rpe: number) => {
    if (!session) return;
    const sessionId = session.id;
    setSession((prev) => (prev ? { ...prev, rpe, rpe_logged_at: new Date().toISOString() } : prev));
    const result = await saveWithRetry(`rpe:${sessionId}`, "/api/athlete-link/rpe", {
      token,
      sessionId,
      rpe,
    });
    if (result.ok) {
      setError("");
    } else if (!result.queued) {
      setError(result.error);
      throw new Error(result.error);
    }
  };

  const toggleNotesFor = (exerciseId: string) => {
    setOpenNotesFor((prev) => {
      const next = new Set(prev);
      if (next.has(exerciseId)) next.delete(exerciseId); else next.add(exerciseId);
      return next;
    });
  };

  const handleExerciseNotesChange = (exerciseId: string, notes: string) => {
    setSession((prev) => prev ? ({
      ...prev,
      exercises: prev.exercises?.map((e) => (e.id === exerciseId ? { ...e, athlete_exercise_notes: notes } : e)),
    }) : prev);
  };

  const saveExerciseNotes = async (sessionId: string, exerciseId: string, notes: string) => {
    const result = await saveWithRetry(`exnotes:${sessionId}:${exerciseId}`, "/api/athlete-link/exercise-notes", {
      token,
      sessionId,
      exerciseId,
      notes,
    });
    if (result.ok) {
      setError("");
    } else if (!result.queued) {
      setError(result.error);
    }
  };

  const handleSetUpdate = async (exerciseId: string, setIndex: number, patch: Partial<SetLog>) => {
    const exercise = session?.exercises?.find((e) => e.id === exerciseId);
    if (!exercise) return;
    const newLog = (exercise.log ?? []).map((s, i) => (i === setIndex ? { ...s, ...patch } : s));

    // Optimistic update - reflect the change immediately, then confirm
    // with the server. If the save fails, the error banner shows but
    // the local change stays visible rather than snapping back, since
    // a flickering UI is worse for someone mid-set than a brief
    // inconsistency that a retry/refresh will resolve.
    setSession((prev) => prev ? ({
      ...prev,
      exercises: prev.exercises?.map((e) => (e.id === exerciseId ? { ...e, log: newLog } : e)),
    }) : prev);

    setSaving(exerciseId);
    setError("");
    const result = await saveWithRetry(
      `log:${session?.id}:${exerciseId}`,
      "/api/athlete-link/log",
      { token, sessionId: session?.id, exerciseId, log: newLog }
    );
    if (!result.ok && !result.queued) {
      setError(result.error);
    }
    if (result.ok && result.data?.pb) {
      setPbCelebration(result.data.pb);
    }
    setSaving(null);
  };

  // Lets an athlete log more sets than the coach prescribed (e.g. they
  // felt good and did an extra set) without touching ex.sets itself -   // that field is the coach's prescription and stays coach-only (see
  // updateAthleteSetLog's docstring). Reuses the same log save path as
  // handleSetUpdate, just with one more blank entry appended.
  const handleAddSet = async (exerciseId: string) => {
    const exercise = session?.exercises?.find((e) => e.id === exerciseId);
    if (!exercise) return;
    const newLog = [...(exercise.log ?? []), { weight: "", reps: "", done: false }];

    setSession((prev) => prev ? ({
      ...prev,
      exercises: prev.exercises?.map((e) => (e.id === exerciseId ? { ...e, log: newLog } : e)),
    }) : prev);

    setSaving(exerciseId);
    setError("");
    const result = await saveWithRetry(
      `log:${session?.id}:${exerciseId}`,
      "/api/athlete-link/log",
      { token, sessionId: session?.id, exerciseId, log: newLog }
    );
    if (!result.ok && !result.queued) {
      setError(result.error);
    }
    setSaving(null);
  };

  // Undo for an accidental tap - only ever removes a trailing set
  // that's still empty, so there's no path to silently discarding a
  // set the athlete actually logged.
  const handleRemoveLastSet = async (exerciseId: string) => {
    const exercise = session?.exercises?.find((e) => e.id === exerciseId);
    if (!exercise) return;
    const log = exercise.log ?? [];
    const last = log[log.length - 1];
    if (!last || last.done || setHasData(exercise, last)) return;
    const newLog = log.slice(0, -1);

    setSession((prev) => prev ? ({
      ...prev,
      exercises: prev.exercises?.map((e) => (e.id === exerciseId ? { ...e, log: newLog } : e)),
    }) : prev);

    setSaving(exerciseId);
    setError("");
    const result = await saveWithRetry(
      `log:${session?.id}:${exerciseId}`,
      "/api/athlete-link/log",
      { token, sessionId: session?.id, exerciseId, log: newLog }
    );
    if (!result.ok && !result.queued) {
      setError(result.error);
    }
    setSaving(null);
  };

  if (loadError) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--mute)" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>?</div>
        <div style={{ fontSize: 16, color: "var(--text)", fontWeight: 700 }}>{loadError}</div>
        <button
          style={{ marginTop: 16, background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          onClick={() => router.push(`/a/${token}`)}
        >← Back to calendar</button>
      </div>
    );
  }

  if (!session) {
    return <div style={{ padding: 32, textAlign: "center", color: "var(--mute)", fontSize: 14 }}>Loading…</div>;
  }

  // Recovery sessions render nothing like the exercise-log layout
  // below (no session_exercises rows to speak of for most formats) -   // delegate to a dedicated component rather than threading `type ===
  // "recovery"` conditionals through this already-large file.
  if (session.type === "recovery") {
    return (
      <RecoverySessionAthleteView
        session={session}
        athleteName={athleteName}
        token={token}
        onUpdated={refetchSession}
        onBack={() => router.push(`/a/${token}`)}
      />
    );
  }

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

      {pendingSaves > 0 && (
        <div style={styles.pendingBox}>
          ☁️ {pendingSaves} change{pendingSaves !== 1 ? "s" : ""} waiting for a connection - will save automatically
        </div>
      )}

      <SessionNotesBlock
        value={session.session_notes ?? ""}
        onChange={() => {}}
        readOnly={true}
      />

      <div style={styles.exerciseList}>
        {exercises.map((ex) => {
          const priorAnswer = priorProgress.get(ex.name.toLowerCase().trim());
          const allSetsDone = (ex.log ?? []).length > 0 && (ex.log ?? []).every((s) => s.done);
          return (
          <div key={ex.id} style={styles.card}>
            <div style={styles.exHeadRow}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                {ex.order && <span style={styles.orderBadge}>{ex.order}</span>}
                <div style={styles.exName}>{ex.name || "Exercise"}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {ex.name.trim() && (
                  <button
                    style={styles.historyBtn}
                    onClick={() => setHistoryExercise(ex.name)}
                    title="View history & PB"
                  >
                    📈
                  </button>
                )}
                {!ex.opted_out && (
                  <button
                    style={styles.historyBtn}
                    onClick={() => setSwapExerciseId(ex.id)}
                    title="Swap or skip this exercise"
                  >
                    🔀
                  </button>
                )}
                <button
                  style={{ ...styles.historyBtn, ...(ex.athlete_exercise_notes ? styles.historyBtnActive : {}) }}
                  onClick={() => toggleNotesFor(ex.id)}
                  title="Note on this exercise"
                >
                  📝
                </button>
                {ex.video_url && (
                  <button
                    style={styles.watchBtn}
                    onClick={() => setVideoModal({ url: ex.video_url, title: ex.name })}
                  >
                    ▶ Watch
                  </button>
                )}
              </div>
            </div>

            {ex.swapped_from && (
              <div style={styles.swappedNote}>🔀 Swapped from &quot;{ex.swapped_from}&quot;</div>
            )}

            {ex.opted_out ? (
              <div style={styles.optedOutRow}>
                <span style={styles.optedOutLabel}>⏭ Skipped for this session</span>
                <button style={styles.undoSkipBtn} onClick={() => handleUndoOptOut(ex.id)}>
                  ↩ Undo
                </button>
              </div>
            ) : (
              <>
                <div style={styles.prescLine}>
                  {ex.sets} sets × {ex.time && !ex.reps ? ex.time : ex.reps || "-"}
                  {ex.each_side ? " each side" : ""}
                  {ex.rest ? ` · rest ${ex.rest}` : ""}
                  {ex.is_bodyweight ? " · 🏋️ bodyweight" : ""}
                  {ex.target_load ? ` · ${ex.target_load}` : ""}
                  {/* Tempo is a rep-cadence concept (e.g. 3-1-1-0) - doesn't
                      apply to a timed hold, so it only shows for reps-based
                      exercises, matching the coach builder's same rule. */}
                  {!(ex.time && !ex.reps) && ex.tempo ? ` · tempo ${ex.tempo}` : ""}
                  {ex.use_percent_1rm && (ex.set_percents ?? []).some((p) => p)
                    ? ` · ${(ex.set_percents ?? []).filter((p) => p).join("/")}%1RM`
                    : ""}
                </div>
                {ex.notes && <div style={styles.notes}>{ex.notes}</div>}
                {priorAnswer === "yes" && (
                  <div style={styles.progressReminder}>💪 Last time you said you could progress this - try more weight or reps!</div>
                )}

                {openNotesFor.has(ex.id) && (
                  <textarea
                    value={ex.athlete_exercise_notes ?? ""}
                    onChange={(e) => handleExerciseNotesChange(ex.id, e.target.value)}
                    onBlur={() => saveExerciseNotes(session.id, ex.id, ex.athlete_exercise_notes ?? "")}
                    placeholder="Anything to note about this exercise - how it felt, form cues, niggles…"
                    style={styles.exNotesTextarea}
                  />
                )}

                {(() => {
                  // Two independent toggles: weight shows unless the
                  // exercise is bodyweight-only; reps vs time is
                  // decided purely by the exercise's time prescription,
                  // regardless of bodyweight - so a weighted time-based
                  // exercise (e.g. a loaded carry) still logs a weight
                  // alongside the time, not just a bodyweight one.
                  // A bodyweight exercise can still reveal the weight
                  // field on demand via "+ Add load", for an athlete
                  // who's progressed past bodyweight before the coach
                  // updates the prescription. Hoisted above the set map
                  // so the column headers can share the same values.
                  const showWeight = !ex.is_bodyweight || showLoadFor.has(ex.id);
                  const timeMode = (ex.time ?? "").trim().length > 0;
                  // Header and every row share this exact template string
                  // so the Load/Reps/Time columns line up pixel-for-pixel -                   // the "copy last set" slot is always reserved as its own
                  // fixed-width track (populated or not) so a row that
                  // happens to show that button doesn't squeeze its input
                  // columns narrower than the header or its sibling rows.
                  const gridCols = showWeight ? "22px 1fr 1fr 56px 32px" : "22px 1fr 56px 32px";
                  return (
                <div style={styles.setSectionRow}>
                  <div style={styles.setsVerticalLabel}>SETS</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...styles.setColHeaders, gridTemplateColumns: gridCols }}>
                      <div />
                      {showWeight && <div style={styles.setColLabel}>Load</div>}
                      <div style={styles.setColLabel}>{timeMode ? "Time" : "Reps"}</div>
                      <div />
                      <div />
                    </div>
                    <div style={styles.setGrid}>
                  {(ex.log ?? []).map((set, i) => {
                    // For a %1RM-prescribed exercise the weight box
                    // arrives pre-filled with the calculated target
                    // before the athlete has done anything - so its
                    // mere presence can't be treated as "confirmed"
                    // the way a typed-in weight normally is. Only an
                    // explicit ✓ tap (or reps/time entry) counts.
                    const hasWeight = showWeight && !ex.use_percent_1rm && (set.weight ?? "").trim().length > 0;
                    const hasOther = timeMode ? (set.time ?? "").trim().length > 0 : (set.reps ?? "").trim().length > 0;
                    const hasPrimaryValue = hasWeight || hasOther;
                    const prevSet = i > 0 ? (ex.log ?? [])[i - 1] : null;
                    const prevHasData = !!prevSet && setHasData(ex, prevSet);
                    const canCopyPrev = !hasPrimaryValue && !set.done && prevHasData;
                    return (
                      <div key={i} style={{ ...styles.setChip, gridTemplateColumns: gridCols, ...(hasPrimaryValue || set.done ? styles.setChipDone : {}) }}>
                        <div style={styles.setIdx}>{i + 1}</div>
                        {showWeight && (
                          <input
                            key={`${ex.id}-${i}-w-${set.weight}`}
                            defaultValue={set.weight}
                            onFocus={(e) => e.target.select()}
                            onBlur={(e) => {
                              const v = e.target.value;
                              if (v === set.weight) return;
                              const shouldBeDone = v.trim().length > 0;
                              const patch: Partial<SetLog> = { weight: v };
                              if (shouldBeDone !== set.done) patch.done = shouldBeDone;
                              const isAmrap = ex.reps?.toUpperCase() === "AMRAP";
                              if (!timeMode && shouldBeDone && !set.reps.trim() && ex.reps && !isAmrap) {
                                const lower = ex.reps.match(/(\d+)/)?.[1] ?? "";
                                if (lower) patch.reps = lower;
                              }
                              handleSetUpdate(ex.id, i, patch);
                            }}
                            placeholder={ex.computed_targets?.[i] != null ? String(ex.computed_targets[i]) : "kg"}
                            inputMode="decimal"
                            style={styles.setInput}
                          />
                        )}
                        {timeMode ? (
                          <input
                            key={`${ex.id}-${i}-t-${set.time}`}
                            defaultValue={set.time ?? ""}
                            onFocus={(e) => e.target.select()}
                            onBlur={(e) => {
                              const v = e.target.value;
                              if (v === (set.time ?? "")) return;
                              const shouldBeDone = v.trim().length > 0;
                              const patch: Partial<SetLog> = { time: v };
                              if (shouldBeDone !== set.done) patch.done = shouldBeDone;
                              handleSetUpdate(ex.id, i, patch);
                            }}
                            placeholder={ex.time || "sec"}
                            inputMode="numeric"
                            style={styles.setInput}
                          />
                        ) : (
                          <input
                            value={set.reps}
                            onChange={(e) => handleSetUpdate(ex.id, i, { reps: e.target.value })}
                            onFocus={(e) => e.target.select()}
                            placeholder={ex.reps?.toUpperCase() === "AMRAP" ? "reps" : (ex.reps || "reps")}
                            inputMode="numeric"
                            style={styles.setInput}
                          />
                        )}
                        <div style={styles.copySlot}>
                          {canCopyPrev && (
                            <button
                              style={styles.copyLastBtn}
                              onClick={() => {
                                const patch: Partial<SetLog> = { done: true };
                                if (showWeight) patch.weight = prevSet!.weight;
                                if (timeMode) patch.time = prevSet!.time; else patch.reps = prevSet!.reps;
                                handleSetUpdate(ex.id, i, patch);
                              }}
                              title="Copy the previous set"
                            >
                              ↑ Same
                            </button>
                          )}
                        </div>
                        <button
                          style={{ ...styles.doneBtn, ...(set.done ? styles.doneBtnOn : {}) }}
                          onClick={() => {
                            if (set.done) {
                              handleSetUpdate(ex.id, i, { done: false });
                              return;
                            }
                            const patch: Partial<SetLog> = { done: true };
                            // Tapping done on a still-empty %1RM box
                            // captures the greyed suggestion as the
                            // real logged weight - the box only ever
                            // shows it as a placeholder (so it never
                            // reads as "already entered"), but
                            // confirming without typing over it should
                            // still record what was actually suggested.
                            const target = ex.computed_targets?.[i];
                            if (showWeight && !set.weight.trim() && target != null) {
                              patch.weight = String(target);
                            }
                            // Same idea for reps: the greyed box shows
                            // the prescribed rep count as a placeholder,
                            // never written into set.reps unless typed.
                            // Without this, a set finished by tapping ✓
                            // alone silently logs zero reps, and a
                            // bodyweight/rep-based PB can never trigger
                            // (detectPB in the log route needs a real
                            // reps number).
                            const isAmrap = ex.reps?.toUpperCase() === "AMRAP";
                            if (!timeMode && !set.reps.trim() && ex.reps && !isAmrap) {
                              const lower = ex.reps.match(/(\d+)/)?.[1] ?? "";
                              if (lower) patch.reps = lower;
                            }
                            handleSetUpdate(ex.id, i, patch);
                          }}
                        >
                          ✓
                        </button>
                      </div>
                    );
                  })}
                    </div>
                  </div>
                </div>
                  );
                })()}
                <div style={styles.addSetRow}>
                  <button style={styles.addSetBtn} onClick={() => handleAddSet(ex.id)}>
                    + Add set
                  </button>
                  {ex.is_bodyweight && !showLoadFor.has(ex.id) && (
                    <button
                      style={styles.addSetBtn}
                      onClick={() => setShowLoadFor((prev) => new Set(prev).add(ex.id))}
                      title="Progressed past bodyweight? Add a load for this session"
                    >
                      + Add load
                    </button>
                  )}
                  {(() => {
                    const log = ex.log ?? [];
                    const last = log[log.length - 1];
                    const canRemove = log.length > 0 && !!last && !last.done && !setHasData(ex, last);
                    return canRemove ? (
                      <button style={styles.removeSetBtn} onClick={() => handleRemoveLastSet(ex.id)}>
                        − Remove
                      </button>
                    ) : null;
                  })()}
                </div>
                {(() => {
                  const restSeconds = parseRestSeconds(ex.rest);
                  if (restSeconds == null || restSeconds <= 0) return null;
                  const isActive = restTimer?.exerciseId === ex.id;
                  if (!isActive) {
                    return (
                      <button
                        style={styles.restTimerStartBtn}
                        onClick={() => setRestTimer({ exerciseId: ex.id, endAt: Date.now() + restSeconds * 1000, total: restSeconds })}
                      >
                        ⏱ Start rest ({ex.rest})
                      </button>
                    );
                  }
                  const done = restRemaining <= 0;
                  const progressPct = Math.max(0, Math.min(100, (restRemaining / restTimer!.total) * 100));
                  return (
                    <div style={{ ...styles.restTimerActive, ...(done ? styles.restTimerActiveDone : {}) }}>
                      <div style={styles.restTimerBarTrack}>
                        <div style={{ ...styles.restTimerBarFill, width: `${progressPct}%`, ...(done ? { background: "var(--good)" } : {}) }} />
                      </div>
                      <div style={styles.restTimerRow}>
                        <span style={{ ...styles.restTimerLabel, ...(done ? { color: "var(--good)" } : {}) }}>
                          {done ? "✓ Rest complete" : `⏱ Resting… ${formatMMSS(restRemaining)}`}
                        </span>
                        <button style={styles.restTimerSkipBtn} onClick={() => setRestTimer(null)}>
                          {done ? "Dismiss" : "Skip"}
                        </button>
                      </div>
                    </div>
                  );
                })()}
                {saving === ex.id && <div style={styles.savingLabel}>Saving…</div>}
                {allSetsDone && !ex.progress && (
                  <div style={styles.progressPrompt}>
                    <span style={styles.progressPromptLabel}>Could you have progressed this next session?</span>
                    <div style={styles.progressPromptBtns}>
                      <button style={styles.progressYesBtn} onClick={() => handleProgressAnswer(ex.id, "yes")}>
                        Yes
                      </button>
                      <button style={styles.progressNoBtn} onClick={() => handleProgressAnswer(ex.id, "no")}>
                        No
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          );
        })}
        {!exercises.length && <div style={styles.empty}>No exercises in this session.</div>}
      </div>

      <SessionRPEBlock value={session.rpe ?? null} onSave={handleRPESave} />

      <SessionNotesBlock
        value={session.athlete_notes ?? ""}
        onChange={handleAthleteNotesChange}
        onBlur={() => saveAthleteNotes(session.id, session.athlete_notes ?? "")}
        label="Your Notes"
        icon="📝"
        placeholder="How did the session feel? Anything to flag for your coach…"
        enableTemplates={false}
      />

      {videoModal && (
        <VideoModal
          videoUrl={videoModal.url}
          title={videoModal.title}
          onClose={() => setVideoModal(null)}
        />
      )}

      {historyExercise && (
        <AthleteExerciseHistoryModal
          token={token}
          exerciseName={historyExercise}
          onClose={() => setHistoryExercise(null)}
        />
      )}

      {swapExerciseId && session && (() => {
        const ex = session.exercises?.find((e) => e.id === swapExerciseId);
        if (!ex) return null;
        return (
          <AthleteSwapExerciseModal
            token={token}
            sessionId={session.id}
            exerciseId={ex.id}
            currentName={ex.name}
            alternativeNames={ex.alternative_names ?? []}
            swappedFrom={ex.swapped_from}
            onDone={() => { setSwapExerciseId(null); refetchSession(); }}
            onClose={() => setSwapExerciseId(null)}
          />
        );
      })()}

      {pbCelebration && (
        <PBCelebrationModal
          exerciseName={pbCelebration.exerciseName}
          weightKg={pbCelebration.weightKg}
          reps={pbCelebration.reps}
          timeSeconds={pbCelebration.timeSeconds}
          onClose={() => setPbCelebration(null)}
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
  pendingBox: {
    background: "var(--accent-dim)",
    border: "1px solid var(--accent)44",
    color: "var(--accent)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 16,
  },
  exerciseList: { display: "flex", flexDirection: "column", gap: 12 },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14 },
  exHeadRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  exName: { fontWeight: 700, fontSize: 15, color: "var(--text)" },
  swappedNote: { fontSize: 11, color: "var(--accent)", fontWeight: 600, marginTop: 4 },
  optedOutRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 10, marginTop: 8, background: "var(--panel2)", borderRadius: 8, padding: "10px 12px",
  },
  optedOutLabel: { fontSize: 13, color: "var(--mute)", fontWeight: 600 },
  undoSkipBtn: {
    background: "transparent", border: "1px solid var(--line)", color: "var(--accent)",
    borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  orderBadge: { fontSize: 12, fontWeight: 800, color: "var(--accent)", background: "var(--accent-dim)", borderRadius: 6, padding: "2px 7px", flexShrink: 0, fontFamily: "'Barlow Condensed', sans-serif" },
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
  historyBtn: {
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    fontSize: 14,
    cursor: "pointer",
    borderRadius: 8,
    width: 32,
    height: 32,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  historyBtnActive: { borderColor: "var(--accent)", color: "var(--accent)" },
  prescLine: { fontSize: 13, color: "var(--mute)", marginTop: 4 },
  notes: { fontSize: 12, color: "var(--mute)", marginTop: 6, fontStyle: "italic" },
  exNotesTextarea: {
    width: "100%", minHeight: 60, marginTop: 8, background: "var(--ink)", border: "1px solid var(--line)",
    color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 16, lineHeight: 1.5,
    resize: "vertical" as const, fontFamily: "inherit",
  },
  setSectionRow: { display: "flex", gap: 8, marginTop: 12, alignItems: "stretch" },
  setsVerticalLabel: {
    writingMode: "vertical-rl" as const,
    transform: "rotate(180deg)",
    textAlign: "center" as const,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 2,
    color: "var(--mute)",
    background: "var(--panel2)",
    borderRadius: 6,
    padding: "8px 3px",
    flexShrink: 0,
  },
  setColHeaders: { display: "grid", alignItems: "center", gap: 6, padding: "0 6px", marginBottom: 4 },
  setColLabel: { fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: 0.5 },
  setGrid: { display: "flex", flexDirection: "column", gap: 6 },
  addSetRow: { display: "flex", gap: 8, marginTop: 8 },
  addSetBtn: {
    flex: 1, background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)",
    borderRadius: 8, padding: "8px 0", fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  removeSetBtn: {
    background: "transparent", border: "1px solid var(--line)", color: "var(--mute)",
    borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const,
  },
  setChip: { display: "grid", alignItems: "center", gap: 6, background: "var(--ink)", borderRadius: 8, padding: 6 },
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
    width: "100%",
    minWidth: 0,
    background: "var(--panel2)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 6,
    padding: "8px 8px",
    // iOS Safari auto-zooms on focus for any input under 16px, then
    // doesn't reliably zoom back out on blur - 16px is the minimum
    // that avoids triggering it.
    fontSize: 16,
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
  copySlot: { width: "100%", minWidth: 0 },
  copyLastBtn: {
    width: "100%", background: "var(--accent-dim)", border: "1px solid var(--accent)44", color: "var(--accent)",
    borderRadius: 6, padding: "0 4px", height: 32, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const,
  },
  savingLabel: { fontSize: 11, color: "var(--mute)", marginTop: 6 },
  restTimerStartBtn: {
    width: "100%", marginTop: 8, background: "var(--accent-dim)", border: "1px solid var(--accent)44",
    color: "var(--accent)", borderRadius: 8, padding: "9px 0", fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  restTimerActive: {
    marginTop: 8, background: "var(--panel2)", border: "1px solid var(--accent)",
    borderRadius: 8, padding: 8, overflow: "hidden" as const,
  },
  restTimerActiveDone: { borderColor: "var(--good)" },
  restTimerBarTrack: { height: 4, background: "var(--ink)", borderRadius: 2, overflow: "hidden" as const, marginBottom: 6 },
  restTimerBarFill: { height: "100%", background: "var(--accent)" },
  restTimerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  restTimerLabel: { fontSize: 13, fontWeight: 700, color: "var(--accent)" },
  restTimerSkipBtn: {
    background: "transparent", border: "1px solid var(--line)", color: "var(--mute)",
    borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0,
  },
  empty: { color: "var(--mute)", fontSize: 14, padding: "20px 0", textAlign: "center" },
  progressReminder: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--accent)",
    background: "var(--accent-dim)",
    borderRadius: 8,
    padding: "8px 10px",
    marginTop: 8,
  },
  progressPrompt: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    background: "var(--panel2)",
    borderRadius: 8,
    padding: "10px 12px",
    marginTop: 10,
  },
  progressPromptLabel: { fontSize: 12, color: "var(--text)", fontWeight: 600, flex: 1 },
  progressPromptBtns: { display: "flex", gap: 8, flexShrink: 0 },
  progressYesBtn: {
    background: "var(--good-dim)",
    color: "var(--good)",
    border: "none",
    borderRadius: 6,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  progressNoBtn: {
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    borderRadius: 6,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
};
