"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { getOrgSettings } from "@/lib/data/settings";
import {
  getSession,
  updateSession,
  updateExercise,
  deleteExercise,
  deleteSession,
  applyToFutureSessions,
  propagateFutureOccurrences,
  updateExerciseLog,
  type PropagateScope,
} from "@/lib/data/sessions";
import { createClient } from "@/lib/supabase-browser";
import { importCsv } from "@/lib/csv-import";
import { listLibrary } from "@/lib/data/library";
import { saveSessionAsTemplate } from "@/lib/data/templates";
import ExerciseCard from "@/components/ExerciseCard";
import HyroxTimer from "@/components/HyroxTimer";
import HyroxCardioBuilder from "@/components/HyroxCardioBuilder";
import CheckInModal from "@/components/CheckInModal";
import VoiceSessionModal from "@/components/VoiceSessionModal";
import NotesSessionModal from "@/components/NotesSessionModal";
import PowerSpeedExerciseCard from "@/components/PowerSpeedExerciseCard";
import PowerSpeedSummaryBar from "@/components/PowerSpeedSummaryBar";
import type { PSExercise, PSSetLog } from "@/components/PowerSpeedExerciseCard";
import SessionNotesBlock from "@/components/SessionNotesBlock";
import type { Session, SessionExercise, SetLog, LibraryEntry } from "@/types";

type SessionStub = { id: string; name: string; date: string; type: string };

const STUB_TYPE_COLOR: Record<string, string> = {
  strength: "#3B8BEB", hyrox: "#B388FF", cardio: "#4DC3FF", power_speed: "#A855F7",
};

