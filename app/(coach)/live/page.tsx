"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { listLiveGroupAthletes } from "@/lib/data/athletes";
import { listSessionsForAthletes, toggleSetDone, updateExerciseLog } from "@/lib/data/sessions";
import { createClient } from "@/lib/supabase-browser";
import type { Athlete, Session, SessionType, SetLog } from "@/types";

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
    const cutoff = addDays(todayISO(), -1);
    return sessions
      .filter((s) => s.athlete_id === athleteId && s.date >= cutoff)
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
    currentLog: SetLog[]
  ) => {
    const newLog = currentLog.map((l, i) => i === setIndex ? { ...l, done: !l.done } : l);
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
                          </div>
                          <div style={s.exRight}>
                            {/* Compact dots */}
                            <div style={s.dots}>
                              {(ex.log ?? []).map((set, si) => (
                                <button key={si}
                                  title={set.weight ? `${set.weight}kg` : `Set ${si + 1}`}
                                  onClick={(e) => { e.stopPropagation(); handleToggleDot(activeSess.id, ex.id, si, ex.log ?? []); }}
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
                            <div style={s.setHeaderRow}>
                              <span style={s.setColLabel}>Set</span>
                              <span style={s.setColLabel}>Weight (kg)</span>
                              <span style={s.setColLabel}>Reps</span>
                              <span style={s.setColLabel}>Done</span>
                            </div>
                            {(ex.log ?? []).map((set, si) => (
                              <div key={si} style={s.setRow}>
                                <span style={s.setNum}>{si + 1}</span>
                                <input
                                  key={`w-${ex.id}-${si}-${set.weight}`}
                                  defaultValue={set.weight}
                                  type="number"
                                  step="0.5"
                                  placeholder="—"
                                  inputMode="decimal"
                                  style={s.setInput}
                                  onBlur={(e) => {
                                    const v = e.target.value;
                                    if (v === set.weight) return;
                                    handleLogChange(activeSess.id, ex.id, si, { weight: v, done: v.trim().length > 0 ? true : set.done });
                                  }}
                                />
                                <input
                                  key={`r-${ex.id}-${si}-${set.reps}`}
                                  defaultValue={set.reps}
                                  type="number"
                                  placeholder="—"
                                  inputMode="numeric"
                                  style={s.setInput}
                                  onBlur={(e) => {
                                    const v = e.target.value;
                                    if (v === set.reps) return;
                                    handleLogChange(activeSess.id, ex.id, si, { reps: v });
                                  }}
                                />
                                <button
                                  onClick={() => handleToggleDot(activeSess.id, ex.id, si, ex.log ?? [])}
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
  exRight:      { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
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
