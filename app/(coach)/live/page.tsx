"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { listLiveGroupAthletes } from "@/lib/data/athletes";
import { listSessionsForAthletes, toggleSetDone } from "@/lib/data/sessions";
import { createClient } from "@/lib/supabase-browser";
import type { Athlete, Session, SessionType } from "@/types";

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

// ── Local storage helpers ─────────────────────────────────────────────────────
const LS_MODE   = "liveGroup_mode";    // "starred" | "group"
const LS_GROUP  = "liveGroup_group";   // selected group name
const LS_TAB    = "liveGroup_tab";     // selected athlete id
const LS_SES    = "liveGroup_session"; // { [athleteId]: sessionId }

function lsGet(k: string): string { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } }
function lsSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} }
function lsGetObj(k: string): Record<string, string> { try { return JSON.parse(localStorage.getItem(k) ?? "{}"); } catch { return {}; } }
function lsSetObj(k: string, v: Record<string, string>) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

// ── Main component ────────────────────────────────────────────────────────────
export default function LiveGroupPage() {
  const router = useRouter();

  const [mode, setMode]       = useState<"starred" | "group">("starred");
  const [allAthletes, setAllAthletes] = useState<Athlete[]>([]);
  const [groups, setGroups]   = useState<string[]>([]);
  const [selGroup, setSelGroup] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [activeTab, setActiveTab] = useState("");          // athleteId
  const [sessionMap, setSessionMap] = useState<Record<string, string>>({}); // athleteId → sessionId
  const tabBarRef = useRef<HTMLDivElement>(null);

  // ── Load all starred athletes + their sessions ─────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Load starred athletes
      const starred = await listLiveGroupAthletes();

      // Also load ALL non-archived athletes (for group mode)
      const supabase = createClient();
      const { data: allData } = await supabase
        .from("athletes")
        .select("*")
        .eq("archived", false)
        .order("name");
      const all: Athlete[] = allData ?? [];

      setAllAthletes(all);

      // Derive unique non-empty groups
      const uniqueGroups = Array.from(
        new Set(all.map((a) => a.group).filter(Boolean) as string[])
      ).sort();
      setGroups(uniqueGroups);

      // Load sessions for ALL athletes (we filter client-side)
      const sessionData = await listSessionsForAthletes(all.map((a) => a.id));
      setSessions(sessionData);

      // Restore persisted state
      const savedMode = (lsGet(LS_MODE) as "starred" | "group") || "starred";
      const savedGroup = lsGet(LS_GROUP) || uniqueGroups[0] || "";
      const savedMap = lsGetObj(LS_SES);
      const savedTab = lsGet(LS_TAB);

      setMode(savedMode);
      setSelGroup(savedGroup);
      setSessionMap(savedMap);

      // Determine which athletes are shown then restore tab
      const shown = savedMode === "starred"
        ? starred
        : all.filter((a) => a.group === savedGroup);

      setActiveTab(shown.some((a) => a.id === savedTab) ? savedTab : shown[0]?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load live group");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Persist mode changes
  const changeMode = (m: "starred" | "group") => {
    setMode(m);
    lsSet(LS_MODE, m);
    // Reset tab to first athlete in new mode
    const shown = m === "starred"
      ? allAthletes.filter((a) => a.in_live_group)
      : allAthletes.filter((a) => a.group === selGroup);
    const first = shown[0]?.id ?? "";
    setActiveTab(first);
    lsSet(LS_TAB, first);
  };

  const changeGroup = (g: string) => {
    setSelGroup(g);
    lsSet(LS_GROUP, g);
    const shown = allAthletes.filter((a) => a.group === g);
    const first = shown[0]?.id ?? "";
    setActiveTab(first);
    lsSet(LS_TAB, first);
  };

  const changeTab = (athleteId: string) => {
    setActiveTab(athleteId);
    lsSet(LS_TAB, athleteId);
    // Scroll tab into view
    setTimeout(() => {
      const el = tabBarRef.current?.querySelector(`[data-id="${athleteId}"]`) as HTMLElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }, 50);
  };

  // ── Derive shown athletes ──────────────────────────────────────────────────
  const shownAthletes = mode === "starred"
    ? allAthletes.filter((a) => a.in_live_group)
    : allAthletes.filter((a) => a.group === selGroup);

  // ── Session selector for active athlete ───────────────────────────────────
  const athleteSessions = (athleteId: string): Session[] => {
    const today = todayISO();
    const cutoff = addDays(today, -1); // include yesterday in case of late sessions
    return sessions
      .filter((s) => s.athlete_id === athleteId && s.date >= cutoff)
      .sort((a, b) => a.date < b.date ? -1 : 1);
  };

  const getActiveSession = (athleteId: string): Session | null => {
    const choices = athleteSessions(athleteId);
    if (!choices.length) return null;
    const pinned = sessionMap[athleteId];
    if (pinned) {
      const found = choices.find((s) => s.id === pinned);
      if (found) return found;
    }
    // Default: today's, else nearest upcoming, else most recent past
    const today = todayISO();
    return choices.find((s) => s.date === today)
      ?? choices.filter((s) => s.date > today)[0]
      ?? choices[choices.length - 1];
  };

  const setSessionPin = (athleteId: string, sessionId: string) => {
    const next = { ...sessionMap, [athleteId]: sessionId };
    setSessionMap(next);
    lsSetObj(LS_SES, next);
  };

  // ── Set toggle ────────────────────────────────────────────────────────────
  const handleToggleSet = async (
    sessionId: string,
    exerciseId: string,
    setIndex: number,
    currentLog: { weight: string; reps: string; done: boolean }[]
  ) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id !== sessionId ? s : {
          ...s,
          exercises: s.exercises?.map((e) =>
            e.id !== exerciseId ? e
              : { ...e, log: e.log.map((l, i) => (i === setIndex ? { ...l, done: !l.done } : l)) }
          ),
        }
      )
    );
    try {
      await toggleSetDone(exerciseId, setIndex, currentLog);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div style={s.empty}>Loading…</div>;

  const activeAthlete = shownAthletes.find((a) => a.id === activeTab) ?? shownAthletes[0];
  const activeSess = activeAthlete ? getActiveSession(activeAthlete.id) : null;
  const sessChoices = activeAthlete ? athleteSessions(activeAthlete.id) : [];
  const meta = TYPE_META[activeSess?.type ?? "strength"];

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <div style={s.header}>
        <h1 style={s.title}>Live Group</h1>
        <div style={s.headerRight}>
          {/* Mode toggle */}
          <div style={s.modeToggle}>
            <button style={{ ...s.modeBtn, ...(mode === "starred" ? s.modeBtnActive : {}) }}
              onClick={() => changeMode("starred")}>★ Starred</button>
            <button style={{ ...s.modeBtn, ...(mode === "group" ? s.modeBtnActive : {}) }}
              onClick={() => changeMode("group")}>👥 Group</button>
          </div>

          {/* Group selector (group mode only) */}
          {mode === "group" && groups.length > 0 && (
            <select
              style={s.groupSelect}
              value={selGroup}
              onChange={(e) => changeGroup(e.target.value)}
            >
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}

          <button style={s.refreshBtn} onClick={load} title="Refresh">↻</button>
        </div>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {shownAthletes.length === 0 ? (
        <div style={s.empty}>
          {mode === "starred"
            ? "No athletes starred. Open an athlete's page and tap ☆ to add them here."
            : selGroup
            ? `No athletes in group "${selGroup}".`
            : "No groups found. Add a group to athletes from their profile."}
        </div>
      ) : (
        <>
          {/* ── Athlete tabs ── */}
          <div style={s.tabBar} ref={tabBarRef}>
            {shownAthletes.map((athlete) => {
              const sess = getActiveSession(athlete.id);
              const isActive = athlete.id === (activeTab || shownAthletes[0]?.id);
              const tm = TYPE_META[sess?.type ?? "strength"];
              return (
                <button
                  key={athlete.id}
                  data-id={athlete.id}
                  style={{
                    ...s.tab,
                    ...(isActive ? { ...s.tabActive, borderBottomColor: tm.color } : {}),
                  }}
                  onClick={() => changeTab(athlete.id)}
                >
                  <span style={s.tabName}>{athlete.name.split(" ")[0]}</span>
                  {sess && (
                    <span style={{ ...s.tabDot, background: tm.color }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Active athlete panel ── */}
          {activeAthlete && (
            <div style={s.panel}>
              {/* Athlete + session row */}
              <div style={s.panelHead}>
                <div style={s.panelAthleteInfo}>
                  <div style={s.panelName}>{activeAthlete.name}</div>
                  {activeAthlete.group && <div style={s.panelGroup}>{activeAthlete.group}</div>}
                </div>

                {/* Session selector */}
                <div style={s.sesRow}>
                  {sessChoices.length > 1 ? (
                    <select
                      style={s.sesSelect}
                      value={activeSess?.id ?? ""}
                      onChange={(e) => setSessionPin(activeAthlete.id, e.target.value)}
                    >
                      {sessChoices.map((sess) => (
                        <option key={sess.id} value={sess.id}>
                          {fmtDate(sess.date)} — {sess.name}
                        </option>
                      ))}
                    </select>
                  ) : activeSess ? (
                    <div style={s.sesSingle}>
                      {fmtDate(activeSess.date)} — {activeSess.name}
                    </div>
                  ) : (
                    <div style={s.sesNone}>No upcoming sessions</div>
                  )}

                  {activeSess && (
                    <button
                      style={s.openBtn}
                      onClick={() => router.push(`/athletes/${activeAthlete.id}/sessions/${activeSess.id}`)}
                    >
                      Open session →
                    </button>
                  )}
                </div>
              </div>

              {/* Session type badge */}
              {activeSess && (
                <div style={{ ...s.typeBadge, background: meta.dim, color: meta.color }}>
                  {meta.label}
                  {activeSess.type !== "strength" && (
                    <span style={{ fontWeight: 400, marginLeft: 6, opacity: 0.8 }}>
                      — open session to use timer &amp; log
                    </span>
                  )}
                </div>
              )}

              {/* Exercise list with set dots */}
              {activeSess && activeSess.type === "strength" && (
                <div style={s.exList}>
                  {(activeSess.exercises ?? []).length === 0 && (
                    <div style={s.noEx}>No exercises in this session yet.</div>
                  )}
                  {(activeSess.exercises ?? []).map((ex, i) => {
                    const doneSets = (ex.log ?? []).filter((l) => l.done).length;
                    const totalSets = ex.log?.length ?? 0;
                    return (
                      <div key={ex.id} style={s.exRow}>
                        <span style={s.exOrder}>{ex.order || String(i + 1)}</span>
                        <span style={s.exName}>{ex.name || "—"}</span>
                        <span style={s.exPrescription}>
                          {[ex.sets ? `${ex.sets} sets` : "", ex.reps, ex.target_load]
                            .filter(Boolean).join(" · ")}
                        </span>
                        <div style={s.dots}>
                          {(ex.log ?? []).map((set, si) => (
                            <button
                              key={si}
                              title={set.weight ? `${set.weight}kg` : `Set ${si + 1}`}
                              onClick={() => handleToggleSet(activeSess.id, ex.id, si, ex.log ?? [])}
                              style={{ ...s.dot, ...(set.done ? s.dotOn : {}) }}
                            />
                          ))}
                          <span style={s.setCount}>{doneSets}/{totalSets}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!activeSess && (
                <div style={s.noEx}>
                  No session in the next 7 days.{" "}
                  <span
                    style={{ color: "var(--accent)", cursor: "pointer" }}
                    onClick={() => router.push(`/athletes/${activeAthlete.id}`)}
                  >
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

// ── Styles ────────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 860, padding: "0 0 40px" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" as const },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: 0 },
  headerRight: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const },
  modeToggle: { display: "flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" },
  modeBtn: { background: "transparent", border: "none", color: "var(--mute)", padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  modeBtnActive: { background: "var(--accent-dim)", color: "var(--accent)" },
  groupSelect: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 13 },
  refreshBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "7px 12px", fontSize: 14, cursor: "pointer" },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16 },
  empty: { color: "var(--mute)", fontSize: 14, padding: "40px 0", textAlign: "center" as const },

  // Tabs
  tabBar: { display: "flex", overflowX: "auto" as const, borderBottom: "1px solid var(--line)", marginBottom: 16, gap: 2, scrollbarWidth: "none" as const },
  tab: { background: "transparent", border: "none", borderBottom: "2px solid transparent", color: "var(--mute)", padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" as const, flexShrink: 0 },
  tabActive: { color: "var(--text)", borderBottom: "2px solid var(--accent)" },
  tabName: {},
  tabDot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 },

  // Panel
  panel: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: 20, display: "flex", flexDirection: "column" as const, gap: 14 },
  panelHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const },
  panelAthleteInfo: {},
  panelName: { fontSize: 20, fontWeight: 700, color: "var(--text)" },
  panelGroup: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  sesRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const },
  sesSelect: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 13 },
  sesSingle: { fontSize: 13, color: "var(--mute)" },
  sesNone: { fontSize: 13, color: "var(--mute)", fontStyle: "italic" as const },
  openBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  typeBadge: { fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, alignSelf: "flex-start" as const },

  // Exercises
  exList: { display: "flex", flexDirection: "column" as const, gap: 8 },
  noEx: { fontSize: 13, color: "var(--mute)", padding: "8px 0" },
  exRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--ink)", borderRadius: 8 },
  exOrder: { fontSize: 12, fontWeight: 800, color: "var(--accent)", minWidth: 24, flexShrink: 0 },
  exName: { fontSize: 14, fontWeight: 600, color: "var(--text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  exPrescription: { fontSize: 11, color: "var(--mute)", whiteSpace: "nowrap" as const, flexShrink: 0 },
  dots: { display: "flex", alignItems: "center", gap: 5, flexShrink: 0 },
  dot: { width: 18, height: 18, borderRadius: "50%", border: "1px solid var(--line)", background: "transparent", cursor: "pointer", padding: 0, flexShrink: 0 },
  dotOn: { background: "var(--good)", borderColor: "var(--good)" },
  setCount: { fontSize: 11, color: "var(--mute)", minWidth: 28 },
};
