"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listAthletes } from "@/lib/data/athletes";
import {
  listAllSessionDates,
  getWeekCompletionData,
  listUnacknowledgedSessionNotes,
  acknowledgeSessionNote,
  type SessionNoteAlert,
} from "@/lib/data/sessions";
import { programmeStatus, addDaysISO, type ProgrammeStatus } from "@/lib/date-utils";
import { getOrgSettings } from "@/lib/data/settings";
import { listRecentOrgPBs, formatPBValue, type PersonalBest } from "@/lib/data/personal-bests";
import type { Athlete } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Row {
  athlete: Athlete;
  status: ProgrammeStatus;
}

interface WeekAlert {
  athlete: Athlete;
  completionPct: number | null; // null = no sessions this week
  sessionCount: number;
}

interface TestAlert {
  athlete: Athlete;
  nextTestDate: string;
  daysUntilTest: number; // negative = overdue
}

interface ReportDue {
  athlete: Athlete;
  lastReportDate: string | null;
  daysOverdue: number;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function thisWeekRange(): { start: string; end: string; label: string } {
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 1=Mon…
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const label = monday.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    " – " + sunday.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return { start: fmt(monday), end: fmt(sunday), label };
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T12:00:00Z");
  const b = new Date(to + "T12:00:00Z");
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();

  // Programme expiry (existing)
  const [rows, setRows] = useState<Row[]>([]);

  // This week panels (new)
  const [notTrained, setNotTrained] = useState<WeekAlert[]>([]);
  const [lowCompletion, setLowCompletion] = useState<WeekAlert[]>([]);
  const [testsDue, setTestsDue] = useState<TestAlert[]>([]);
  const [reportsDue, setReportsDue] = useState<ReportDue[]>([]);
  const [recentPBs, setRecentPBs] = useState<PersonalBest[]>([]);
  const [sessionNotes, setSessionNotes] = useState<SessionNoteAlert[]>([]);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [weekLabel, setWeekLabel] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const week = thisWeekRange();
        setWeekLabel(week.label);

        const [athletes, sessionDates, weekData] = await Promise.all([
          listAthletes(),
          listAllSessionDates(),
          getWeekCompletionData(week.start, week.end),
        ]);

        // ── Programme expiry ─────────────────────────────────────────────────
        const computed = athletes.map((athlete) => {
          const dates = sessionDates
            .filter((s) => s.athlete_id === athlete.id)
            .map((s) => s.date);
          return { athlete, status: programmeStatus(dates) };
        });
        computed.sort((a, b) => {
          if (a.status.daysLeft == null && b.status.daysLeft == null)
            return a.athlete.name.localeCompare(b.athlete.name);
          if (a.status.daysLeft == null) return 1;
          if (b.status.daysLeft == null) return -1;
          return a.status.daysLeft - b.status.daysLeft;
        });
        setRows(computed);

        // ── This week: group session data by athlete ──────────────────────────
        const byAthlete = new Map<string, { doneSets: number; totalSets: number; sessionCount: number }>();
        for (const row of weekData) {
          const existing = byAthlete.get(row.athlete_id) ?? { doneSets: 0, totalSets: 0, sessionCount: 0 };
          byAthlete.set(row.athlete_id, {
            doneSets: existing.doneSets + row.doneSets,
            totalSets: existing.totalSets + row.totalSets,
            sessionCount: existing.sessionCount + 1,
          });
        }

        const notTrainedList: WeekAlert[] = [];
        const lowCompletionList: WeekAlert[] = [];

        for (const athlete of athletes) {
          const data = byAthlete.get(athlete.id);
          if (!data) {
            // No sessions at all this week
            notTrainedList.push({ athlete, completionPct: null, sessionCount: 0 });
          } else {
            const pct = data.totalSets > 0
              ? Math.round((data.doneSets / data.totalSets) * 100)
              : null;
            if (pct !== null && pct < 70) {
              lowCompletionList.push({ athlete, completionPct: pct, sessionCount: data.sessionCount });
            }
          }
        }

        setNotTrained(notTrainedList.sort((a, b) => a.athlete.name.localeCompare(b.athlete.name)));
        setLowCompletion(lowCompletionList.sort((a, b) => (a.completionPct ?? 0) - (b.completionPct ?? 0)));

        // ── Test weeks due ────────────────────────────────────────────────────
        const today = todayISO();
        const testAlerts: TestAlert[] = [];

        for (const athlete of athletes) {
          const a = athlete as any;
          if (!a.last_test_date || !a.retest_weeks) continue;
          const nextTestDate = addDaysISO(a.last_test_date, a.retest_weeks * 7);
          const daysUntilTest = daysBetween(today, nextTestDate);
          // Flag if due within 14 days OR overdue
          if (daysUntilTest <= 14) {
            testAlerts.push({ athlete, nextTestDate, daysUntilTest });
          }
        }

        setTestsDue(testAlerts.sort((a, b) => a.daysUntilTest - b.daysUntilTest));

        // ── Reports due ───────────────────────────────────────────────────────
        const orgSettings = await getOrgSettings().catch(() => null);
        if (orgSettings) {
          const freq = orgSettings.report_frequency_weeks;
          const freqDays = freq === "monthly" ? 30 : (freq as number) * 7;
          const reportAlerts: ReportDue[] = [];

          for (const athlete of athletes) {
            const lastReport = (athlete as any).last_report_date as string | null;
            const daysSince = lastReport
              ? daysBetween(lastReport, today)
              : daysBetween(athlete.created_at?.slice(0, 10) ?? today, today);
            if (daysSince >= freqDays) {
              reportAlerts.push({ athlete, lastReportDate: lastReport, daysOverdue: daysSince - freqDays });
            }
          }
          setReportsDue(reportAlerts.sort((a, b) => b.daysOverdue - a.daysOverdue));
        }

        // ── Recent PBs (last 7 days) ──────────────────────────────────────────
        const pbs = await listRecentOrgPBs(7).catch(() => [] as PersonalBest[]);
        setRecentPBs(pbs);

        // ── Unread session comments ───────────────────────────────────────────
        const notes = await listUnacknowledgedSessionNotes().catch(() => [] as SessionNoteAlert[]);
        setSessionNotes(notes);

      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load dashboard");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleDismissNote = async (sessionId: string) => {
    setDismissingId(sessionId);
    const prev = sessionNotes;
    setSessionNotes((cur) => cur.filter((n) => n.sessionId !== sessionId)); // optimistic
    try {
      await acknowledgeSessionNote(sessionId);
    } catch {
      setSessionNotes(prev); // failed — put it back
    } finally {
      setDismissingId(null);
    }
  };

