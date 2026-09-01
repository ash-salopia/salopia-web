"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { listLiveGroupAthletes } from "@/lib/data/athletes";
import { listSessionsForAthletes, toggleSetDone, updateExerciseLog, updateExercise, updateSession } from "@/lib/data/sessions";
import { createClient } from "@/lib/supabase-browser";
import { getOrgSettings } from "@/lib/data/settings";
import { listLibrary } from "@/lib/data/library";
import CheckInModal from "@/components/CheckInModal";
import LiveChallengePanel from "@/components/LiveChallengePanel";
import HyroxCardioLog from "@/components/HyroxCardioLog";
import { resolveCurrentOneRM } from "@/lib/data/one-rm";
import { calculateSetTargets } from "@/lib/one-rm";
import { useIsMobile } from "@/lib/use-is-mobile";
import type { Athlete, Session, SessionType, SetLog, SessionExercise, LibraryEntry } from "@/types";
import {
  findPreviousExercise, formatPrevSets, computeBestSetSignal, computeTotalLoadSignal, progressionArrow,
} from "@/lib/session-progress";

const TYPE_META: Record<SessionType, { label: string; color: string; dim: string }> = {
  strength:    { label: "Strength",    color: "#3B8BEB", dim: "#162743" },
  hyrox:       { label: "Hybrid",      color: "#B388FF", dim: "#2a2240" },
  cardio:      { label: "Cardio",      color: "#4DC3FF", dim: "#1a2c38" },
  power_speed: { label: "Power/Speed", color: "#A855F7", dim: "#2a1a4a" },
  recovery:    { label: "Recovery",    color: "#2DD4BF", dim: "#123832" },
  sport:       { label: "Sport / Other", color: "#F59E0B", dim: "#3a2a0a" },
};

function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso: string): string {
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  if (iso === today) return "Today";
  if (iso === tomorrow) return "Tomorrow";
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// Progression-signal helpers (findPreviousExercise, formatPrevSets,
// computeBestSetSignal, computeTotalLoadSignal, progressionArrow) now
// live in @/lib/session-progress so the AI session summary can reuse
// the exact same numbers shown here.

// A prescribed reps string only counts as an auto-fillable default
// when it's a single clean number ("8") - a range ("8-12") has no one
// value that's obviously "what was done", so it's left for the coach
// to type explicitly.
function singleRepValue(prescribedReps?: string): string | null {
  const t = (prescribedReps ?? "").trim();
  return /^\d+$/.test(t) ? t : null;
}

function progressionDirStyle(direction: "up" | "down" | "same"): React.CSSProperties {
  return direction === "up" ? s.exProgressionUp : direction === "down" ? s.exProgressionDown : s.exProgressionSame;
}

function lsGet(k: string): string { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } }
function lsSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} }
function lsGetObj(k: string): Record<string, string> { try { return JSON.parse(localStorage.getItem(k) ?? "{}"); } catch { return {}; } }
function lsSetObj(k: string, v: Record<string, string>) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

const LS_MODE  = "liveGroup_mode";
const LS_GROUP = "liveGroup_group";
const LS_TAB   = "liveGroup_tab";
const LS_SES   = "liveGroup_session";