export default function SessionDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string; sessionId: string }>();
  const { id: athleteId, sessionId } = params;
  const fileRef = useRef<HTMLInputElement>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [otherSessions, setOtherSessions] = useState<SessionStub[]>([]);
  const [showOtherSessions, setShowOtherSessions] = useState(false);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [timerOpen, setTimerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [timerWork, setTimerWork] = useState(40);
  const [timerRest, setTimerRest] = useState(20);
  const [timerRounds, setTimerRounds] = useState(8);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkinEnabled, setCheckinEnabled] = useState(true);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState("");
  const [propagateScope, setPropagateScope] = useState<PropagateScope | "none">("none");
  const [propagating, setPropagating] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  // Convert DB session exercise to PSExercise shape
  const toPSExercise = (ex: any): PSExercise => {
    const sets = ex.sets ?? 3;
    const reps = parseInt(String(ex.reps ?? "")) || 4;  // default 4 reps for P/S
    // Detect if log already has the new per-rep shape
    const hasNewShape = Array.isArray(ex.log) && ex.log.length > 0 &&
      typeof ex.log[0] === 'object' && 'rep_results' in ex.log[0];
    const log = hasNewShape
      ? ex.log
      : Array.from({ length: sets }, () => ({
          done: false,
          rep_results: Array(reps).fill(""),
          single_value: false,
          contact_time: "",
          rsi: "",
          rpe: "",
          pain: "",
          set_notes: "",
        }));
    return {
      id: ex.id,
      name: ex.name ?? "",
      order: ex.order ?? "",
      quality: ex.intensity_label ?? "",
      measurement_type: (["time_s","height_cm","distance_m","rsi","power_w","none"].includes(ex.tempo) ? ex.tempo : (ex.intensity_label === "plyometric" ? "height_cm" : "time_s")) as any,
      sets,
      reps,
      distance: ex.distance ?? "",
      rest: ex.rest ?? "",
      contacts: ex.contacts ?? null,
      surface: ex.target_load ?? "",
      notes: ex.notes ?? "",
      log,
      sort_order: ex.sort_order ?? 0,
    };
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [data, libraryData] = await Promise.all([getSession(sessionId), listLibrary()]);
      setSession(data);
      setLibrary(libraryData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load session");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionId) load();
    // Check org-wide checkin setting
    getOrgSettings().then((s) => {
      if (!s.checkin_enabled) setCheckinEnabled(false);
    }).catch(() => {});
    // Fetch other sessions for navigation (lightweight - id/name/date/type only)
    if (athleteId) {
      const supabase = createClient();
      Promise.resolve(
        supabase
          .from("sessions")
          .select("id, name, date, type")
          .eq("athlete_id", athleteId)
          .order("date", { ascending: false })
          .limit(50)
      ).then(({ data }) => setOtherSessions((data ?? []) as SessionStub[]))
       .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(""), 3000);
  };

  // Power/Speed exercise update handler
  const handlePSExerciseChange = async (updated: PSExercise) => {
    setSession(prev => prev ? {
      ...prev,
      exercises: prev.exercises?.map(ex => ex.id === updated.id ? {
        ...ex,
        name: updated.name,
        order: updated.order,
        sets: updated.sets,
        reps: String(updated.reps),
        distance: updated.distance,
        rest: updated.rest,
        contacts: updated.contacts,
        intensity_label: updated.quality,
        tempo: updated.measurement_type,   // measurement_type stored in tempo
        target_load: updated.surface,
        notes: updated.notes,
        log: updated.log as any,
      } as any : ex),
    } : prev);
    try {
      await updateExercise(updated.id, {
        name: updated.name,
        order: updated.order,
        sets: updated.sets,
        reps: String(updated.reps),
        rest: updated.rest,
        notes: updated.notes,
        log: updated.log as any,
        tempo: updated.measurement_type,      // measurement_type stored in tempo
        intensity_label: updated.quality,     // quality stored in intensity_label
        distance: updated.distance,
        target_load: updated.surface,         // surface stored in target_load
        contacts: updated.contacts ?? null,
      } as any);
    } catch (e) {
      console.error("PS exercise update failed:", e);
    }
  };

  const handleSessionNotesChange = async (session_notes: string) => {
    setSession((prev) => (prev ? { ...prev, session_notes } : prev));
    try {
      await updateSession(sessionId, { session_notes } as any);
    } catch (e) {
      console.error("Could not save session notes:", e);
    }
  };

  const handleNameChange = async (name: string) => {
    setSession((prev) => (prev ? { ...prev, name } : prev));
    try {
      await updateSession(sessionId, { name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  };

  const handleDateChange = async (date: string) => {
    setSession((prev) => (prev ? { ...prev, date } : prev));
    try {
      await updateSession(sessionId, { date });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  };

  const handleAddExercise = async () => {
    if (!session) return;
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("session_exercises")
      .insert({
        session_id: sessionId,
        name: "",
        sets: 3,
        reps: "8",
        tempo: "2-0-2",
        sort_order: (session.exercises?.length ?? 0),
        log: [{ weight: "", done: false, reps: "" }, { weight: "", done: false, reps: "" }, { weight: "", done: false, reps: "" }],
      })
      .select()
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSession((prev) =>
      prev ? { ...prev, exercises: [...(prev.exercises ?? []), data] } : prev
    );
  };

  const handleEditExercise = async (exerciseId: string, patch: Partial<SessionExercise>) => {
    // If the "order" field was changed to a clean integer that differs
    // from this exercise's current 1-based position, treat it as a
    // request to move the exercise there rather than just relabel it.
    // Non-numeric values (e.g. "1A"/"1B" for supersets, matching how
    // the prototype always allowed free-text labels here) just update
    // the label with no reordering — only a plain number triggers a move.
    if (patch.order != null && session) {
      const targetPos = parseInt(patch.order, 10);
      const isCleanInteger = /^\d+$/.test(patch.order.trim());
      if (isCleanInteger && targetPos >= 1) {
        await handleReorderExercise(exerciseId, targetPos);
        return;
      }
    }

    setSession((prev) =>
      prev
        ? {
            ...prev,
            exercises: prev.exercises?.map((e) =>
              e.id === exerciseId ? { ...e, ...patch } : e
            ),
          }
        : prev
    );
    // Re-sync the per-set log length if `sets` changed
    if (patch.sets != null) {
      const ex = session?.exercises?.find((e) => e.id === exerciseId);
      if (ex) {
        const n = Math.max(1, patch.sets);
        const newLog = [...(ex.log || [])];
        while (newLog.length < n) newLog.push({ weight: "", done: false, reps: "" });
        newLog.length = n;
        patch = { ...patch, log: newLog };
        setSession((prev) =>
          prev
            ? {
                ...prev,
                exercises: prev.exercises?.map((e) =>
                  e.id === exerciseId ? { ...e, log: newLog } : e
                ),
              }
            : prev
        );
      }
    }
    try {
      await updateExercise(exerciseId, patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save exercise");
    }
  };

  // Moves one exercise to a new 1-based position in the list and
  // renumbers every exercise's sort_order to match the new ordering.
  // Also re-syncs the visible "order" label for any exercise whose label
  // is a plain number (so the box reflects the new position after a move) —
  // exercises using letter-suffixed superset labels (1A/1B) are left
  // untouched so reordering doesn't clobber those.
  // targetPos is clamped to the valid range rather than rejected, so
  // typing "99" in a 4-exercise session just moves it to the end
  // rather than doing nothing.
  const handleReorderExercise = async (exerciseId: string, targetPos: number) => {
    if (!session?.exercises) return;
    const current = [...session.exercises].sort((a, b) => a.sort_order - b.sort_order);
    const fromIdx = current.findIndex((e) => e.id === exerciseId);
    if (fromIdx === -1) return;

    const clampedTarget = Math.min(Math.max(targetPos, 1), current.length);
    const toIdx = clampedTarget - 1;
    if (toIdx === fromIdx) return; // already in that position, nothing to do

    const [moved] = current.splice(fromIdx, 1);
    current.splice(toIdx, 0, moved);

    const reordered = current.map((e, i) => {
      const wasCleanInteger = /^\d+$/.test((e.order ?? "").trim());
      return wasCleanInteger ? { ...e, sort_order: i, order: String(i + 1) } : { ...e, sort_order: i };
    });
    setSession((prev) => (prev ? { ...prev, exercises: reordered } : prev));

    try {
      // Persist every exercise's sort_order (and order label where it
      // changed), not just the moved one, since shifting it changes the
      // position of everyone between the old and new spot too.
      await Promise.all(reordered.map((e) => updateExercise(e.id, { sort_order: e.sort_order, order: e.order })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reorder exercises");
    }
  };

  const handleLogChange = async (exerciseId: string, log: SetLog[]) => {
    setSession((prev) =>
      prev
        ? {
            ...prev,
            exercises: prev.exercises?.map((e) => (e.id === exerciseId ? { ...e, log } : e)),
          }
        : prev
    );
    try {
      await updateExerciseLog(exerciseId, log);
      // Detect PB after coach logs a set
      detectPBFromCoachLog(exerciseId, log).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save set");
    }
  };

  const detectPBFromCoachLog = async (exerciseId: string, log: SetLog[]) => {
    // Find best weight in completed sets
    let maxWeight = 0;
    let repsAtMax: number | null = null;
    let hasBodyweight = false;
    for (const set of log) {
      if (!set.done) continue;
      const w = parseFloat(String(set.weight));
      if (!isNaN(w) && w > 0 && w > maxWeight) {
        maxWeight = w;
        repsAtMax = parseInt(String(set.reps)) || null;
      }
      // Bodyweight: done but no weight recorded
      if (set.done && (!set.weight || set.weight === "" || w === 0)) {
        hasBodyweight = true;
        repsAtMax = parseInt(String(set.reps)) || null;
      }
    }
    if (maxWeight <= 0 && !hasBodyweight) return;

    // Call the existing athlete-link log API with athleteId from session
    if (!session?.athlete_id) return;
    await fetch("/api/athlete-link/detect-pb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        athleteId: session.athlete_id,
        exerciseId,
        sessionId,
        log,
      }),
    });
  };

  const handleRemoveExercise = async (exerciseId: string) => {
    setSession((prev) =>
      prev ? { ...prev, exercises: prev.exercises?.filter((e) => e.id !== exerciseId) } : prev
    );
    try {
      await deleteExercise(exerciseId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove exercise");
    }
  };

  const handleApplyFuture = async (exerciseName: string, patch: Partial<SessionExercise>) => {
    if (!session) return;
    try {
      const count = await applyToFutureSessions(athleteId, exerciseName, session.date, patch);
      showFlash(
        count > 0 ? `Updated ${count} future session${count !== 1 ? "s" : ""}` : "No future sessions found with that exercise"
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply to future sessions");
    }
  };

  const handlePropagate = async () => {
    if (!session || propagateScope === "none") return;
    setPropagating(true);
    setError("");
    try {
      const count = await propagateFutureOccurrences(session, propagateScope);
      showFlash(
        count > 0
          ? `Updated ${count} future session${count !== 1 ? "s" : ""}`
          : propagateScope === "same_day"
          ? "No future sessions found on this day of the week"
          : "No future sessions found to update"
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not propagate changes");
    } finally {
      setPropagating(false);
    }
  };

  const handleDeleteSession = async () => {
    try {
      await deleteSession(sessionId);
      router.push(`/athletes/${athleteId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete session");
      setConfirmDelete(false);
    }
  };

  const handleSaveAsTemplate = async (templateName: string) => {
    if (!session) return;
    try {
      await saveSessionAsTemplate(session, templateName);
      showFlash(`Saved as template: "${templateName}"`);
      setSaveTemplateOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save as template");
    }
  };

  const handleCsvImport = async (file: File) => {
    try {
      const result = await importCsv(file, athleteId);
      showFlash(
        `Imported ${result.exercisesImported} exercises across ${result.sessionsCreated} session${result.sessionsCreated !== 1 ? "s" : ""}${result.matchedToLibrary > 0 ? ` (${result.matchedToLibrary} linked to library)` : ""}`
      );
      router.push(`/athletes/${athleteId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import CSV");
    }
  };

  const handleSessionTypeChange = async (hyroxType: string | null, cardioType: string | null) => {
    if (!session) return;
    const patch: Partial<Session> = {};
    if (hyroxType !== null) patch.hyrox_type = hyroxType as any;
    if (cardioType !== null) patch.cardio_type = cardioType as any;
    setSession((prev) => (prev ? { ...prev, ...patch } : prev));
    try { await updateSession(sessionId, patch); } catch (e) { setError(e instanceof Error ? e.message : "Could not save"); }
  };

  const handleConfigChange = async (newConfig: object) => {
    if (!session) return;
    const field = session.type === "cardio" ? "cardio_config" : "hyrox_config";
    setSession((prev) => (prev ? { ...prev, [field]: newConfig } : prev));
    try { await updateSession(sessionId, { [field]: newConfig } as Partial<Session>); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save config"); }
  };

  const handleStartTimer = (workSec: number, restSec: number, rounds: number) => {
    setTimerWork(workSec); setTimerRest(restSec); setTimerRounds(rounds); setTimerOpen(true);
  };

  if (loading) return <div style={styles.empty}>Loading…</div>;
  if (error && !session) return <div style={styles.errorBox}>{error}</div>;
  if (!session) return <div style={styles.empty}>Session not found.</div>;

  const exercises = (session.exercises ?? []).sort((a, b) => a.sort_order - b.sort_order);

  // A set counts as done if it's explicitly marked done OR has a
  // logged weight — matches the auto-complete behaviour in
  // ExerciseCard, so the progress bar always agrees with what the
  // individual set chips are showing.
  const totalSets = exercises.reduce((n, e) => n + (e.log ?? []).length, 0);
  const doneSets = exercises.reduce(
    (n, e) => n + (e.log ?? []).filter((s) => s.done || (s.weight ?? "").trim().length > 0).length,
    0
  );
  const pct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;

  return (
    <div style={styles.page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <button style={styles.backLink} onClick={() => router.push(`/athletes/${athleteId}`)}>
          Back to sessions
        </button>
        {otherSessions.length > 1 && (
          <button
            style={{ background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            onClick={() => setShowOtherSessions((v) => !v)}
          >
            {showOtherSessions ? "Hide" : "All sessions"} ({otherSessions.length})
          </button>
        )}
      </div>

      {showOtherSessions && (
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 10, marginBottom: 12, maxHeight: 220, overflowY: "auto" as const }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>
            Other sessions for this athlete
          </div>
          {otherSessions.map((s) => (
            <button
              key={s.id}
              onClick={() => { setShowOtherSessions(false); router.push(`/athletes/${athleteId}/sessions/${s.id}`); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                background: s.id === sessionId ? "var(--accent-dim)" : "transparent",
                border: "none", borderRadius: 8, padding: "7px 10px", cursor: "pointer",
                textAlign: "left" as const, marginBottom: 2,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 4, background: STUB_TYPE_COLOR[s.type] ?? "#888", flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: s.id === sessionId ? 700 : 400, color: s.id === sessionId ? "var(--accent)" : "var(--text)", flex: 1 }}>
                {s.name}
              </span>
              <span style={{ fontSize: 11, color: "var(--mute)", flexShrink: 0 }}>{s.date}</span>
            </button>
          ))}
        </div>
      )}

      {flash && <div style={styles.flashBox}>{flash}</div>}
      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.metaRow}>
        <input
          value={session.name}
          onChange={(e) => handleNameChange(e.target.value)}
          style={styles.nameInput}
        />
        <input
          type="date"
          value={session.date}
          onChange={(e) => handleDateChange(e.target.value)}
          style={styles.dateInput}
        />
      </div>

      {session.type === "strength" && totalSets > 0 && (
        <div style={styles.progressWrap}>
          <div style={styles.progressBarBg}>
            <div style={{ ...styles.progressBarFill, width: `${pct}%` }} />
          </div>
          <span style={styles.progressLabel}>
            {doneSets}/{totalSets} sets · {pct}%
          </span>
        </div>
      )}

      <div style={styles.toolbar}>
        {session.type === "strength" && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/comma-separated-values,application/csv,application/vnd.ms-excel"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCsvImport(f);
                e.target.value = "";
              }}
            />
            <button style={styles.ghostBtn} onClick={() => fileRef.current?.click()}>
              Import CSV
            </button>
            <button style={styles.ghostBtn} onClick={() => setVoiceOpen(true)}>
              🎤 Voice
            </button>
            <button style={styles.ghostBtn} onClick={() => setNotesOpen(true)}>
              📝 Notes
            </button>
          </>
        )}
        {checkinEnabled && (
          <button style={styles.ghostBtn} onClick={() => setCheckInOpen(true)}>
            Check-in
          </button>
        )}
        <button style={styles.ghostBtn} onClick={async () => {
          setReportOpen(true);
          setReportLoading(true);
          setReport("");
          try {
            const res = await fetch("/api/session-report", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId }),
            });
            const data = await res.json();
            setReport(data.report ?? "Could not generate report.");
          } catch { setReport("Could not generate report."); }
          finally { setReportLoading(false); }
        }}>
          📊 AI Report
        </button>
        <button style={styles.ghostBtn} onClick={async () => {
          try {
            const res = await fetch("/api/session-summary", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId }),
            });
            const data = await res.json();
            if (data.summary) {
              setSession((prev) => prev ? { ...prev, coach_summary: data.summary } : prev);
            }
          } catch {}
        }}>
          ✨ Summary
        </button>
        <button
          style={styles.ghostBtn}
          onClick={() => {
            setSaveTemplateName(session.name);
            setSaveTemplateOpen(true);
          }}
        >
          Save as template
        </button>
        {confirmDelete ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--mute)" }}>Delete this session?</span>
            <button style={styles.dangerBtn} onClick={handleDeleteSession}>Yes, delete</button>
            <button style={styles.ghostBtn} onClick={() => setConfirmDelete(false)}>Cancel</button>
          </div>
        ) : (
          <button style={styles.ghostBtn} onClick={() => setConfirmDelete(true)}>
            Delete session
          </button>
        )}
      </div>

      {checkInOpen && <CheckInModal onClose={() => setCheckInOpen(false)} />}

      {reportOpen && (
        <div style={styles.overlay} onClick={() => setReportOpen(false)}>
          <div style={{ ...styles.modal, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>📊 Session report</div>
            {reportLoading ? (
              <div style={{ fontSize: 14, color: "var(--mute)", padding: "20px 0", textAlign: "center" }}>
                Generating report…
              </div>
            ) : (
              <div style={{ fontSize: 14, color: "var(--mute)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {report}
              </div>
            )}
            <button style={styles.modalCancel} onClick={() => setReportOpen(false)}>Close</button>
          </div>
        </div>
      )}

      {saveTemplateOpen && (
        <div style={styles.overlay} onClick={() => setSaveTemplateOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>Save as template</div>
            <input
              autoFocus
              value={saveTemplateName}
              onChange={(e) => setSaveTemplateName(e.target.value)}
              style={styles.modalInput}
            />
            <button
              disabled={!saveTemplateName.trim()}
              style={{ ...styles.primaryBtn, opacity: saveTemplateName.trim() ? 1 : 0.5 }}
              onClick={() => handleSaveAsTemplate(saveTemplateName.trim())}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {(session as any).coach_summary && (
        <div style={styles.summaryBox}>
          <span style={styles.summaryLabel}>✨ Session summary</span>
          <p style={styles.summaryText}>{(session as any).coach_summary}</p>
        </div>
      )}

      <SessionNotesBlock
        value={(session as any).session_notes ?? ""}
        onChange={handleSessionNotesChange}
        sessionType={session.type}
      />

      {session.athlete_notes && (
        <SessionNotesBlock
          value={session.athlete_notes}
          onChange={() => {}}
          readOnly={true}
          label="Athlete's Notes"
          icon="📝"
        />
      )}

      {/* ── Update future occurrences banner ── */}
      {session.source_session_id && (
        <div style={styles.propagateBanner}>
          <div style={styles.propagateLabel}>Update future occurrences</div>
          <div style={styles.propagateOptions}>
            {([
              { value: "none",     label: "This session only" },
              { value: "all",      label: "All future" },
              { value: "same_day", label: "Same day of week only" },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                style={{
                  ...styles.propagateOpt,
                  ...(propagateScope === value ? styles.propagateOptActive : {}),
                }}
                onClick={() => setPropagateScope(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {propagateScope !== "none" && (
            <button
              style={{ ...styles.propagateBtn, opacity: propagating ? 0.6 : 1 }}
              disabled={propagating}
              onClick={handlePropagate}
            >
              {propagating ? "Updating…" : `Apply to future sessions →`}
            </button>
          )}
        </div>
      )}

      {session.type === "strength" ? (
        <>
          <div style={styles.exerciseList}>
            {exercises.map((ex, i) => (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                library={library}
                athleteId={athleteId}
                currentSessionId={sessionId}
                onEdit={(patch) => handleEditExercise(ex.id, patch)}
                onRemove={() => handleRemoveExercise(ex.id)}
                onLogChange={(log) => handleLogChange(ex.id, log)}
                onApplyFuture={(patch) => handleApplyFuture(ex.name, patch)}
                onMoveUp={i > 0 ? () => handleReorderExercise(ex.id, i) : undefined}
                onMoveDown={i < exercises.length - 1 ? () => handleReorderExercise(ex.id, i + 2) : undefined}
              />
            ))}
          </div>
          <button style={styles.addExerciseBtn} onClick={handleAddExercise}>
            + Add exercise
          </button>
        </>
      ) : session.type === "power_speed" ? (
        <>
          <PowerSpeedSummaryBar exercises={exercises.map(toPSExercise)} />
          <div style={styles.exerciseList}>
            {exercises.map((ex) => (
              <PowerSpeedExerciseCard
                key={ex.id}
                exercise={toPSExercise(ex)}
                onChange={handlePSExerciseChange}
                onDelete={() => handleRemoveExercise(ex.id)}
                library={library}
              />
            ))}
          </div>
          <button style={styles.addExerciseBtn} onClick={handleAddExercise}>
            + Add exercise
          </button>
        </>
      ) : (
        <HyroxCardioBuilder
          session={session}
          color={session.type === "cardio" ? "#4DC3FF" : "#B388FF"}
          library={library}
          onTypeChange={handleSessionTypeChange}
          onConfigChange={handleConfigChange}
        />
      )}

      {timerOpen && (
        <HyroxTimer
          workSec={timerWork}
          restSec={timerRest}
          totalRounds={timerRounds}
          label={session.name}
          onClose={() => setTimerOpen(false)}
        />
      )}

      {voiceOpen && (
        <VoiceSessionModal
          mode="add"
          sessionId={sessionId}
          exerciseCount={exercises.length}
          onAdded={(newExercises) => {
            setSession((prev) =>
              prev
                ? { ...prev, exercises: [...(prev.exercises ?? []), ...newExercises] }
                : prev
            );
            setVoiceOpen(false);
          }}
          onClose={() => setVoiceOpen(false)}
        />
      )}
      {notesOpen && (
        <NotesSessionModal
          mode="add"
          sessionId={sessionId}
          athleteId={athleteId}
          sessionCount={0}
          onCreated={() => setNotesOpen(false)}
          onAdded={(newExercises) => {
            setSession((prev) =>
              prev
                ? { ...prev, exercises: [...(prev.exercises ?? []), ...newExercises] }
                : prev
            );
            setNotesOpen(false);
          }}
          onClose={() => setNotesOpen(false)}
        />
      )}
    </div>
  );
}


const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 700 },
  backLink: {
    background: "transparent",
    border: "none",
    color: "var(--mute)",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
    marginBottom: 16,
  },
  flashBox: {
    background: "var(--good-dim)",
    border: "1px solid var(--good)",
    color: "var(--good)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    marginBottom: 16,
  },
  errorBox: {
    background: "#2a0c0c",
    border: "1px solid #FF6B6B44",
    color: "#FF6B6B",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    marginBottom: 16,
  },
  metaRow: { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  progressWrap: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 },
  progressBarBg: { flex: 1, height: 8, background: "var(--panel2)", borderRadius: 6, overflow: "hidden" },
  progressBarFill: { height: "100%", background: "var(--good)", borderRadius: 6, transition: "width .3s" },
  progressLabel: { fontSize: 12, color: "var(--mute)", fontWeight: 600, whiteSpace: "nowrap" },
  summaryBox: { background: "var(--accent-dim)", border: "1px solid var(--accent)44", borderRadius: 10, padding: "10px 14px" },
  summaryLabel: { fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" as const, letterSpacing: "0.06em" },
  summaryText: { fontSize: 13, color: "var(--mute)", lineHeight: 1.6, margin: "6px 0 0" },
  nameInput: {
    flex: 1,
    minWidth: 200,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 18,
    fontWeight: 700,
  },
  dateInput: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
  },
  toolbar: { display: "flex", gap: 8, marginBottom: 20 },
  ghostBtn: {
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    cursor: "pointer",
  },
  exerciseList: { display: "flex", flexDirection: "column", gap: 12 },
  propagateBanner: {
    background: "var(--ink)",
    border: "1px solid var(--accent)",
    borderRadius: 12,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
    marginBottom: 4,
  },
  propagateLabel: { fontSize: 12, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" as const, letterSpacing: "0.06em" },
  propagateOptions: { display: "flex", gap: 6, flexWrap: "wrap" as const },
  propagateOpt: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  propagateOptActive: {
    background: "var(--accent-dim)",
    border: "1px solid var(--accent)",
    color: "var(--accent)",
  },
  propagateBtn: {
    background: "var(--accent)",
    color: "#0a1420",
    border: "none",
    borderRadius: 8,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    alignSelf: "flex-start" as const,
  },
  addExerciseBtn: {
    marginTop: 14,
    width: "100%",
    background: "transparent",
    border: "1px dashed var(--line)",
    color: "var(--mute)",
    borderRadius: 10,
    padding: "12px 0",
    fontSize: 14,
    cursor: "pointer",
  },
  empty: { color: "var(--mute)", fontSize: 14, padding: "40px 0", textAlign: "center" },
  configCard: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: 20,
  },
  configRow: { display: "flex", gap: 12, marginBottom: 18 },
  fieldLabel: { fontSize: 11, color: "var(--mute)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" },
  configInput: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
  },
  startTimerBtn: {
    width: "100%",
    border: "none",
    borderRadius: 10,
    padding: "14px 0",
    fontSize: 15,
    fontWeight: 700,
    color: "#0a1420",
    cursor: "pointer",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(6,9,12,.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 60,
    padding: 16,
  },
  modal: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 360,
  },
  modalTitle: {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 14,
  },
  modalInput: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
    marginBottom: 12,
  },
  primaryBtn: {
    width: "100%",
    background: "var(--accent)",
    color: "#0a1420",
    border: "none",
    borderRadius: 10,
    padding: "12px 0",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
};