  if (loading) return <div style={st.empty}>Loading…</div>;
  if (error) return <div style={st.errorBox}>{error}</div>;

  const needsAttention = rows.filter((r) => r.status.daysLeft == null || r.status.daysLeft <= 7);
  const onTrack = rows.filter((r) => r.status.daysLeft != null && r.status.daysLeft > 7);

  return (
    <div style={st.page}>
      <h1 style={st.title}>Dashboard</h1>

      {/* ── This week ─────────────────────────────────────────────────────── */}
      <div style={st.weekCard}>
        <div style={st.weekHeader}>
          <span style={st.weekTitle}>This week</span>
          <span style={st.weekLabel}>{weekLabel}</span>
        </div>

        <div style={st.panels}>

          {/* Session comments — athlete notes the coach hasn't dismissed yet */}
          {sessionNotes.length > 0 && (
            <div style={st.panel}>
              <div style={st.panelHead}>
                <span style={st.panelDot({ color: "var(--accent)" })} />
                <span style={st.panelTitle}>Session comments</span>
                <span style={st.panelCount(sessionNotes.length)}>{sessionNotes.length}</span>
              </div>
              <div style={st.noteList}>
                {sessionNotes.map((n) => (
                  <div key={n.sessionId} style={st.noteRow}>
                    <button
                      style={st.noteMain}
                      onClick={() => router.push(`/athletes/${n.athleteId}/sessions/${n.sessionId}`)}
                    >
                      <div style={st.noteMeta}>
                        {n.athleteName} · {n.sessionName} · {n.date}
                      </div>
                      <div style={st.noteText}>{n.note}</div>
                    </button>
                    <button
                      style={st.noteDismissBtn}
                      onClick={() => handleDismissNote(n.sessionId)}
                      disabled={dismissingId === n.sessionId}
                      title="Mark as read — no action needed"
                    >
                      {dismissingId === n.sessionId ? "…" : "✓"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Not trained */}
          <div style={st.panel}>
            <div style={st.panelHead}>
              <span style={st.panelDot({ color: notTrained.length ? "#FF6B6B" : "var(--good)" })} />
              <span style={st.panelTitle}>Not trained</span>
              <span style={st.panelCount(notTrained.length)}>{notTrained.length}</span>
            </div>
            {notTrained.length === 0 ? (
              <div style={st.panelEmpty}>All athletes have trained ✓</div>
            ) : (
              <div style={st.athleteList}>
                {notTrained.map((w) => (
                  <button key={w.athlete.id} style={st.athleteChip}
                    onClick={() => router.push(`/athletes/${w.athlete.id}`)}>
                    {w.athlete.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Low completion */}
          <div style={st.panel}>
            <div style={st.panelHead}>
              <span style={st.panelDot({ color: lowCompletion.length ? "var(--warn)" : "var(--good)" })} />
              <span style={st.panelTitle}>Below 70% completion</span>
              <span style={st.panelCount(lowCompletion.length)}>{lowCompletion.length}</span>
            </div>
            {lowCompletion.length === 0 ? (
              <div style={st.panelEmpty}>All athletes above 70% ✓</div>
            ) : (
              <div style={st.athleteList}>
                {lowCompletion.map((w) => (
                  <button key={w.athlete.id} style={st.athleteChip}
                    onClick={() => router.push(`/athletes/${w.athlete.id}`)}>
                    {w.athlete.name}
                    <span style={st.pctBadge(w.completionPct ?? 0)}>{w.completionPct}%</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Test week due */}
          <div style={st.panel}>
            <div style={st.panelHead}>
              <span style={st.panelDot({ color: testsDue.length ? "#a78bfa" : "var(--good)" })} />
              <span style={st.panelTitle}>Test week due</span>
              <span style={st.panelCount(testsDue.length)}>{testsDue.length}</span>
            </div>
            {testsDue.length === 0 ? (
              <div style={st.panelEmpty}>No tests due in the next 2 weeks</div>
            ) : (
              <div style={st.athleteList}>
                {testsDue.map((t) => (
                  <button key={t.athlete.id} style={st.athleteChip}
                    onClick={() => router.push(`/athletes/${t.athlete.id}`)}>
                    {t.athlete.name}
                    <span style={st.testBadge(t.daysUntilTest)}>
                      {t.daysUntilTest < 0
                        ? `${Math.abs(t.daysUntilTest)}d overdue`
                        : t.daysUntilTest === 0
                        ? "due today"
                        : `in ${t.daysUntilTest}d`}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {rows.filter((r) => !(r.athlete as any).last_test_date).length > 0 && (
              <div style={st.testHint}>
                Set test dates on athlete pages to track testing schedules
              </div>
            )}
          </div>

          {/* Reports due */}
          <div style={st.panel}>
            <div style={st.panelHead}>
              <span style={st.panelDot({ color: reportsDue.length ? "var(--warn)" : "var(--good)" })} />
              <span style={st.panelTitle}>Reports due</span>
              <span style={st.panelCount(reportsDue.length)}>{reportsDue.length}</span>
            </div>
            {reportsDue.length === 0 ? (
              <div style={st.panelEmpty}>All reports up to date ✓</div>
            ) : (
              <div style={st.athleteList}>
                {reportsDue.map((r) => (
                  <button key={r.athlete.id} style={st.athleteChip}
                    onClick={() => router.push(`/athletes/${r.athlete.id}`)}>
                    {r.athlete.name}
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--warn)", background: "#3a2c10", borderRadius: 4, padding: "1px 5px" }}>
                      {r.lastReportDate ? `${r.daysOverdue}d overdue` : "no report yet"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recent PBs */}
          {recentPBs.length > 0 && (
            <div style={st.panel}>
              <div style={st.panelHead}>
                <span style={{ fontSize: 14, marginRight: -4 }}>🏆</span>
                <span style={st.panelTitle}>Recent PBs</span>
                <span style={st.panelCount(recentPBs.length)}>{recentPBs.length}</span>
              </div>
              <div style={st.athleteList}>
                {recentPBs.slice(0, 8).map((pb) => (
                  <button key={pb.id} style={st.athleteChip} onClick={() => router.push("/community")}>
                    <span style={{ fontWeight: 400, color: "var(--mute)" }}>{(pb as any).athlete?.name}</span>
                    <span>· {pb.exercise_name}</span>
                    <span style={{ color: "var(--accent)", fontWeight: 700 }}>{formatPBValue(pb)}</span>
                  </button>
                ))}
              </div>
              <button style={st.viewPBsBtn} onClick={() => router.push("/community")}>
                React &amp; comment on PBs →
              </button>
            </div>
          )}

        </div>
      </div>

      {/* ── Programme expiry (existing) ──────────────────────────────────── */}
      <h2 style={st.sectionHeading}>Programme expiry</h2>
      <p style={st.subtitle}>Athletes whose loaded programme is running out soon, or has already run out.</p>

      {!rows.length && <div style={st.empty}>Add an athlete to start tracking programme expiry.</div>}

      {needsAttention.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={st.sectionLabelWarn}>Needs attention ({needsAttention.length})</div>
          <div style={st.list}>
            {needsAttention.map((r) => (
              <AthleteRow key={r.athlete.id} row={r} router={router} />
            ))}
          </div>
        </div>
      )}

      {onTrack.length > 0 && (
        <div>
          <div style={st.sectionLabel}>On track ({onTrack.length})</div>
          <div style={st.list}>
            {onTrack.map((r) => (
              <AthleteRow key={r.athlete.id} row={r} router={router} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AthleteRow (unchanged from existing) ──────────────────────────────────────

function statusOf(daysLeft: number | null) {
  if (daysLeft == null) return { label: "No sessions", color: "var(--mute)", bg: "var(--panel2)" };
  if (daysLeft < 0) return { label: `Expired ${Math.abs(daysLeft)}d ago`, color: "#FF6B6B", bg: "#3a1a1a" };
  if (daysLeft === 0) return { label: "Last day today", color: "var(--warn)", bg: "#3a2c10" };
  if (daysLeft <= 7) return { label: `${daysLeft}d left`, color: "var(--warn)", bg: "#3a2c10" };
  return { label: `${daysLeft}d left`, color: "var(--good)", bg: "#16332a" };
}

function AthleteRow({ row, router }: { row: Row; router: ReturnType<typeof useRouter> }) {
  const s = statusOf(row.status.daysLeft);
  return (
    <button
      style={{ ...st.row, borderColor: `${s.color}33`, background: s.bg }}
      onClick={() => router.push(`/athletes/${row.athlete.id}`)}
    >
      <div style={{ minWidth: 0, textAlign: "left" }}>
        <div style={st.rowName}>{row.athlete.name}</div>
        <div style={st.rowMeta}>
          {row.status.lastDate ? `Last session: ${row.status.lastDate}` : "No sessions scheduled"}
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: s.color, whiteSpace: "nowrap" }}>
        {s.label}
      </span>
    </button>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st: Record<string, any> = {
  page: { maxWidth: 700 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: "0 0 20px" },
  sectionHeading: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, margin: "28px 0 4px", color: "var(--text)" },
  subtitle: { color: "var(--mute)", fontSize: 13, margin: "0 0 16px" },
  empty: { color: "var(--mute)", fontSize: 14, padding: "40px 0", textAlign: "center" },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },

  // This week card
  weekCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: 18, marginBottom: 28 },
  weekHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  weekTitle: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--text)" },
  weekLabel: { fontSize: 12, color: "var(--mute)" },
  panels: { display: "flex", flexDirection: "column", gap: 12 },

  panel: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" },
  panelHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  panelDot: ({ color }: { color: string }): React.CSSProperties => ({
    width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0,
  }),
  panelTitle: { fontSize: 13, fontWeight: 700, color: "var(--text)", flex: 1 },
  panelCount: (n: number): React.CSSProperties => ({
    fontSize: 11, fontWeight: 700, color: n > 0 ? "var(--text)" : "var(--mute)",
    background: "var(--panel2)", borderRadius: 5, padding: "2px 7px",
  }),
  panelEmpty: { fontSize: 12, color: "var(--mute)", fontStyle: "italic" },

  noteList: { display: "flex", flexDirection: "column", gap: 6 },
  noteRow: {
    display: "flex", alignItems: "flex-start", gap: 8,
    background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 8px 8px 12px",
  },
  noteMain: { flex: 1, minWidth: 0, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", padding: 0 },
  noteMeta: { fontSize: 11, fontWeight: 700, color: "var(--mute)" },
  noteText: { fontSize: 13, color: "var(--text)", marginTop: 2, lineHeight: 1.4, whiteSpace: "pre-wrap" },
  noteDismissBtn: {
    flexShrink: 0, background: "var(--good-dim)", border: "1px solid var(--good)", color: "var(--good)",
    borderRadius: 6, width: 28, height: 28, fontSize: 13, fontWeight: 700, cursor: "pointer",
  },

  athleteList: { display: "flex", flexWrap: "wrap", gap: 6 },
  athleteChip: {
    display: "flex", alignItems: "center", gap: 6,
    background: "var(--panel)", border: "1px solid var(--line)",
    color: "var(--text)", borderRadius: 7, padding: "5px 10px",
    fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
  pctBadge: (pct: number): React.CSSProperties => ({
    fontSize: 10, fontWeight: 700, color: pct < 50 ? "#FF6B6B" : "var(--warn)",
    background: pct < 50 ? "#3a1a1a" : "#3a2c10", borderRadius: 4, padding: "1px 5px",
  }),
  testBadge: (days: number): React.CSSProperties => ({
    fontSize: 10, fontWeight: 700,
    color: days < 0 ? "#FF6B6B" : days <= 3 ? "var(--warn)" : "#a78bfa",
    background: days < 0 ? "#3a1a1a" : days <= 3 ? "#3a2c10" : "#1e1a2e",
    borderRadius: 4, padding: "1px 5px",
  }),
  testHint: { fontSize: 11, color: "var(--mute)", fontStyle: "italic", marginTop: 8 },
  viewPBsBtn: { width: "100%", marginTop: 8, background: "transparent", border: "1px solid var(--line)", color: "var(--accent)", borderRadius: 8, padding: "8px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" },

  // Programme expiry (existing styles preserved)
  sectionLabelWarn: { fontSize: 12, fontWeight: 700, color: "var(--warn)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: "var(--mute)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderRadius: 10, border: "1px solid", cursor: "pointer", width: "100%" },
  rowName: { fontWeight: 700, fontSize: 14, color: "var(--text)" },
  rowMeta: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
};
