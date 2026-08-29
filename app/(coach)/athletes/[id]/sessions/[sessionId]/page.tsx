"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { getOrgSettings } from "@/lib/data/settings";
import { resolveCurrentOneRM } from "@/lib/data/one-rm";
import { calculateSetTargets } from "@/lib/one-rm";
import {
  getSession,
  updateSession,
  updateExercise,
  deleteExercise,
  restoreExercise,
  moveExerciseToSession,
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
import { usePendingUndo } from "@/lib/use-pending-undo";
import UndoBanner from "@/components/UndoBanner";
import ExerciseCard from "@/components/ExerciseCard";
import {
  findPreviousExerciseEntry, formatPrevSets, computeBestSetSignal, computeTotalLoadSignal,
} from "@/lib/session-progress";
import HyroxCardioBuilder from "@/components/HyroxCardioBuilder";
import VoiceSessionModal from "@/components/VoiceSessionModal";
import NotesSessionModal from "@/components/NotesSessionModal";
import PowerSpeedExerciseCard from "@/components/PowerSpeedExerciseCard";
import PowerSpeedSummaryBar from "@/components/PowerSpeedSummaryBar";
import RecoverySessionEditor from "@/components/recovery/RecoverySessionEditor";
import { saveRecoveryPreset } from "@/lib/data/recovery";
import type { PSExercise, PSSetLog } from "@/components/PowerSpeedExerciseCard";
import SessionNotesBlock from "@/components/SessionNotesBlock";
import SessionCompareModal from "@/components/SessionCompareModal";
import type { Session, SessionExercise, SetLog, LibraryEntry } from "@/types";

type SessionStub = { id: string; name: string; date: string; type: string };

const STUB_TYPE_COLOR: Record<string, string> = {
  strength: "#3B8BEB", hyrox: "#B388FF", cardio: "#4DC3FF", power_speed: "#A855F7", recovery: "#2DD4BF",
};

export default function SessionDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string; sessionId: string }>();
  const { id: athleteId, sessionId } = params;
  const fileRef = useRef<HTMLInputElement>(null);

  const [session, setSession] = useState<Session | null>(null);
  // Mirrors `session` for the undo restore closure below - by the time
  // a coach clicks Undo, other edits may have happened since the
  // delete, so the restore needs to read the *current* exercise list
  // (to reopen a sort_order gap correctly) rather than whatever was
  // captured in a stale closure from when the delete happened.
  const sessionRef = useRef<Session | null>(null);
  useEffect(() => { sessionRef.current = session; }, [session]);
  const [otherSessions, setOtherSessions] = useState<SessionStub[]>([]);
  // Prior sessions (with exercise logs) for the "vs last time" signal on
  // each exercise card — the same comparison Live Group shows.
  const [priorSessions, setPriorSessions] = useState<{ athlete_id: string; date: string; exercises: SessionExercise[] }[]>([]);
  // Which strength exercise cards are expanded ("zoomed in") - existing
  // exercises load collapsed (the actual decluttering), a freshly-added
  // one is added to this set so it opens ready to fill in immediately.
  const [expandedExerciseIds, setExpandedExerciseIds] = useState<Set<string>>(new Set());
  const toggleExerciseExpanded = (id: string) => {
    setExpandedExerciseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  // Drag-and-drop reorder state - just the dragged exercise's current
  // sorted index, read back out on drop to feed the existing
  // handleReorderExercise (same function the ▴/▾ buttons already use -
  // dragging is just a new way to call it, not a new reorder
  // implementation). The drop-target highlight itself is set directly
  // on the DOM node in the handlers below, not through React state,
  // same imperative approach already used in settings/page.tsx's
  // reflection-metrics reorder.
  const draggedExerciseIndexRef = useRef<number | null>(null);
  // Per-set calculated %1RM targets (kg), keyed by exercise id — shown
  // as a preview in the load box while prescribing, never saved to
  // the log until the coach explicitly ticks a set done.
  const [oneRmTargets, setOneRmTargets] = useState<Record<string, (number | null)[]>>({});
  const [showOtherSessions, setShowOtherSessions] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const undo = usePendingUndo();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [savePresetName, setSavePresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [propagateScope, setPropagateScope] = useState<PropagateScope | "none">("none");
  const [propagating, setPropagating] = useState(false);

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

  // Load this athlete's prior sessions (with logs) once the session is
  // known — used for the per-exercise "vs last time" signal.
  useEffect(() => {
    if (!session?.athlete_id || !session.date) return;
    const supabase = createClient();
    Promise.resolve(
      supabase
        .from("sessions")
        .select("athlete_id, date, session_exercises(name, log, time, is_bodyweight)")
        .eq("athlete_id", session.athlete_id)
        .lt("date", session.date)
        .neq("id", session.id)
        .order("date", { ascending: false })
        .limit(60)
    ).then(({ data }) => setPriorSessions(
      (data ?? []).map((s: any) => ({ athlete_id: s.athlete_id, date: s.date, exercises: (s.session_exercises ?? []) as SessionExercise[] }))
    )).catch(() => {});
  }, [session?.id, session?.athlete_id, session?.date]);

  // Per-exercise best-set / total-load change vs the same exercise last time.
  const progressByExercise = useMemo(() => {
    const map = new Map<string, {
      prevDate: string | null; prevSets: string | null;
      best: { direction: "up" | "down" | "same"; label: string } | null;
      total: { direction: "up" | "down" | "same"; label: string } | null;
    }>();
    if (session?.type !== "strength" || !session.exercises || !session.athlete_id) return map;
    for (const ex of session.exercises) {
      const entry = findPreviousExerciseEntry(priorSessions, session.athlete_id, ex.name, session.date);
      const prevEx = entry?.exercise ?? null;
      const best = computeBestSetSignal(ex, prevEx);
      const total = computeTotalLoadSignal(ex, prevEx);
      if (best || total || entry) {
        map.set(ex.id, { prevDate: entry?.date ?? null, prevSets: prevEx ? formatPrevSets(prevEx) : null, best, total });
      }
    }
    return map;
  }, [session?.id, session?.type, session?.exercises, session?.athlete_id, session?.date, priorSessions]);

  // Recompute %1RM previews whenever the set of prescribed percentages
  // actually changes (not on every keystroke elsewhere on the page).
  const percentSignature = (session?.exercises ?? [])
    .map((e) => `${e.id}:${e.use_percent_1rm ? (e.set_percents ?? []).join(",") : ""}`)
    .join("|");

  useEffect(() => {
    if (!athleteId) return;
    const withPercent = (session?.exercises ?? []).filter(
      (e) => e.use_percent_1rm && (e.set_percents ?? []).some((p) => p)
    );
    if (!withPercent.length) { setOneRmTargets({}); return; }

    let cancelled = false;
    (async () => {
      const settings = await getOrgSettings().catch(() => null);
      const formula = settings?.one_rm_formula ?? "lander";
      const entries = await Promise.all(
        withPercent.map(async (ex) => {
          const oneRM = await resolveCurrentOneRM(athleteId, ex.name, formula).catch(() => null);
          return [ex.id, oneRM != null ? calculateSetTargets(oneRM, ex.set_percents ?? []) : null] as const;
        })
      );
      if (cancelled) return;
      const next: Record<string, (number | null)[]> = {};
      for (const [id, targets] of entries) if (targets) next[id] = targets;
      setOneRmTargets(next);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId, percentSignature]);

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

  const handlePrimerChange = async (is_primer: boolean) => {
    setSession((prev) => (prev ? { ...prev, is_primer } : prev));
    try {
      await updateSession(sessionId, { is_primer });
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
    setExpandedExerciseIds((prev) => new Set(prev).add(data.id));
  };

  const handleEditExercise = async (exerciseId: string, patch: Partial<SessionExercise>) => {
    // The "order" field is always just a free-text label (A, 1A, 3,
    // whatever the coach wants) — it never triggers a reorder on its
    // own. Reordering is exclusively the ↑/↓ arrows (handleReorderExercise),
    // so typing a plain number here can't unexpectedly move the
    // exercise out from under the coach mid-edit.
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
    const sorted = [...(session?.exercises ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const removedIdx = sorted.findIndex((e) => e.id === exerciseId);
    const snapshot = removedIdx !== -1 ? sorted[removedIdx] : null;

    setSession((prev) =>
      prev ? { ...prev, exercises: prev.exercises?.filter((e) => e.id !== exerciseId) } : prev
    );
    try {
      await deleteExercise(exerciseId);
    } catch (e) {
      // It was never actually deleted - undo the optimistic removal
      // rather than leaving the UI showing it gone.
      setSession((prev) =>
        prev && snapshot ? { ...prev, exercises: [...(prev.exercises ?? []), snapshot] } : prev
      );
      setError(e instanceof Error ? e.message : "Could not remove exercise");
      return;
    }

    if (!snapshot) return;
    undo.push(`Removed "${snapshot.name || "exercise"}"`, async () => {
      // Reopen a gap at the original position among whatever the
      // exercise list looks like *now* (it may have changed since the
      // delete), then re-insert the snapshot there.
      const now = [...(sessionRef.current?.exercises ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      const insertAt = Math.min(removedIdx, now.length);
      const shifted = now.map((e, i) => (i >= insertAt ? { ...e, sort_order: e.sort_order + 1 } : e));
      await Promise.all(
        shifted
          .filter((e, i) => e.sort_order !== now[i].sort_order)
          .map((e) => updateExercise(e.id, { sort_order: e.sort_order }))
      );
      const restored = await restoreExercise({ ...snapshot, sort_order: insertAt });
      setSession((prev) => {
        if (!prev) return prev;
        const merged = [...shifted];
        merged.splice(insertAt, 0, restored);
        return { ...prev, exercises: merged };
      });
    });
  };

  const handleMoveExercise = async (exerciseId: string, targetSessionId: string) => {
    const target = otherSessions.find((s) => s.id === targetSessionId);
    const removed = session?.exercises?.find((e) => e.id === exerciseId);
    // Optimistic: the exercise leaves this session's list immediately —
    // it now belongs to targetSessionId, so it has no place in this view.
    setSession((prev) =>
      prev ? { ...prev, exercises: prev.exercises?.filter((e) => e.id !== exerciseId) } : prev
    );
    try {
      await moveExerciseToSession(exerciseId, targetSessionId);
      showFlash(`Moved${removed?.name ? ` "${removed.name}"` : ""} to ${target?.name ?? "the other session"}${target?.date ? ` (${target.date})` : ""}`);
    } catch (e) {
      // Roll back — put the exercise back where it was
      setSession((prev) =>
        prev && removed ? { ...prev, exercises: [...(prev.exercises ?? []), removed] } : prev
      );
      setError(e instanceof Error ? e.message : "Could not move exercise");
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

  const handleSaveAsRecoveryPreset = async (presetName: string) => {
    if (!session || session.type !== "recovery" || !session.recovery_format) return;
    setSavingPreset(true);
    try {
      await saveRecoveryPreset({
        name: presetName,
        category: session.recovery_category,
        format: session.recovery_format,
        config: session.recovery_config,
      });
      showFlash(`Saved as preset: "${presetName}"`);
      setSavePresetOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save as preset");
    } finally {
      setSavingPreset(false);
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

  const handleRecoveryPatch = async (patch: Partial<Pick<Session, "name" | "recovery_category" | "recovery_config">>) => {
    if (!session) return;
    setSession((prev) => (prev ? { ...prev, ...patch } : prev));
    try { await updateSession(sessionId, patch); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save"); }
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
    // A %1RM-prescribed set's weight box is pre-filled with the
    // calculated target before the athlete does anything, so its
    // presence alone can't count as "completed" the way a typed-in
    // weight normally does — only an explicit done-tap does.
    (n, e) => n + (e.log ?? []).filter((s) => s.done || (!e.use_percent_1rm && (s.weight ?? "").trim().length > 0)).length,
    0
  );
  const pct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;

  return (
    <div style={styles.page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, gap: 8, flexWrap: "wrap" as const }}>
        <button style={styles.backLink} onClick={() => router.push(`/athletes/${athleteId}`)}>
          Back to sessions
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {otherSessions.some((s) => s.id !== sessionId && s.name.trim().toLowerCase() === session.name.trim().toLowerCase()) && (
            <button
              style={{ background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              onClick={() => setCompareOpen(true)}
            >
              Compare with previous attempts
            </button>
          )}
          {otherSessions.length > 1 && (
            <button
              style={{ background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              onClick={() => setShowOtherSessions((v) => !v)}
            >
              {showOtherSessions ? "Hide" : "All sessions"} ({otherSessions.length})
            </button>
          )}
        </div>
      </div>
      {compareOpen && session && (
        <SessionCompareModal athleteId={athleteId} session={session} onClose={() => setCompareOpen(false)} />
      )}

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
      {undo.pending && (
        <UndoBanner
          label={undo.pending.label}
          onUndo={undo.runUndo}
          onDismiss={undo.clear}
          restoring={undo.restoring}
          error={undo.error}
        />
      )}
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

      {session.type === "strength" && (
        <label
          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, cursor: "pointer" }}
          title="A deliberately lighter primer/activation session (e.g. pre-match). Excluded from reports and the rolling %1RM estimate for every exercise in it, so it won't look like a strength drop."
        >
          <input
            type="checkbox"
            checked={!!session.is_primer}
            onChange={(e) => handlePrimerChange(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: session.is_primer ? "var(--accent)" : "var(--mute)" }}>
            Primer / activation session
          </span>
        </label>
      )}

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
              Build · Voice
            </button>
            <button style={styles.ghostBtn} onClick={() => setNotesOpen(true)}>
              Build · Notes
            </button>
          </>
        )}
        <button
          style={styles.ghostBtn}
          onClick={() => {
            setSaveTemplateName(session.name);
            setSaveTemplateOpen(true);
          }}
        >
          Save as template
        </button>
        {session.type === "recovery" && (
          <button
            style={styles.ghostBtn}
            onClick={() => {
              setSavePresetName(session.name);
              setSavePresetOpen(true);
            }}
          >
            Save as preset
          </button>
        )}
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

      {savePresetOpen && (
        <div style={styles.overlay} onClick={() => setSavePresetOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>Save as preset</div>
            <input
              autoFocus
              value={savePresetName}
              onChange={(e) => setSavePresetName(e.target.value)}
              style={styles.modalInput}
            />
            <button
              disabled={!savePresetName.trim() || savingPreset}
              style={{ ...styles.primaryBtn, opacity: savePresetName.trim() && !savingPreset ? 1 : 0.5 }}
              onClick={() => handleSaveAsRecoveryPreset(savePresetName.trim())}
            >
              {savingPreset ? "Saving…" : "Save"}
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
                percentTargets={oneRmTargets[ex.id]}
                onEdit={(patch) => handleEditExercise(ex.id, patch)}
                onRemove={() => handleRemoveExercise(ex.id)}
                onLogChange={(log) => handleLogChange(ex.id, log)}
                onApplyFuture={(patch) => handleApplyFuture(ex.name, patch)}
                onMoveUp={i > 0 ? () => handleReorderExercise(ex.id, i) : undefined}
                onMoveDown={i < exercises.length - 1 ? () => handleReorderExercise(ex.id, i + 2) : undefined}
                otherStrengthSessions={otherSessions.filter((s) => s.type === "strength" && s.id !== sessionId)}
                onMoveToSession={(targetSessionId) => handleMoveExercise(ex.id, targetSessionId)}
                progress={progressByExercise.get(ex.id) ?? null}
                expanded={expandedExerciseIds.has(ex.id)}
                onToggleExpand={() => toggleExerciseExpanded(ex.id)}
                onDragStart={(e) => {
                  draggedExerciseIndexRef.current = i;
                  e.dataTransfer.setData("text/plain", String(i));
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  (e.currentTarget as HTMLElement).style.outline = "1px solid var(--accent)";
                }}
                onDragLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.outline = "none";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).style.outline = "none";
                  const fromIdx = draggedExerciseIndexRef.current;
                  draggedExerciseIndexRef.current = null;
                  if (fromIdx == null || fromIdx === i) return;
                  const draggedId = exercises[fromIdx]?.id;
                  if (!draggedId) return;
                  // handleReorderExercise's targetPos is 1-based and
                  // already handles the sort_order/order-label
                  // persistence for everyone shifted - dragging is just
                  // a new way to call the same reorder used by ▴/▾.
                  handleReorderExercise(draggedId, i + 1);
                }}
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
      ) : session.type === "recovery" ? (
        <RecoverySessionEditor
          session={session}
          onNameChange={(name) => handleRecoveryPatch({ name })}
          onCategoryChange={(recovery_category) => handleRecoveryPatch({ recovery_category })}
          onConfigChange={(patch) => handleRecoveryPatch({ recovery_config: { ...session.recovery_config, ...patch } })}
        />
      ) : (
        <HyroxCardioBuilder
          session={session}
          color={session.type === "cardio" ? "#4DC3FF" : "#B388FF"}
          library={library}
          onTypeChange={handleSessionTypeChange}
          onConfigChange={handleConfigChange}
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
  toolbar: { display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 20 },
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
