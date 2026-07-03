"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { listLiveGroupAthletes } from "@/lib/data/athletes";
import { listSessionsForAthletes } from "@/lib/data/sessions";
import { createClient } from "@/lib/supabase-browser";
import type { Athlete, Session, SessionType } from "@/types";

const TYPE_META: Record<SessionType, { color: string }> = {
  strength:    { color: "#3B8BEB" },
  hyrox:       { color: "#B388FF" },
  cardio:      { color: "#4DC3FF" },
  power_speed: { color: "#A855F7" },
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
  if (iso === today) return "Today";
  if (iso === addDays(today, 1)) return "Tomorrow";
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function lsGet(k: string): string { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } }
function lsSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} }
function lsGetObj(k: string): Record<string, string> { try { return JSON.parse(localStorage.getItem(k) ?? "{}"); } catch { return {}; } }
function lsSetObj(k: string, v: Record<string, string>) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

const LS_MODE  = "liveGroup_mode";
const LS_GROUP = "liveGroup_group";
const LS_SES   = "liveGroup_session";

export default function LiveGroupPage() {
  const router = useRouter();

  const [mode, setMode]         = useState<"starred" | "group">("starred");
  const [allAthletes, setAll]   = useState<Athlete[]>([]);
  const [groups, setGroups]     = useState<string[]>([]);
  const [selGroup, setSelGroup] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  // sessionMap: athleteId → pinned sessionId (remembered across navigation)
  const [sessionMap, setSessionMap] = useState<Record<string, string>>({});

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

      setMode(savedMode);
      setSelGroup(savedGroup);
      setSessionMap(savedMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load live group");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeMode = (m: "starred" | "group") => {
    setMode(m); lsSet(LS_MODE, m);
    if (m === "group" && !selGroup && groups[0]) {
      setSelGroup(groups[0]); lsSet(LS_GROUP, groups[0]);
    }
  };

  const changeGroup = (g: string) => {
    setSelGroup(g); lsSet(LS_GROUP, g);
  };

  const setPin = (athleteId: string, sessionId: string) => {
    const next = { ...sessionMap, [athleteId]: sessionId };
    setSessionMap(next); lsSetObj(LS_SES, next);
  };

  // ── Derive shown athletes ─────────────────────────────────────────────────
  const shownAthletes = mode === "starred"
    ? allAthletes.filter((a) => a.in_live_group)
    : allAthletes.filter((a) => a.group === (selGroup || groups[0] || ""));

  // ── Session selection per athlete ─────────────────────────────────────────
  const getChoices = (athleteId: string): Session[] => {
    const cutoff = addDays(todayISO(), -1);
    return sessions
      .filter((s) => s.athlete_id === athleteId && s.date >= cutoff)
      .sort((a, b) => a.date < b.date ? -1 : 1);
  };

  const getPicked = (athleteId: string): Session | null => {
    const choices = getChoices(athleteId);
    if (!choices.length) return null;
    const pinned = sessionMap[athleteId];
    if (pinned) { const f = choices.find((s) => s.id === pinned); if (f) return f; }
    const today = todayISO();
    return choices.find((s) => s.date === today)
      ?? choices.find((s) => s.date > today)
      ?? choices[choices.length - 1];
  };

  // ── Navigate to the picked session (or profile if no session) ─────────────
  const openAthlete = (athlete: Athlete) => {
    const sess = getPicked(athlete.id);
    if (sess) {
      router.push(`/athletes/${athlete.id}/sessions/${sess.id}`);
    } else {
      router.push(`/athletes/${athlete.id}`);
    }
  };

  if (loading) return <div style={s.empty}>Loading…</div>;

  return (
    <div style={s.page}>
      {/* ── Header ── */}
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
          <button style={s.refreshBtn} onClick={load}>↻</button>
        </div>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {shownAthletes.length === 0 ? (
        <div style={s.empty}>
          {mode === "starred"
            ? "No athletes starred. Open an athlete and tap ☆ to add them."
            : `No athletes in group "${selGroup || groups[0]}".`}
        </div>
      ) : (
        <div style={s.grid}>
          {shownAthletes.map((athlete) => {
            const choices  = getChoices(athlete.id);
            const picked   = getPicked(athlete.id);
            const meta     = TYPE_META[picked?.type ?? "strength"];
            const done     = (picked?.exercises ?? []).reduce((n, e) => n + (e.log ?? []).filter((l) => l.done).length, 0);
            const total    = (picked?.exercises ?? []).reduce((n, e) => n + (e.log ?? []).length, 0);
            const allDone  = total > 0 && done === total;

            return (
              <div key={athlete.id} style={s.card}>
                {/* ── Top: name + completion ── */}
                <div style={s.cardTop}>
                  <div style={s.avatar}>{athlete.name.slice(0, 1).toUpperCase()}</div>
                  <div style={s.nameBlock}>
                    <div style={s.athleteName}>{athlete.name}</div>
                    {athlete.group && <div style={s.groupLabel}>{athlete.group}</div>}
                  </div>
                  {total > 0 && (
                    <div style={{ ...s.completionBadge, ...(allDone ? s.completionDone : {}) }}>
                      {done}/{total}
                    </div>
                  )}
                </div>

                {/* ── Session picker ── */}
                {choices.length > 1 ? (
                  <select
                    style={s.sesSelect}
                    value={picked?.id ?? ""}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { e.stopPropagation(); setPin(athlete.id, e.target.value); }}
                  >
                    {choices.map((sess) => (
                      <option key={sess.id} value={sess.id}>
                        {fmtDate(sess.date)} — {sess.name}
                      </option>
                    ))}
                  </select>
                ) : picked ? (
                  <div style={s.sesLabel}>
                    <span style={{ ...s.sesTypeDot, background: meta.color }} />
                    {fmtDate(picked.date)} · {picked.name}
                  </div>
                ) : (
                  <div style={s.noSession}>No upcoming sessions</div>
                )}

                {/* ── Exercise dots ── */}
                {picked && (picked.exercises ?? []).length > 0 && (
                  <div style={s.exDots}>
                    {(picked.exercises ?? []).map((ex) => {
                      const exDone  = (ex.log ?? []).filter((l) => l.done).length;
                      const exTotal = ex.log?.length ?? 0;
                      return (
                        <div key={ex.id} style={s.exDotRow} title={ex.name}>
                          <span style={s.exDotName}>{ex.name}</span>
                          <div style={s.dotsRow}>
                            {(ex.log ?? []).map((set, si) => (
                              <span key={si} style={{ ...s.dot, ...(set.done ? s.dotOn : {}) }} />
                            ))}
                            <span style={s.dotCount}>{exDone}/{exTotal}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Open button ── */}
                <button
                  style={{ ...s.openBtn, ...(picked ? {} : s.openBtnGhost) }}
                  onClick={() => openAthlete(athlete)}
                >
                  {picked ? `Open session →` : `Open profile →`}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:           { maxWidth: 1100, padding: "0 0 40px" },
  header:         { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 24, flexWrap: "wrap" as const },
  title:          { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: 0 },
  headerRight:    { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const },
  modeToggle:     { display: "flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" },
  modeBtn:        { background: "transparent", border: "none", color: "var(--mute)", padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  modeBtnActive:  { background: "var(--accent-dim)", color: "var(--accent)" },
  groupSelect:    { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 13 },
  refreshBtn:     { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "7px 12px", fontSize: 14, cursor: "pointer" },
  errorBox:       { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16 },
  empty:          { color: "var(--mute)", fontSize: 14, padding: "40px 0", textAlign: "center" as const },

  grid:           { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 },
  card:           { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column" as const, gap: 10 },

  cardTop:        { display: "flex", alignItems: "center", gap: 10 },
  avatar:         { width: 36, height: 36, borderRadius: "50%", background: "var(--accent-dim)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, flexShrink: 0 },
  nameBlock:      { flex: 1, minWidth: 0 },
  athleteName:    { fontSize: 15, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  groupLabel:     { fontSize: 11, color: "var(--mute)", marginTop: 1 },
  completionBadge:{ fontSize: 11, fontWeight: 700, color: "var(--mute)", background: "var(--ink)", borderRadius: 6, padding: "3px 7px", flexShrink: 0 },
  completionDone: { color: "var(--good)", background: "var(--good-dim)" },

  sesSelect:      { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "6px 8px", fontSize: 12, width: "100%" },
  sesLabel:       { fontSize: 12, color: "var(--mute)", display: "flex", alignItems: "center", gap: 6 },
  sesTypeDot:     { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  noSession:      { fontSize: 12, color: "var(--mute)", fontStyle: "italic" as const },

  exDots:         { display: "flex", flexDirection: "column" as const, gap: 5, borderTop: "1px solid var(--line)", paddingTop: 8 },
  exDotRow:       { display: "flex", alignItems: "center", gap: 6 },
  exDotName:      { fontSize: 11, color: "var(--mute)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  dotsRow:        { display: "flex", alignItems: "center", gap: 3, flexShrink: 0 },
  dot:            { width: 12, height: 12, borderRadius: "50%", border: "1px solid var(--line)", background: "transparent", display: "inline-block" },
  dotOn:          { background: "var(--good)", borderColor: "var(--good)" },
  dotCount:       { fontSize: 10, color: "var(--mute)", marginLeft: 2, minWidth: 20 },

  openBtn:        { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "9px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", width: "100%", textAlign: "center" as const, marginTop: "auto" },
  openBtnGhost:   { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)" },
};
