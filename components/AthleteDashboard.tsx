"use client";

// ─────────────────────────────────────────────────────────────────────────────
// AthleteDashboard
//
// The "Dashboard" view on the athlete page, sitting next to Month / Week.
// A read-at-a-glance summary for one athlete: a strip of key metrics
// across the top, then three columns — recent messages, the athlete's
// own session notes, and recent check-ins.
//
// Sessions are passed in (the athlete page already loads the full
// history); messages, check-ins and PBs are fetched here.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { listAthleteMessages } from "@/lib/data/messages";
import { listAthleteCheckIns } from "@/lib/data/checkins";
import { listAthletePBs, type PersonalBest } from "@/lib/data/personal-bests";
import { flaggedConditions, CHECKIN_QUESTIONS } from "@/lib/checkin";
import type { CheckInRules } from "@/lib/checkin";
import type { CheckIn, DirectMessage, Session } from "@/types";

interface Props {
  athleteId: string;
  athleteName: string;
  sessions: Session[];
  lastTestDate: string;
  retestWeeks: number | "";
  checkinEnabled: boolean;
  checkinRules?: CheckInRules;
  onOpenMessages: () => void;
  onOpenSession: (sessionId: string) => void;
}

const DAY_MS = 86400000;

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T12:00:00Z").getTime();
  const b = new Date(to + "T12:00:00Z").getTime();
  return Math.round((b - a) / DAY_MS);
}
function addDays(iso: string, n: number): string {
  return new Date(new Date(iso + "T12:00:00Z").getTime() + n * DAY_MS).toISOString().slice(0, 10);
}
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function sessionSets(s: Session): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const ex of s.exercises ?? []) {
    const log = ex.log ?? [];
    total += log.length;
    done += log.filter((l) => l.done).length;
  }
  return { done, total };
}

const SCORE_LABEL: Record<string, string> = { energy: "Energy", sleep: "Sleep", soreness: "Sore", volume: "Vol" };

const SCORE_COLOR = (key: string, v: number): string => {
  // soreness/volume: a high score is the concerning end; energy/sleep: a low score is.
  const highIsBad = key === "soreness" || key === "volume";
  const bad = highIsBad ? v >= 4 : v <= 2;
  if (bad) return "#E53935";
  if (v === 3) return "#FB8C00";
  return "#2E9E5B";
};

