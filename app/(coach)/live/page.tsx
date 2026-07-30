"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { listLiveGroupAthletes } from "@/lib/data/athletes";
import { listSessionsForAthletes, toggleSetDone, updateExerciseLog, updateExercise } from "@/lib/data/sessions";
import { createClient } from "@/lib/supabase-browser";
import { getOrgSettings } from "@/lib/data/settings";
import { resolveCurrentOneRM } from "@/lib/data/one-rm";
import { calculateSetTargets } from "@/lib/one-rm";
import type { Athlete, Session, SessionType, SetLog, SessionExercise } from "@/types";

const TYPE_META: Record<SessionType, { label: string; color: string; dim: string }> = {
  strength:    { label: "Strength",    color: "#3B8BEB", dim: "#162743" },
  hyrox:       { label: "Hyrox",       color: "#B388FF", dim: "#2a2240" },
  cardio:      { label: "Cardio",      color: "#4DC3FF", dim: "#1a2c38" },
  power_speed: { label: "Power/Speed", color: "#A855F7", dim: "#2a1a4a" },
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

// Finds this exercise's most recent PRIOR session for the same
// athlete (by name, case-insensitive) with at least one completed
// set — so the coach can see what was actually lifted last time
// without leaving Live Group to dig through session history.
function findPreviousExercise(
  sessions: Session[],
  athleteId: string,
  exerciseName: string,
  beforeDate: string
): SessionExercise | null {
  const name = exerciseName.trim().toLowerCase();
  if (!name) return null;
  const past = sessions
    .filter((s) => s.athlete_id === athleteId && s.date < beforeDate)
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // most recent first
  for (const sess of past) {
    const match = (sess.exercises ?? []).find(
      (e) => (e.name ?? "").trim().toLowerCase() === name && (e.log ?? []).some((l) => l.done)
    );
    if (match) return match;
  }
  return null;
}

// "50kg×8, 55kg×8" / "45s, 45s" / "×8, ×8" depending on how the
// exercise was actually logged (weighted, bodyweight+time, or
// bodyweight+reps) — only completed sets are included.
function formatPrevSets(ex: SessionExercise | null): string | null {
  if (!ex) return null;
  const timeMode = (ex.time ?? "").trim().length > 0;
  const showWeight = !ex.is_bodyweight;
  const parts = (ex.log ?? [])
    .filter((l) => l.done)
    .map((l) => {
      if (timeMode) return l.time?.trim() ? `${l.time}s` : null;
      if (!showWeight) return l.reps?.trim() ? `×${l.reps}` : null;
      if (l.weight?.trim() && l.reps?.trim()) return `${l.weight}kg×${l.reps}`;
      if (l.weight?.trim()) return `${l.weight}kg`;
      return null;
    })
    .filter((v): v is string => !!v);
  return parts.length ? parts.join(", ") : null;
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
  // currently expanded — computed lazily (only the exercise actually
  // being viewed) rather than for every athlete's every exercise up
  // front. Purely a preview: typing in the box still auto-completes
  // the set here, same as any other Live Group entry, matching real-
  // time logging alongside the athlete.
  const [oneRmTargets, setOneRmTargets] = useState<Record<string, (number | null)[]>>({});
  const tabBarRef = useRef<HTMLDivElement>(null);

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
    try { await updateExerciseLog(exerciseId, newLog); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save"); }
  };

  const handleToggleDot = async (
    sessionId: string,
    exerciseId: string,
    setIndex: number,
    currentLog: SetLog[],
    target: number | null = null
  ) => {
    const newLog = currentLog.map((l, i) => {
      if (i !== setIndex) return l;
      const nowDone = !l.done;
      // Marking done on a still-empty set with a calculated %1RM
      // target captures that value as the real weight — same as
      // completing it live would, without needing to type it in.
      if (nowDone && !l.weight.trim() && target != null) {
        return { ...l, weight: String(target), done: true };
      }
      return { ...l, done: nowDone };
    });
    setSessions((prev) =>
      prev.map((s) => s.id !== sessionId ? s : {
        ...s,
        exercises: s.exercises?.map((e) =>
          e.id !== exerciseId ? e : { ...e, log: newLog }
        ),
      })
    );
    try { await updateExerciseLog(exerciseId, newLog); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save"); }
  };

  // Coach's own thumbs up/down on whether the athlete could progress
  // this exercise next time — no explanation prompt, just a direct
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

  // Recompute %1RM targets whenever the active session's prescribed
  // percentages actually change — including the very first time real
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
    // `loading` directly) — this ran once on mount before sessions had
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
                          {fmtDate(sess.date)} — {sess.name}
                        </option>
                      ))}
                    </select>
                  ) : activeSess ? (
                    <div style={s.sesSingle}>{fmtDate(activeSess.date)} — {activeSess.name}</div>
                  ) : (
                    <div style={s.sesNone}>No upcoming sessions</div>
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
                    // builder — a bodyweight exercise has no weight to
                    // enter, and a time-based one (e.g. a plank hold)
                    // needs a Time column, not Reps. Without this,
                    // every exercise showed kg + reps regardless of
                    // how it was actually prescribed.
                    const showWeight = !ex.is_bodyweight;
                    const timeMode = (ex.time ?? "").trim().length > 0;
                    const setGridCols = showWeight ? "32px 1fr 1fr 44px" : "32px 1fr 44px";
                    // What the athlete actually did last time on this
                    // exercise, so the coach doesn't have to leave
                    // Live Group and dig through past sessions to see
                    // what to load the bar with.
                    const prevLabel = formatPrevSets(
                      findPreviousExercise(sessions, activeAthlete.id, ex.name, activeSess.date)
                    );
                    return (
                      <div key={ex.id} style={s.exBlock}>
                        {/* Clickable exercise header row */}
                        <div style={s.exRow} onClick={() => setExpandedEx(isExpanded ? null : ex.id)}>
                          <span style={s.exOrder}>{ex.order || String(i + 1)}</span>
                          <div style={s.exMeta}>
                            <span style={s.exName}>{ex.name || "—"}</span>
                            {(ex.sets || ex.reps || ex.target_load) && (
                              <span style={s.exPrescription}>
                                {[ex.sets ? `${ex.sets}×` : "", ex.reps, ex.target_load]
                                  .filter(Boolean).join(" ")}
                              </span>
                            )}
                            {prevLabel && (
                              <span style={s.exPrevLine}>Last: {prevLabel}</span>
                            )}
                          </div>
                          <div style={s.exRight}>
                            {/* Coach's own progress call — no prompt,
                                just tap. Toggles off on a repeat tap. */}
                            <div style={s.thumbRow} onClick={(e) => e.stopPropagation()}>
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
                            </div>
                            {/* Compact dots */}
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
                            <span style={s.chevron}>{isExpanded ? "▴" : "▾"}</span>
                          </div>
                        </div>

                        {/* Expanded set editor */}
                        {isExpanded && (
                          <div style={s.setEditor}>
                            <div style={{ ...s.setHeaderRow, gridTemplateColumns: setGridCols }}>
                              <span style={s.setColLabel}>Set</span>
                              {showWeight && <span style={s.setColLabel}>Weight (kg)</span>}
                              <span style={s.setColLabel}>{timeMode ? "Time (s)" : "Reps"}</span>
                              <span style={s.setColLabel}>Done</span>
                            </div>
                            {(ex.log ?? []).map((set, si) => (
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
                                      handleLogChange(activeSess.id, ex.id, si, { weight: v, done: v.trim().length > 0 ? true : set.done });
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
                                    key={`r-${ex.id}-${si}-${set.reps}`}
                                    defaultValue={set.reps}
                                    type="number"
                                    placeholder={ex.reps || "—"}
                                    inputMode="numeric"
                                    style={s.setInput}
                                    onBlur={(e) => {
                                      const v = e.target.value;
                                      if (v === set.reps) return;
                                      handleLogChange(activeSess.id, ex.id, si, { reps: v });
                                    }}
                                  />
                                )}
                                <button
                                  onClick={() => handleToggleDot(activeSess.id, ex.id, si, ex.log ?? [], oneRmTargets[ex.id]?.[si] ?? null)}
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

              {activeSess && activeSess.type !== "strength" && (
                <div style={s.noEx}>
                  {meta.label} session — use "Open full session" above for the timer &amp; log.
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
  exRight:      { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
  thumbRow:     { display: "flex", gap: 2 },
  thumbBtn:     { background: "transparent", border: "1px solid var(--line)", borderRadius: 6, padding: "2px 5px", fontSize: 12, cursor: "pointer", opacity: 0.5, lineHeight: 1 },
  thumbBtnYes:  { opacity: 1, background: "var(--good-dim)", borderColor: "var(--good)" },
  thumbBtnNo:   { opacity: 1, background: "var(--panel2)", borderColor: "var(--mute)" },
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
};