export default function LiveGroupPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [mode, setMode]           = useState<"starred" | "group">("starred");
  const [allAthletes, setAll]     = useState<Athlete[]>([]);
  const [groups, setGroups]       = useState<string[]>([]);
  const [selGroup, setSelGroup]   = useState("");
  const [sessions, setSessions]   = useState<Session[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [activeTab, setActiveTab] = useState("");
  const [sessionMap, setSessionMap] = useState<Record<string, string>>({});
  const [expandedEx, setExpandedEx] = useState<string | null>(null);
  // Calculated %1RM target per set (kg) for whichever exercise is
  // currently expanded - computed lazily (only the exercise actually
  // being viewed) rather than for every athlete's every exercise up
  // front. Purely a preview: typing in the box still auto-completes
  // the set here, same as any other Live Group entry, matching real-
  // time logging alongside the athlete.
  const [oneRmTargets, setOneRmTargets] = useState<Record<string, (number | null)[]>>({});
  const tabBarRef = useRef<HTMLDivElement>(null);
  // Session note = sessions.session_notes (coach-authored, session-
  // wide, athlete-visible). Exercise note = session_exercises.notes
  // (coach-authored coaching cue, same field the full session builder
  // already edits inline) - reused here rather than a new column,
  // just surfaced through a popup so the compact Live Group cards
  // don't need a permanently-visible textarea per exercise.
  const [noteModal, setNoteModal] = useState<
    | { kind: "session"; sessionId: string }
    | { kind: "exercise"; sessionId: string; exerciseId: string; exerciseName: string }
    | null
  >(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [checkinEnabled, setCheckinEnabled] = useState(true);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [challengesEnabled, setChallengesEnabled] = useState(true);
  const [challengePanelOpen, setChallengePanelOpen] = useState(false);
  const [editModal, setEditModal] = useState<{ sessionId: string; exercise: SessionExercise } | null>(null);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [editNameDropdownOpen, setEditNameDropdownOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<{ name: string; sets: string; mode: "reps" | "time"; reps: string; time: string; rest: string; target_load: string }>({
    name: "", sets: "", mode: "reps", reps: "", time: "", rest: "", target_load: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const supabase = createClient();
      const { data: allData } = await supabase
        .from("athletes").select("*").eq("archived", false).order("name");
      const all: Athlete[] = allData ?? [];
      setAll(all);

      const uniqueGroups = Array.from(
        new Set(all.map((a) => a.group).filter(Boolean) as string[])
      ).sort();
      setGroups(uniqueGroups);

      const sessionData = await listSessionsForAthletes(all.map((a) => a.id));
      setSessions(sessionData);

      listLibrary().then(setLibrary).catch(() => {});

      const savedMode  = (lsGet(LS_MODE) as "starred" | "group") || "starred";
      const savedGroup = lsGet(LS_GROUP) || uniqueGroups[0] || "";
      const savedMap   = lsGetObj(LS_SES);
      const savedTab   = lsGet(LS_TAB);

      setMode(savedMode);
      setSelGroup(savedGroup);
      setSessionMap(savedMap);

      const shown = savedMode === "starred"
        ? all.filter((a) => a.in_live_group)
        : all.filter((a) => a.group === savedGroup);
      setActiveTab(shown.some((a) => a.id === savedTab) ? savedTab : shown[0]?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load live group");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getOrgSettings().then((s) => {
      if (!s.checkin_enabled) setCheckinEnabled(false);
      if (s.challenges_enabled === false) setChallengesEnabled(false);
    }).catch(() => {});
  }, []);

  const changeMode = (m: "starred" | "group") => {
    setMode(m); lsSet(LS_MODE, m);
    // Default to first group if none selected
    const g = selGroup || groups[0] || "";
    if (!selGroup && g) { setSelGroup(g); lsSet(LS_GROUP, g); }
    const shown = m === "starred"
      ? allAthletes.filter((a) => a.in_live_group)
      : allAthletes.filter((a) => a.group === g);
    const first = shown[0]?.id ?? "";
    setActiveTab(first); lsSet(LS_TAB, first);
    setExpandedEx(null);
  };

  const changeGroup = (g: string) => {
    setSelGroup(g); lsSet(LS_GROUP, g);
    const shown = allAthletes.filter((a) => a.group === g);
    const first = shown[0]?.id ?? "";
    setActiveTab(first); lsSet(LS_TAB, first);
    setExpandedEx(null);
  };

  const changeTab = (athleteId: string) => {
    setActiveTab(athleteId); lsSet(LS_TAB, athleteId);
    setExpandedEx(null);
    setTimeout(() => {
      const el = tabBarRef.current?.querySelector(`[data-id="${athleteId}"]`) as HTMLElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }, 50);
  };

  const shownAthletes = mode === "starred"
    ? allAthletes.filter((a) => a.in_live_group)
    : allAthletes.filter((a) => a.group === (selGroup || groups[0] || ""));

  const athleteSessions = (athleteId: string): Session[] => {
    const today  = todayISO();
    const cutoff = addDays(today, -1);   // include yesterday's late sessions
    const ahead  = addDays(today, 7);    // only show up to 1 week ahead
    return sessions
      .filter((s) => s.athlete_id === athleteId && s.date >= cutoff && s.date <= ahead)
      .sort((a, b) => a.date < b.date ? -1 : 1);
  };

  const getActiveSession = (athleteId: string): Session | null => {
    const choices = athleteSessions(athleteId);
    if (!choices.length) return null;
    const pinned = sessionMap[athleteId];
    if (pinned) { const f = choices.find((s) => s.id === pinned); if (f) return f; }
    const today = todayISO();
    return choices.find((s) => s.date === today)
      ?? choices.filter((s) => s.date > today)[0]
      ?? choices[choices.length - 1];
  };

  const setSessionPin = (athleteId: string, sessionId: string) => {
    const next = { ...sessionMap, [athleteId]: sessionId };
    setSessionMap(next); lsSetObj(LS_SES, next);
    setExpandedEx(null);
  };

  // ── Update log (coach-side, uses browser client) ──────────────────────────
  const handleLogChange = async (
    sessionId: string,
    exerciseId: string,
    setIndex: number,
    patch: Partial<SetLog>
  ) => {
    setSessions((prev) =>
      prev.map((sess) =>
        sess.id !== sessionId ? sess : {
          ...sess,
          exercises: sess.exercises?.map((ex) =>
            ex.id !== exerciseId ? ex : {
              ...ex,
              log: (ex.log ?? []).map((l, i) => i === setIndex ? { ...l, ...patch } : l),
            }
          ),
        }
      )
    );
    // Find the updated log from state to persist
    const sess = sessions.find((s) => s.id === sessionId);
    const ex = sess?.exercises?.find((e) => e.id === exerciseId);
    if (!ex) return;
    const newLog = (ex.log ?? []).map((l, i) => i === setIndex ? { ...l, ...patch } : l);
    try { await updateExerciseLog(exerciseId, newLog); detectCoachPB(sessionId, exerciseId, newLog); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save"); }
  };

  // Live Group logs sets straight to session_exercises.log — it doesn't go
  // through the athlete-link log route, so PB detection has to be triggered
  // here too (the same /api/athlete-link/detect-pb the session builder uses).
  // Fire-and-forget; a failed PB check must never surface as a failed save.
  const detectCoachPB = (sessionId: string, exerciseId: string, log: SetLog[]) => {
    const sess = sessions.find((s) => s.id === sessionId);
    if (!sess?.athlete_id || (sess.type !== "strength" && sess.type !== "power_speed")) return;
    const anyDone = log.some((l) => l.done && (parseFloat(String(l.weight)) > 0 || (l.reps ?? "").trim()));
    if (!anyDone) return;
    fetch("/api/athlete-link/detect-pb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athleteId: sess.athlete_id, exerciseId, sessionId, log }),
    }).catch(() => {});
  };

  const handleToggleDot = async (
    sessionId: string,
    exerciseId: string,
    setIndex: number,
    currentLog: SetLog[],
    target: number | null = null,
    prescribedReps?: string
  ) => {
    const singleRep = singleRepValue(prescribedReps);
    const newLog = currentLog.map((l, i) => {
      if (i !== setIndex) return l;
      const nowDone = !l.done;
      if (!nowDone) return { ...l, done: nowDone };
      // Marking done on a still-empty set captures the calculated %1RM
      // target as the real weight, and the prescribed rep count as the
      // real reps (only when it's one specific number, not a range) -
      // same as completing it live would, without needing to type
      // in numbers that were already showing as the placeholder.
      const patch: Partial<SetLog> = { done: true };
      if (!l.weight.trim() && target != null) patch.weight = String(target);
      if (!l.reps.trim() && singleRep) patch.reps = singleRep;
      return { ...l, ...patch };
    });
    setSessions((prev) =>
      prev.map((s) => s.id !== sessionId ? s : {
        ...s,
        exercises: s.exercises?.map((e) =>
          e.id !== exerciseId ? e : { ...e, log: newLog }
        ),
      })
    );
    try { await updateExerciseLog(exerciseId, newLog); detectCoachPB(sessionId, exerciseId, newLog); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save"); }
  };

  // Coach's own thumbs up/down on whether the athlete could progress
  // this exercise next time - no explanation prompt, just a direct
  // tap, writing to the same session_exercises.progress field the
  // athlete app's own progress prompt uses. Tapping the already-set
  // value clears it back to unanswered.
  const handleSetProgress = async (
    sessionId: string,
    exerciseId: string,
    value: "yes" | "no"
  ) => {
    const sess = sessions.find((s) => s.id === sessionId);
    const ex = sess?.exercises?.find((e) => e.id === exerciseId);
    const next: "" | "yes" | "no" = ex?.progress === value ? "" : value;
    setSessions((prev) =>
      prev.map((s) => s.id !== sessionId ? s : {
        ...s,
        exercises: s.exercises?.map((e) =>
          e.id !== exerciseId ? e : { ...e, progress: next }
        ),
      })
    );
    try { await updateExercise(exerciseId, { progress: next }); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save"); }
  };

  const openSessionNote = (session: Session) => {
    setNoteDraft(session.session_notes ?? "");
    setNoteModal({ kind: "session", sessionId: session.id });
  };

  const openExerciseNote = (sessionId: string, ex: SessionExercise) => {
    setNoteDraft(ex.notes ?? "");
    setNoteModal({ kind: "exercise", sessionId, exerciseId: ex.id, exerciseName: ex.name });
  };

  const closeNoteModal = () => {
    setNoteModal(null);
    setNoteDraft("");
  };

  const saveNote = async () => {
    if (!noteModal) return;
    setSavingNote(true);
    try {
      if (noteModal.kind === "session") {
        await updateSession(noteModal.sessionId, { session_notes: noteDraft });
        setSessions((prev) =>
          prev.map((s) => (s.id === noteModal.sessionId ? { ...s, session_notes: noteDraft } : s))
        );
      } else {
        await updateExercise(noteModal.exerciseId, { notes: noteDraft });
        setSessions((prev) =>
          prev.map((s) =>
            s.id !== noteModal.sessionId ? s : {
              ...s,
              exercises: s.exercises?.map((e) =>
                e.id === noteModal.exerciseId ? { ...e, notes: noteDraft } : e
              ),
            }
          )
        );
      }
      closeNoteModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save note");
    } finally {
      setSavingNote(false);
    }
  };

  // Quick exercise edit - swap name, change sets/reps, or flip to time
  // mode, without leaving Live Group for the full session editor.
  // Deliberately a small field set (not every ExerciseCard option) so
  // it stays fast for the common mid-session tweak.
  const openEditExercise = (sessionId: string, ex: SessionExercise) => {
    const timeMode = (ex.time ?? "").trim().length > 0;
    setEditDraft({
      name: ex.name,
      sets: String(ex.sets ?? ""),
      mode: timeMode ? "time" : "reps",
      reps: ex.reps ?? "",
      time: ex.time ?? "",
      rest: ex.rest ?? "",
      target_load: ex.target_load ?? "",
    });
    setEditModal({ sessionId, exercise: ex });
    setEditNameDropdownOpen(false);
  };

  const closeEditExercise = () => { setEditModal(null); setEditNameDropdownOpen(false); };

  // Picking a library match copies its preset fields onto the draft -
  // only fields that are genuinely non-empty on the library entry, so
  // picking a sparse preset never blanks out something the coach
  // already typed. Mirrors ExerciseCard's applyLibraryPreset, scoped
  // to the fields this quick-edit popup actually has.
  const applyEditLibraryPreset = (entry: LibraryEntry) => {
    setEditDraft((d) => {
      const timeMode = entry.time ? true : entry.reps ? false : d.mode;
      return {
        name: entry.name,
        sets: entry.sets ? entry.sets : d.sets,
        mode: timeMode ? "time" : "reps",
        reps: entry.reps || d.reps,
        time: entry.time || d.time,
        rest: entry.rest || d.rest,
        target_load: entry.target_load || d.target_load,
      };
    });
    setEditNameDropdownOpen(false);
  };

  const saveEditExercise = async () => {
    if (!editModal) return;
    setSavingEdit(true);
    setError("");
    const patch: Partial<SessionExercise> = {
      name: editDraft.name.trim(),
      sets: parseInt(editDraft.sets, 10) || editModal.exercise.sets,
      rest: editDraft.rest,
      target_load: editDraft.target_load,
      reps: editDraft.mode === "reps" ? editDraft.reps : "",
      time: editDraft.mode === "time" ? editDraft.time : "",
    };
    try {
      await updateExercise(editModal.exercise.id, patch);
      setSessions((prev) =>
        prev.map((s) =>
          s.id !== editModal.sessionId ? s : {
            ...s,
            exercises: s.exercises?.map((e) => e.id === editModal.exercise.id ? { ...e, ...patch } : e),
          }
        )
      );
      closeEditExercise();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save changes");
    } finally {
      setSavingEdit(false);
    }
  };

  // Recompute %1RM targets whenever the active session's prescribed
  // percentages actually change - including the very first time real
  // session data replaces the initial empty state, which a signature
  // tied only to activeTab/sessionMap would miss entirely.
  const targetsAthlete = shownAthletes.find((a) => a.id === activeTab) ?? shownAthletes[0];
  const targetsSess = targetsAthlete ? getActiveSession(targetsAthlete.id) : null;
  const percentSignature = (targetsSess?.exercises ?? [])
    .map((e) => `${e.id}:${e.use_percent_1rm ? (e.set_percents ?? []).join(",") : ""}`)
    .join("|");

  useEffect(() => {
    const athlete = shownAthletes.find((a) => a.id === activeTab) ?? shownAthletes[0];
    const sess = athlete ? getActiveSession(athlete.id) : null;
    // Computed for every %1RM exercise in the active session (not just
    // whichever one happens to be expanded), so the compact per-set
    // dots can capture a target on tap too, not only the expanded
    // set editor.
    const withPercent = (sess?.exercises ?? []).filter(
      (e) => e.use_percent_1rm && (e.set_percents ?? []).some((p) => p)
    );
    if (!athlete || !withPercent.length) return;

    let cancelled = false;
    (async () => {
      const settings = await getOrgSettings().catch(() => null);
      const formula = settings?.one_rm_formula ?? "lander";
      const entries = await Promise.all(
        withPercent.map(async (ex) => {
          const oneRM = await resolveCurrentOneRM(athlete.id, ex.name, formula).catch(() => null);
          return [ex.id, oneRM != null ? calculateSetTargets(oneRM, ex.set_percents ?? []) : null] as const;
        })
      );
      if (cancelled) return;
      setOneRmTargets((prev) => {
        const next = { ...prev };
        for (const [id, targets] of entries) if (targets) next[id] = targets;
        return next;
      });
    })();
    return () => { cancelled = true; };
    // Deliberately keyed off a content signature (not `sessions` or
    // `loading` directly) - this ran once on mount before sessions had
    // actually loaded yet, saw nothing to compute, and with only
    // activeTab/sessionMap as deps it never re-fired once real session
    // data arrived, leaving Live Group's kg boxes permanently empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, sessionMap[activeTab], percentSignature]);

  if (loading) return <div style={s.empty}>Loading…</div>;

  const activeAthlete = shownAthletes.find((a) => a.id === activeTab) ?? shownAthletes[0];
  const activeSess    = activeAthlete ? getActiveSession(activeAthlete.id) : null;
  const sessChoices   = activeAthlete ? athleteSessions(activeAthlete.id) : [];
  const meta          = TYPE_META[activeSess?.type ?? "strength"];

  // Library search for the quick exercise-edit popup's name field -
  // same substring-match-anywhere convention as ExerciseCard's own
  // autocomplete, so a coach swapping an exercise mid-session can find
  // it by typing instead of only ever typing a fresh free-text name.
  const editNameQuery = editDraft.name.trim().toLowerCase();
  const editNameMatches = editNameQuery
    ? library.filter((l) => l.name.toLowerCase().includes(editNameQuery)).slice(0, 8)
    : [];

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <h1 style={s.title}>Live Group</h1>
        <div style={s.headerRight}>
          <div style={s.modeToggle}>
            <button style={{ ...s.modeBtn, ...(mode === "starred" ? s.modeBtnActive : {}) }}
              onClick={() => changeMode("starred")}>★ Starred</button>
            <button style={{ ...s.modeBtn, ...(mode === "group" ? s.modeBtnActive : {}) }}
              onClick={() => changeMode("group")}>👥 Group</button>
          </div>
          {mode === "group" && groups.length > 0 && (
            <select style={s.groupSelect} value={selGroup || groups[0]}
              onChange={(e) => changeGroup(e.target.value)}>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          {mode === "group" && groups.length === 0 && (
            <span style={{ fontSize: 12, color: "var(--mute)" }}>No groups set on athletes</span>
          )}
          {mode === "group" && challengesEnabled && (
            <button style={s.refreshBtn} onClick={() => setChallengePanelOpen(true)} title="Launch a challenge">🏆</button>
          )}
          <button style={s.refreshBtn} onClick={load} title="Refresh">↻</button>
        </div>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {shownAthletes.length === 0 ? (
        <div style={s.empty}>
          {mode === "starred"
            ? "No athletes starred. Open an athlete's page and tap ☆ to add them."
            : `No athletes in group "${selGroup || groups[0]}".`}
        </div>
      ) : (
        <>
          {/* Athlete tabs */}
          <div style={s.tabBar} ref={tabBarRef}>
            {shownAthletes.map((athlete) => {
              const sess = getActiveSession(athlete.id);
              const isActive = athlete.id === (activeTab || shownAthletes[0]?.id);
              const tm = TYPE_META[sess?.type ?? "strength"];
              return (
                <button key={athlete.id} data-id={athlete.id}
                  style={{ ...s.tab, ...(isActive ? { ...s.tabActive, borderBottomColor: tm.color } : {}) }}
                  onClick={() => changeTab(athlete.id)}>
                  {athlete.name.split(" ")[0]}
                  {sess && <span style={{ ...s.tabDot, background: tm.color }} />}
                </button>
              );
            })}
          </div>

          {/* Active athlete panel */}
          {activeAthlete && (
            <div style={s.panel}>
              {/* Athlete name + session selector */}
              <div style={s.panelHead}>
                <div>
                  <div style={s.panelName}>{activeAthlete.name}</div>
                  {activeAthlete.group && <div style={s.panelGroup}>{activeAthlete.group}</div>}
                </div>
                <div style={s.sesRow}>
                  {sessChoices.length > 1 ? (
                    <select style={s.sesSelect} value={activeSess?.id ?? ""}
                      onChange={(e) => setSessionPin(activeAthlete.id, e.target.value)}>
                      {sessChoices.map((sess) => (
                        <option key={sess.id} value={sess.id}>
                          {fmtDate(sess.date)} - {sess.name}
                        </option>
                      ))}
                    </select>
                  ) : activeSess ? (
                    <div style={s.sesSingle}>{fmtDate(activeSess.date)} - {activeSess.name}</div>
                  ) : (
                    <div style={s.sesNone}>No upcoming sessions</div>
                  )}
                  {activeSess && (
                    <button
                      style={{ ...s.noteBtn, ...(activeSess.session_notes?.trim() ? s.noteBtnActive : {}) }}
                      onClick={() => openSessionNote(activeSess)}
                      title={activeSess.session_notes?.trim() ? "Edit session note" : "Add session note"}
                    >
                      📝 {activeSess.session_notes?.trim() ? "Session note" : "Add note"}
                    </button>
                  )}
                  {checkinEnabled && (
                    <button style={s.noteBtn} onClick={() => setCheckInOpen(true)} title="Session check-in">
                      ✅
                    </button>
                  )}
                  {activeSess && (
                    <button style={s.openBtn}
                      onClick={() => router.push(`/athletes/${activeAthlete.id}/sessions/${activeSess.id}`)}>
                      Open full session →
                    </button>
                  )}
                </div>
              </div>

              {activeSess && (
                <div style={{ ...s.typeBadge, background: meta.dim, color: meta.color }}>
                  {meta.label}
                </div>
              )}

              {/* Exercise list */}
              {activeSess && activeSess.type === "strength" && (
                <div style={s.exList}>
                  {(activeSess.exercises ?? []).length === 0 && (
                    <div style={s.noEx}>No exercises in this session yet.</div>
                  )}
                  {(activeSess.exercises ?? []).map((ex, i) => {
                    const isExpanded = expandedEx === ex.id;
                    const doneSets  = (ex.log ?? []).filter((l) => l.done).length;
                    const totalSets = ex.log?.length ?? 0;
                    // Same rule as the athlete app and coach session
                    // builder - a bodyweight exercise has no weight to
                    // enter, and a time-based one (e.g. a plank hold)
                    // needs a Time column, not Reps. Without this,
                    // every exercise showed kg + reps regardless of
                    // how it was actually prescribed.
                    const showWeight = !ex.is_bodyweight;
                    const timeMode = (ex.time ?? "").trim().length > 0;
                    const completionOnly = !!ex.completion_only;
                    const showVelocity = !!ex.track_velocity && !completionOnly;
                    const showPause = !!ex.track_pause && !completionOnly && !timeMode;
                    const setGridCols = completionOnly
                      ? "32px 44px"
                      : [showWeight ? "1fr" : "", "1fr", showVelocity ? "1fr" : "", showPause ? "1fr" : "", "40px", "44px"]
                          .filter(Boolean).join(" ").replace(/^/, "32px ");
                    // What the athlete actually did last time on this
                    // exercise, so the coach doesn't have to leave
                    // Live Group and dig through past sessions to see
                    // what to load the bar with.
                    const prevEx = findPreviousExercise(sessions, activeAthlete.id, ex.name, activeSess.date);
                    const prevLabel = formatPrevSets(prevEx);
                    // Two independent, data-driven complements to the
                    // coach's own 👍/👎 call below: the single best set
                    // (heaviest load, or reps/time when there's no load)
                    // and total tonnage across every completed set - a
                    // coach adding an extra working set at the same
                    // weight raises total load even though the best-set
                    // comparison alone would read "same". Total stays
                    // null (and hidden) for bodyweight/time-mode
                    // exercises, where there's no weight to sum.
                    const bestSignal = computeBestSetSignal(ex, prevEx);
                    const totalSignal = computeTotalLoadSignal(ex, prevEx);
                    // Before any set is ticked done this session there's
                    // nothing yet to compare - fall back to what the
                    // coach recorded last time instead of showing
                    // nothing, in the same line slot the real signal
                    // will take over once data comes in.
                    const expectedProgress = !bestSignal && !totalSignal ? (prevEx?.progress || null) : null;
                    return (
                      <div key={ex.id} style={s.exBlock}>
                        {/* Clickable exercise header row */}
                        <div style={s.exRow} onClick={() => setExpandedEx(isExpanded ? null : ex.id)}>
                          <span style={s.exOrder}>{ex.order || String(i + 1)}</span>
                          <div style={s.exMeta}>
                            <span style={s.exName}>{ex.name || "-"}</span>
                            {(ex.sets || ex.reps || ex.time || ex.target_load) && (
                              <span style={s.exPrescription}>
                                {[ex.sets ? `${ex.sets}×` : "", ex.time || ex.reps, ex.target_load]
                                  .filter(Boolean).join(" ")}
                              </span>
                            )}
                            {prevLabel && (
                              <span style={s.exPrevLine}>Last: {prevLabel}</span>
                            )}
                            {expectedProgress === "yes" && (
                              <span style={{ ...s.exProgression, ...s.exProgressionUp }}>💡 Marked ready to progress last time</span>
                            )}
                            {expectedProgress === "no" && (
                              <span style={{ ...s.exProgression, ...s.exProgressionSame }}>💡 Marked not ready to progress last time</span>
                            )}
                            {bestSignal && (
                              <span style={{ ...s.exProgression, ...progressionDirStyle(bestSignal.direction) }}>
                                {progressionArrow(bestSignal.direction)} Best: {bestSignal.label}
                              </span>
                            )}
                            {totalSignal && (
                              <span style={{ ...s.exProgression, ...progressionDirStyle(totalSignal.direction) }}>
                                {progressionArrow(totalSignal.direction)} Total: {totalSignal.label}
                              </span>
                            )}
                          </div>
                          <div style={{ ...s.exRight, ...(isMobile ? s.exRightMobile : {}) }}>
                            {/* Compact dots */}
                            <div style={s.dotsRow}>
                              <div style={s.dots}>
                                {(ex.log ?? []).map((set, si) => (
                                  <button key={si}
                                    title={
                                      showWeight && set.weight ? `${set.weight}kg`
                                      : timeMode && set.time ? `${set.time}s`
                                      : `Set ${si + 1}`
                                    }
                                    onClick={(e) => { e.stopPropagation(); handleToggleDot(activeSess.id, ex.id, si, ex.log ?? [], oneRmTargets[ex.id]?.[si] ?? null); }}
                                    style={{ ...s.dot, ...(set.done ? s.dotOn : {}) }} />
                                ))}
                              </div>
                              <span style={s.setCount}>{doneSets}/{totalSets}</span>
                              {!isMobile && <span style={s.chevron}>{isExpanded ? "▴" : "▾"}</span>}
                            </div>
                            {/* Coach's own progress call - no prompt,
                                just tap. Toggles off on a repeat tap.
                                Stacked below the dots on mobile so the
                                exercise name isn't squeezed for space. */}
                            <div style={s.thumbRow} onClick={(e) => e.stopPropagation()}>
                              <button
                                title="Swap exercise / change sets, reps, or time"
                                onClick={() => openEditExercise(activeSess.id, ex)}
                                style={s.thumbBtn}>
                                ✏️
                              </button>
                              <button
                                title={ex.notes?.trim() ? "Edit exercise note" : "Add exercise note"}
                                onClick={() => openExerciseNote(activeSess.id, ex)}
                                style={{ ...s.thumbBtn, ...(ex.notes?.trim() ? s.thumbBtnNoted : {}) }}>
                                📝
                              </button>
                              <button
                                title="Athlete could progress this next time"
                                onClick={() => handleSetProgress(activeSess.id, ex.id, "yes")}
                                style={{ ...s.thumbBtn, ...(ex.progress === "yes" ? s.thumbBtnYes : {}) }}>
                                👍
                              </button>
                              <button
                                title="Not ready to progress this yet"
                                onClick={() => handleSetProgress(activeSess.id, ex.id, "no")}
                                style={{ ...s.thumbBtn, ...(ex.progress === "no" ? s.thumbBtnNo : {}) }}>
                                👎
                              </button>
                              {isMobile && <span style={s.chevron}>{isExpanded ? "▴" : "▾"}</span>}
                            </div>
                          </div>
                        </div>

                        {/* Expanded set editor */}
                        {isExpanded && (
                          <div style={s.setEditor}>
                            <div style={{ ...s.setHeaderRow, gridTemplateColumns: setGridCols }}>
                              <span style={s.setColLabel}>Set</span>
                              {!completionOnly && showWeight && <span style={s.setColLabel}>Weight (kg)</span>}
                              {!completionOnly && <span style={s.setColLabel}>{timeMode ? "Time (s)" : "Reps"}</span>}
                              {showVelocity && <span style={s.setColLabel}>Speed (m/s)</span>}
                              {showPause && <span style={s.setColLabel}>Pause (s)</span>}
                              {!completionOnly && <span style={s.setColLabel} />}
                              <span style={s.setColLabel}>Done</span>
                            </div>
                            {(ex.log ?? []).map((set, si) => completionOnly ? (
                              <div key={si} style={{ ...s.setRow, gridTemplateColumns: setGridCols }}>
                                <span style={s.setNum}>{si + 1}</span>
                                <button
                                  onClick={() => handleLogChange(activeSess.id, ex.id, si, { done: !set.done })}
                                  style={{ ...s.doneBtn, ...(set.done ? s.doneBtnOn : {}) }}>
                                  ✓
                                </button>
                              </div>
                            ) : (
                              <div key={si} style={{ ...s.setRow, gridTemplateColumns: setGridCols }}>
                                <span style={s.setNum}>{si + 1}</span>
                                {showWeight && (
                                  <input
                                    key={`w-${ex.id}-${si}-${set.weight}`}
                                    defaultValue={set.weight}
                                    type="number"
                                    step="0.5"
                                    placeholder={oneRmTargets[ex.id]?.[si] != null ? String(oneRmTargets[ex.id][si]) : (ex.target_load || "kg")}
                                    inputMode="decimal"
                                    style={s.setInput}
                                    onBlur={(e) => {
                                      const v = e.target.value;
                                      if (v === set.weight) return;
                                      const willBeDone = v.trim().length > 0 ? true : set.done;
                                      const patch: Partial<SetLog> = { weight: v, done: willBeDone };
                                      // Tabbing forward into the reps box for this same set
                                      // is a normal keyboard move, not "leaving the set" - the
                                      // reps box's own key includes set.reps, so filling it in
                                      // here would remount it out from under the incoming Tab
                                      // focus. Skip the carry-over in that case and let the reps
                                      // box's own onBlur below fill it in once it's actually left.
                                      const tabbingIntoReps = e.relatedTarget instanceof HTMLElement
                                        && e.relatedTarget.id === `reps-${ex.id}-${si}`;
                                      const singleRep = singleRepValue(ex.reps);
                                      if (willBeDone && !tabbingIntoReps && !set.reps.trim() && singleRep) patch.reps = singleRep;
                                      handleLogChange(activeSess.id, ex.id, si, patch);
                                    }}
                                  />
                                )}
                                {timeMode ? (
                                  <input
                                    key={`t-${ex.id}-${si}-${set.time}`}
                                    defaultValue={set.time ?? ""}
                                    type="number"
                                    placeholder={ex.time || "sec"}
                                    inputMode="numeric"
                                    style={s.setInput}
                                    onBlur={(e) => {
                                      const v = e.target.value;
                                      if (v === (set.time ?? "")) return;
                                      handleLogChange(activeSess.id, ex.id, si, { time: v, done: v.trim().length > 0 ? true : set.done });
                                    }}
                                  />
                                ) : (
                                  <input
                                    id={`reps-${ex.id}-${si}`}
                                    key={`r-${ex.id}-${si}-${set.reps}`}
                                    defaultValue={set.reps}
                                    type="number"
                                    placeholder={ex.reps || "-"}
                                    inputMode="numeric"
                                    style={s.setInput}
                                    onBlur={(e) => {
                                      const v = e.target.value;
                                      if (v === set.reps) {
                                        // Weight's onBlur deliberately skipped carrying over the
                                        // prescribed reps when tabbing forward into this box
                                        // (see there) - if it's still empty now that it's
                                        // actually being left, fill it in here instead.
                                        const singleRep = singleRepValue(ex.reps);
                                        if (set.done && !v.trim() && singleRep) {
                                          handleLogChange(activeSess.id, ex.id, si, { reps: singleRep });
                                        }
                                        return;
                                      }
                                      handleLogChange(activeSess.id, ex.id, si, { reps: v, done: v.trim().length > 0 ? true : set.done });
                                    }}
                                  />
                                )}
                                {showVelocity && (
                                  <input
                                    key={`v-${ex.id}-${si}-${set.velocity}`}
                                    defaultValue={set.velocity ?? ""}
                                    type="number"
                                    step="0.01"
                                    placeholder={ex.target_velocity ? `${ex.target_velocity} m/s` : "m/s"}
                                    inputMode="decimal"
                                    style={s.setInput}
                                    onBlur={(e) => {
                                      const v = e.target.value;
                                      if (v === (set.velocity ?? "")) return;
                                      handleLogChange(activeSess.id, ex.id, si, { velocity: v });
                                    }}
                                  />
                                )}
                                {showPause && (
                                  <input
                                    key={`p-${ex.id}-${si}-${set.pause}`}
                                    defaultValue={set.pause ?? ""}
                                    type="number"
                                    step="0.5"
                                    placeholder={ex.target_pause ? `${ex.target_pause}s` : "pause"}
                                    inputMode="numeric"
                                    style={s.setInput}
                                    onBlur={(e) => {
                                      const v = e.target.value;
                                      if (v === (set.pause ?? "")) return;
                                      handleLogChange(activeSess.id, ex.id, si, { pause: v });
                                    }}
                                  />
                                )}
                                {(() => {
                                  const prev = si > 0 ? (ex.log ?? [])[si - 1] : null;
                                  const hasPrev = !!prev && (prev.weight?.trim() || prev.reps?.trim() || prev.time?.trim());
                                  return (
                                    <button
                                      title={hasPrev ? "Copy the previous set" : undefined}
                                      disabled={!hasPrev}
                                      onClick={() => {
                                        if (!prev) return;
                                        const patch: Partial<SetLog> = { done: true };
                                        if (showWeight) patch.weight = prev.weight;
                                        if (timeMode) patch.time = prev.time;
                                        else patch.reps = prev.reps;
                                        handleLogChange(activeSess.id, ex.id, si, patch);
                                      }}
                                      style={{ ...s.repeatBtn, ...(hasPrev ? {} : s.repeatBtnDisabled) }}>
                                      ↻
                                    </button>
                                  );
                                })()}
                                <button
                                  onClick={() => handleToggleDot(activeSess.id, ex.id, si, ex.log ?? [], oneRmTargets[ex.id]?.[si] ?? null, ex.reps)}
                                  style={{ ...s.doneBtn, ...(set.done ? s.doneBtnOn : {}) }}>
                                  {set.done ? "✓" : "○"}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {activeSess && (activeSess.type === "hyrox" || activeSess.type === "cardio") && (
                <HyroxCardioLog
                  session={activeSess}
                  onPatch={(patch) => {
                    const field = activeSess.type === "hyrox" ? "hyrox_config" : "cardio_config";
                    const currentCfg: any = (activeSess as any)[field] ?? {};
                    const next = { ...currentCfg, ...patch };
                    setSessions((prev) => prev.map((sess) => sess.id !== activeSess.id ? sess : { ...sess, [field]: next } as Session));
                    updateSession(activeSess.id, { [field]: next } as Partial<Session>)
                      .catch((e) => setError(e instanceof Error ? e.message : "Could not save"));
                  }}
                  compact
                />
              )}

              {activeSess && activeSess.type !== "strength" && activeSess.type !== "hyrox" && activeSess.type !== "cardio" && (
                <div style={s.noEx}>
                  {meta.label} session - use "Open full session" above for the timer &amp; log.
                </div>
              )}

              {!activeSess && (
                <div style={s.noEx}>
                  No upcoming sessions.{" "}
                  <span style={{ color: "var(--accent)", cursor: "pointer" }}
                    onClick={() => router.push(`/athletes/${activeAthlete.id}`)}>
                    Open athlete page →
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {checkInOpen && <CheckInModal onClose={() => setCheckInOpen(false)} />}

      {challengePanelOpen && (
        <LiveChallengePanel matchGroupName={selGroup || groups[0]} onClose={() => setChallengePanelOpen(false)} />
      )}

      {noteModal && (
        <div style={s.noteOverlay} onClick={closeNoteModal}>
          <div style={s.notePanel} onClick={(e) => e.stopPropagation()}>
            <div style={s.noteTitle}>
              {noteModal.kind === "session" ? "Session note" : `Note - ${noteModal.exerciseName}`}
            </div>
            <textarea
              autoFocus
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder={noteModal.kind === "session" ? "Note for this session…" : "Coaching cue for this exercise…"}
              style={s.noteTextarea}
            />
            <div style={s.noteBtns}>
              <button style={s.noteCancelBtn} onClick={closeNoteModal}>Cancel</button>
              <button style={{ ...s.noteSaveBtn, opacity: savingNote ? 0.6 : 1 }} disabled={savingNote} onClick={saveNote}>
                {savingNote ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editModal && (
        <div style={s.noteOverlay} onClick={closeEditExercise}>
          <div style={s.notePanel} onClick={(e) => e.stopPropagation()}>
            <div style={s.noteTitle}>Edit exercise</div>
            <div style={s.editFieldLabel}>Name</div>
            <div style={s.editNameWrap}>
              <input
                autoFocus
                value={editDraft.name}
                onChange={(e) => { setEditDraft((d) => ({ ...d, name: e.target.value })); setEditNameDropdownOpen(true); }}
                onFocus={() => setEditNameDropdownOpen(true)}
                onBlur={() => setTimeout(() => setEditNameDropdownOpen(false), 150)}
                style={s.editInput}
              />
              {editNameDropdownOpen && editNameQuery && editNameMatches.length > 0 && (
                <div style={s.editNameDropdown}>
                  {editNameMatches.map((entry) => (
                    <button
                      key={entry.id}
                      style={s.editNameDropdownItem}
                      onMouseDown={(e) => { e.preventDefault(); applyEditLibraryPreset(entry); }}
                    >
                      {entry.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={s.editRow}>
              <div style={{ flex: 1 }}>
                <div style={s.editFieldLabelRow}>
                  <div style={s.editFieldLabel}>Sets</div>
                </div>
                <input
                  value={editDraft.sets}
                  onChange={(e) => setEditDraft((d) => ({ ...d, sets: e.target.value }))}
                  inputMode="numeric"
                  style={s.editInput}
                />
              </div>
              <div style={{ flex: 2 }}>
                <div style={s.editFieldLabelRow}>
                  <div style={s.editFieldLabel}>Reps / Time</div>
                  <div style={s.editModeToggle}>
                    <button
                      style={{ ...s.editModeBtn, ...(editDraft.mode === "reps" ? s.editModeBtnActive : {}) }}
                      onClick={() => setEditDraft((d) => ({ ...d, mode: "reps" }))}>
                      Reps
                    </button>
                    <button
                      style={{ ...s.editModeBtn, ...(editDraft.mode === "time" ? s.editModeBtnActive : {}) }}
                      onClick={() => setEditDraft((d) => ({ ...d, mode: "time" }))}>
                      Time
                    </button>
                  </div>
                </div>
                <input
                  value={editDraft.mode === "reps" ? editDraft.reps : editDraft.time}
                  onChange={(e) => setEditDraft((d) => d.mode === "reps" ? { ...d, reps: e.target.value } : { ...d, time: e.target.value })}
                  placeholder={editDraft.mode === "reps" ? "e.g. 8" : "e.g. 45s"}
                  style={s.editInput}
                />
              </div>
            </div>
            <div style={s.editRow}>
              <div style={{ flex: 1 }}>
                <div style={s.editFieldLabel}>Rest</div>
                <input
                  value={editDraft.rest}
                  onChange={(e) => setEditDraft((d) => ({ ...d, rest: e.target.value }))}
                  placeholder="90s"
                  style={s.editInput}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={s.editFieldLabel}>Load</div>
                <input
                  value={editDraft.target_load}
                  onChange={(e) => setEditDraft((d) => ({ ...d, target_load: e.target.value }))}
                  placeholder="e.g. 60kg"
                  style={s.editInput}
                />
              </div>
            </div>
            <div style={s.noteBtns}>
              <button style={s.noteCancelBtn} onClick={closeEditExercise}>Cancel</button>
              <button
                style={{ ...s.noteSaveBtn, opacity: !editDraft.name.trim() || savingEdit ? 0.6 : 1 }}
                disabled={!editDraft.name.trim() || savingEdit}
                onClick={saveEditExercise}
              >
                {savingEdit ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:         { maxWidth: 860, padding: "0 0 40px" },
  header:       { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" as const },
  title:        { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: 0 },
  headerRight:  { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const },
  modeToggle:   { display: "flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" },
  modeBtn:      { background: "transparent", border: "none", color: "var(--mute)", padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  modeBtnActive:{ background: "var(--accent-dim)", color: "var(--accent)" },
  groupSelect:  { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 13 },
  refreshBtn:   { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "7px 12px", fontSize: 14, cursor: "pointer" },
  errorBox:     { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16 },
  empty:        { color: "var(--mute)", fontSize: 14, padding: "40px 0", textAlign: "center" as const },
  tabBar:       { display: "flex", overflowX: "auto" as const, borderBottom: "1px solid var(--line)", marginBottom: 16, gap: 2, scrollbarWidth: "none" as const },
  tab:          { background: "transparent", border: "none", borderBottom: "2px solid transparent", color: "var(--mute)", padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" as const, flexShrink: 0 },
  tabActive:    { color: "var(--text)" },
  tabDot:       { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 },
  panel:        { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: 20, display: "flex", flexDirection: "column" as const, gap: 14 },
  panelHead:    { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const },
  panelName:    { fontSize: 20, fontWeight: 700, color: "var(--text)" },
  panelGroup:   { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  sesRow:       { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const },
  sesSelect:    { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 13 },
  sesSingle:    { fontSize: 13, color: "var(--mute)" },
  sesNone:      { fontSize: 13, color: "var(--mute)", fontStyle: "italic" as const },
  openBtn:      { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  noteBtn:      { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  noteBtnActive:{ background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" },
  typeBadge:    { fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, alignSelf: "flex-start" as const },
  exList:       { display: "flex", flexDirection: "column" as const, gap: 6 },
  noEx:         { fontSize: 13, color: "var(--mute)", padding: "8px 0" },
  exBlock:      { background: "var(--ink)", borderRadius: 10, overflow: "hidden" },
  exRow:        { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" },
  exOrder:      { fontSize: 12, fontWeight: 800, color: "var(--accent)", minWidth: 24, flexShrink: 0 },
  exMeta:       { display: "flex", flexDirection: "column" as const, flex: 1, minWidth: 0 },
  exName:       { fontSize: 14, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  exPrescription:{ fontSize: 11, color: "var(--mute)", marginTop: 1 },
  exPrevLine:   { fontSize: 11, color: "var(--accent)", marginTop: 1 },
  exProgression:     { fontSize: 11, fontWeight: 700, marginTop: 1, display: "block" },
  exProgressionUp:   { color: "var(--good)" },
  exProgressionDown: { color: "#ff7d7d" },
  exProgressionSame: { color: "var(--mute)" },
  exRight:      { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
  // Stacks dots+count above thumbs instead of one long row, so exMeta
  // (the exercise name, flex:1 minWidth:0) gets more of the row's
  // width back on a narrow phone screen instead of being the only
  // thing that shrinks.
  exRightMobile:{ flexDirection: "column" as const, alignItems: "flex-end", gap: 3 },
  dotsRow:      { display: "flex", alignItems: "center", gap: 8 },
  thumbRow:     { display: "flex", alignItems: "center", gap: 2 },
  thumbBtn:     { background: "transparent", border: "1px solid var(--line)", borderRadius: 6, padding: "2px 5px", fontSize: 12, cursor: "pointer", opacity: 0.5, lineHeight: 1 },
  thumbBtnYes:  { opacity: 1, background: "var(--good-dim)", borderColor: "var(--good)" },
  thumbBtnNo:   { opacity: 1, background: "var(--panel2)", borderColor: "var(--mute)" },
  thumbBtnNoted:{ opacity: 1, background: "var(--accent-dim)", borderColor: "var(--accent)" },
  dots:         { display: "flex", gap: 4 },
  dot:          { width: 16, height: 16, borderRadius: "50%", border: "1px solid var(--line)", background: "transparent", cursor: "pointer", padding: 0, flexShrink: 0 },
  dotOn:        { background: "var(--good)", borderColor: "var(--good)" },
  setCount:     { fontSize: 11, color: "var(--mute)", minWidth: 24 },
  chevron:      { fontSize: 10, color: "var(--mute)", marginLeft: 2 },
  setEditor:    { borderTop: "1px solid var(--line)", padding: "10px 12px", display: "flex", flexDirection: "column" as const, gap: 6 },
  setHeaderRow: { display: "grid", gridTemplateColumns: "32px 1fr 1fr 44px", gap: 8, paddingBottom: 4 },
  setColLabel:  { fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  setRow:       { display: "grid", gridTemplateColumns: "32px 1fr 1fr 44px", gap: 8, alignItems: "center" },
  setNum:       { fontSize: 12, fontWeight: 700, color: "var(--mute)", textAlign: "center" as const },
  setInput:     { background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 7, padding: "6px 8px", fontSize: 14, fontWeight: 600, width: "100%", boxSizing: "border-box" as const },
  doneBtn:      { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 7, padding: "6px 0", fontSize: 16, cursor: "pointer", width: "100%", textAlign: "center" as const },
  doneBtnOn:    { background: "var(--good-dim)", color: "var(--good)", borderColor: "var(--good)" },
  // Copies the previous set's weight/reps (or time) into this one and
  // marks it done - straight sets (same weight/reps across sets) are
  // the common case, so this saves re-typing the same numbers for set
  // 2, 3, 4... Disabled on set 1 (nothing to copy from) and on any set
  // whose predecessor is itself still empty.
  repeatBtn:    { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 7, padding: "6px 0", fontSize: 15, cursor: "pointer", width: "100%", textAlign: "center" as const },
  repeatBtnDisabled: { opacity: 0.3, cursor: "default" as const },
  noteOverlay:  { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 },
  notePanel:    { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: 18, width: "100%", maxWidth: 420, display: "flex", flexDirection: "column" as const, gap: 10 },
  noteTitle:    { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  noteTextarea: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 14, minHeight: 120, resize: "vertical" as const, fontFamily: "inherit" },
  noteBtns:     { display: "flex", gap: 8, justifyContent: "flex-end" },
  noteCancelBtn:{ background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  noteSaveBtn:  { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  editFieldLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.04em" },
  // Label sits on its own row, height-matched across every field in a
  // given editRow (with or without a mode toggle alongside it) so the
  // inputs below always start at the same y position - previously the
  // Reps/Time column had an extra toggle row between its label and
  // input that Sets didn't, pushing its input down out of alignment.
  editFieldLabelRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4, minHeight: 20 },
  editInput:    { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" as const },
  editRow:      { display: "flex", gap: 10 },
  editNameWrap: { position: "relative" as const },
  editNameDropdown: {
    position: "absolute" as const, top: "100%", left: 0, right: 0, zIndex: 10, marginTop: 4,
    background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8,
    maxHeight: 200, overflowY: "auto" as const, boxShadow: "0 4px 16px rgba(0,0,0,.3)",
  },
  editNameDropdownItem: {
    display: "block", width: "100%", textAlign: "left" as const, background: "transparent", border: "none",
    color: "var(--text)", padding: "8px 12px", fontSize: 13, cursor: "pointer",
  },
  editModeToggle: { display: "flex", gap: 4, background: "var(--ink)", borderRadius: 6, padding: 2 },
  editModeBtn:  { background: "transparent", border: "none", color: "var(--mute)", borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer" },
  editModeBtnActive: { background: "var(--panel)", color: "var(--accent)" },
};