export default function AthleteDashboard({
  athleteId, athleteName, sessions, lastTestDate, retestWeeks,
  checkinEnabled, checkinRules, onOpenMessages, onOpenSession,
}: Props) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [pbs, setPbs] = useState<PersonalBest[]>([]);

  useEffect(() => {
    let alive = true;
    listAthleteMessages(athleteId, 8).then((m) => alive && setMessages(m)).catch(() => {});
    listAthletePBs(athleteId).then((p) => alive && setPbs(p)).catch(() => {});
    if (checkinEnabled) {
      listAthleteCheckIns(athleteId, 12).then((c) => alive && setCheckIns(c)).catch(() => {});
    }
    return () => { alive = false; };
  }, [athleteId, checkinEnabled]);

  const metrics = useMemo(() => {
    const today = isoToday();
    const now = new Date();
    const mondayOffset = (now.getDay() + 6) % 7;
    const weekStart = addDays(today, -mondayOffset);
    const weekEnd = addDays(weekStart, 6);

    const real = sessions.filter((s) => s.session_source !== "library");

    const weekSessions = real.filter((s) => s.date >= weekStart && s.date <= weekEnd);
    const weekDone = weekSessions.filter((s) => sessionSets(s).done > 0).length;

    let d7done = 0, d7total = 0;
    const cutoff7 = addDays(today, -6);
    for (const s of real) {
      if (s.date < cutoff7 || s.date > today) continue;
      const { done, total } = sessionSets(s);
      d7done += done; d7total += total;
    }
    const completion = d7total > 0 ? Math.round((d7done / d7total) * 100) : null;

    const trained = real
      .filter((s) => s.date <= today && sessionSets(s).done > 0)
      .map((s) => s.date)
      .sort();
    const lastTrained = trained.length ? trained[trained.length - 1] : null;

    const cutoff14 = addDays(today, -13);
    const rpes = real
      .filter((s) => s.date >= cutoff14 && s.date <= today && s.rpe != null)
      .map((s) => s.rpe as number);
    const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;

    const pbCount = pbs.filter((p) => {
      const dd = daysBetween(p.date, today);
      return dd >= 0 && dd <= 30;
    }).length;

    let nextTest: { label: string; danger: boolean } | null = null;
    if (lastTestDate && typeof retestWeeks === "number" && retestWeeks > 0) {
      const due = addDays(lastTestDate, retestWeeks * 7);
      const n = daysBetween(today, due);
      if (n < 0) nextTest = { label: `${-n}d overdue`, danger: true };
      else if (n === 0) nextTest = { label: "due today", danger: true };
      else nextTest = { label: `in ${n}d`, danger: n <= 14 };
    }

    return {
      week: `${weekDone}/${weekSessions.length}`,
      completion,
      lastTrained: lastTrained ? (lastTrained === today ? "Today" : `${daysBetween(lastTrained, today)}d ago`) : "—",
      lastTrainedStale: lastTrained ? daysBetween(lastTrained, today) >= 4 : true,
      avgRpe: avgRpe != null ? avgRpe.toFixed(1) : "—",
      pbCount,
      nextTest,
    };
  }, [sessions, pbs, lastTestDate, retestWeeks]);

  const sessionNotes = useMemo(
    () =>
      sessions
        .filter((s) => (s.athlete_notes ?? "").trim().length > 0)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 8),
    [sessions]
  );

  return (
    <div style={st.wrap}>
      {/* ── Key metrics ─────────────────────────────────────────────── */}
      <div style={st.metricStrip}>
        <Metric label="This week" value={metrics.week} sub="sessions done" />
        <Metric label="Completion" value={metrics.completion != null ? `${metrics.completion}%` : "—"} sub="last 7 days" danger={metrics.completion != null && metrics.completion < 70} />
        <Metric label="Last trained" value={metrics.lastTrained} danger={metrics.lastTrainedStale} />
        <Metric label="Avg RPE" value={metrics.avgRpe} sub="last 14 days" />
        <Metric label="New PBs" value={String(metrics.pbCount)} sub="last 30 days" good={metrics.pbCount > 0} />
        {metrics.nextTest && <Metric label="Next test" value={metrics.nextTest.label} danger={metrics.nextTest.danger} />}
      </div>

      {/* ── Three columns ──────────────────────────────────────────── */}
      <div style={st.columns}>
        {/* Messages */}
        <div style={st.col}>
          <div style={st.colHead}>
            <span style={st.colTitle}>💬 Messages</span>
            <button style={st.colAction} onClick={onOpenMessages}>Open thread →</button>
          </div>
          <div style={st.list}>
            {messages.length === 0 && <div style={st.empty}>No messages with {athleteName} yet.</div>}
            {messages.map((m) => {
              const fromAthlete = m.sender_type === "athlete";
              return (
                <button key={m.id} style={st.row} onClick={onOpenMessages}>
                  <div style={st.rowMeta}>
                    <span style={{ color: fromAthlete ? "var(--accent)" : "var(--mute)", fontWeight: 700 }}>
                      {fromAthlete ? athleteName.split(" ")[0] : "You"}
                    </span>
                    <span>· {relTime(m.created_at)}</span>
                  </div>
                  <div style={st.rowText}>{m.audio_path ? "🎤 Voice note" : m.body}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Session notes */}
        <div style={st.col}>
          <div style={st.colHead}>
            <span style={st.colTitle}>📝 Session notes</span>
            {sessionNotes.length > 0 && <span style={st.colCount}>{sessionNotes.length}</span>}
          </div>
          <div style={st.list}>
            {sessionNotes.length === 0 && <div style={st.empty}>No athlete notes on recent sessions.</div>}
            {sessionNotes.map((s) => (
              <button key={s.id} style={st.row} onClick={() => onOpenSession(s.id)}>
                <div style={st.rowMeta}>
                  <span style={{ fontWeight: 700, color: "var(--text)" }}>{s.name}</span>
                  <span>· {fmtDate(s.date)}</span>
                </div>
                <div style={st.rowText}>{s.athlete_notes}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Check-ins */}
        <div style={st.col}>
          <div style={st.colHead}>
            <span style={st.colTitle}>✅ Check-ins</span>
            {checkIns.length > 0 && <span style={st.colCount}>{checkIns.length}</span>}
          </div>
          <div style={st.list}>
            {!checkinEnabled && <div style={st.empty}>Check-ins are turned off. Enable them in Settings.</div>}
            {checkinEnabled && checkIns.length === 0 && <div style={st.empty}>No check-ins logged yet.</div>}
            {checkinEnabled && checkIns.map((c) => {
              const flags = flaggedConditions(
                { energy: c.energy, sleep: c.sleep, soreness: c.soreness, volume: c.volume },
                checkinRules
              );
              return (
                <div key={c.id} style={st.checkRow}>
                  <div style={st.rowMeta}>
                    <span style={{ fontWeight: 700, color: "var(--text)" }}>{fmtDate(c.date)}</span>
                    <span>· {relTime(c.created_at)}</span>
                  </div>
                  <div style={st.scoreRow}>
                    {CHECKIN_QUESTIONS.map((q) => {
                      const v = c[q.key as keyof CheckIn] as number;
                      return (
                        <span key={q.key} style={{ ...st.scorePill, borderColor: SCORE_COLOR(q.key, v), color: SCORE_COLOR(q.key, v) }}>
                          {SCORE_LABEL[q.key] ?? q.key} {v}
                        </span>
                      );
                    })}
                  </div>
                  {flags.length > 0 && (
                    <div style={st.flagRow}>
                      {flags.map((f) => <span key={f} style={st.flag}>{f}</span>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, danger, good }: { label: string; value: string; sub?: string; danger?: boolean; good?: boolean }) {
  return (
    <div style={st.metric}>
      <div style={st.metricLabel}>{label}</div>
      <div style={{ ...st.metricValue, color: danger ? "#E53935" : good ? "#2E9E5B" : "var(--text)" }}>{value}</div>
      {sub && <div style={st.metricSub}>{sub}</div>}
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 16 },

  metricStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 8,
  },
  metric: {
    background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10,
    padding: "10px 12px", minWidth: 0,
  },
  metricLabel: { fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.04em" },
  metricValue: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, lineHeight: 1.1, marginTop: 2 },
  metricSub: { fontSize: 10, color: "var(--mute)", marginTop: 1 },

  columns: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12,
    alignItems: "start",
  },
  col: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", minWidth: 0 },
  colHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  colTitle: { fontSize: 13, fontWeight: 700, color: "var(--text)", flex: 1 },
  colCount: { fontSize: 11, fontWeight: 700, color: "var(--text)", background: "var(--panel2)", borderRadius: 5, padding: "2px 7px" },
  colAction: { background: "transparent", border: "none", color: "var(--accent)", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 },

  list: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflowY: "auto" },
  empty: { fontSize: 12, color: "var(--mute)", fontStyle: "italic", padding: "8px 2px" },
  row: {
    display: "block", width: "100%", textAlign: "left", cursor: "pointer",
    background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px",
  },
  rowMeta: { fontSize: 10.5, fontWeight: 600, color: "var(--mute)", display: "flex", gap: 4, flexWrap: "wrap" },
  rowText: { fontSize: 12.5, color: "var(--text)", marginTop: 3, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" },

  checkRow: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px" },
  scoreRow: { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 },
  scorePill: { fontSize: 10, fontWeight: 700, border: "1px solid", borderRadius: 5, padding: "1px 5px" },
  flagRow: { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 },
  flag: { fontSize: 10, fontWeight: 700, color: "#E53935", background: "#3a1a1a", borderRadius: 4, padding: "1px 6px" },
};
