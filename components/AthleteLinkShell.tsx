"use client";

import { useState, useMemo } from "react";
import type { ResolvedBranding } from "@/types/branding";
import { DEFAULT_BRANDING } from "@/types/branding";
import { useRouter } from "next/navigation";
import type { Athlete, Session, SessionType } from "@/types";

const TYPE_META: Record<SessionType, { label: string; color: string; short: string }> = {
  strength:    { label: "Strength",     color: "#3B8BEB", short: "Str" },
  hyrox:       { label: "Hyrox",        color: "#B388FF", short: "Hyr" },
  cardio:      { label: "Cardio",       color: "#4DC3FF", short: "Car" },
  power_speed: { label: "Power/Speed",  color: "#A855F7", short: "P/S" },
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateToISO(d: Date): string {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function getMonthWeeks(year: number, month: number): Date[][] {
  const firstOfMonth = new Date(year, month, 1);
  const dow = firstOfMonth.getDay(); // 0=Sun
  const monday = new Date(firstOfMonth);
  monday.setDate(1 - (dow === 0 ? 6 : dow - 1));
  const lastOfMonth = new Date(year, month + 1, 0);
  const weeks: Date[][] = [];
  const cur = new Date(monday);
  while (cur <= lastOfMonth) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export default function AthleteLinkShell({
  athlete, sessions, token, branding = DEFAULT_BRANDING,
}: {
  athlete: Athlete;
  sessions: Session[];
  token: string;
  branding?: ResolvedBranding;
}) {
  const router = useRouter();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => {
    // Start on the month with the next upcoming session, or current month
    const upcoming = sessions.filter((s) => s.date >= todayStr).sort((a, b) => a.date < b.date ? -1 : 1);
    const anchor = upcoming[0]?.date ?? todayStr;
    const d = new Date(anchor + "T12:00:00Z");
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      const list = map.get(s.date) ?? [];
      map.set(s.date, [...list, s]);
    }
    return map;
  }, [sessions]);

  const calendarWeeks = useMemo(() =>
    getMonthWeeks(calendarMonth.year, calendarMonth.month),
    [calendarMonth]
  );

  const calendarTitle = new Date(calendarMonth.year, calendarMonth.month, 1)
    .toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const prevMonth = () => setCalendarMonth(({ year, month }) =>
    month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
  );
  const nextMonth = () => setCalendarMonth(({ year, month }) =>
    month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
  );

  // Count sessions in current month for the header
  const monthStr = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}`;
  const monthSessionCount = sessions.filter((s) => s.date.startsWith(monthStr)).length;

  return (
    <div style={st.page}>
      {/* Header */}
      <div style={st.header}>
        <div>
          <div style={st.brand}>SALOPIA</div>
          <div style={st.athleteName}>{athlete.name}</div>
        </div>
      </div>

      {/* Nav tabs */}
      <div style={st.tabs}>
        <button style={st.tab} onClick={() => router.push(`/a/${token}/community`)}>
          💬 Community
        </button>
        <button style={st.tab} onClick={() => router.push(`/a/${token}/goals`)}>
          🎯 Goals
        </button>
      </div>

      {/* Calendar */}
      <div style={st.calWrap}>
        {/* Month nav */}
        <div style={st.calHeader}>
          <button style={st.navBtn} onClick={prevMonth}>‹</button>
          <div style={st.calTitleGroup}>
            <span style={st.calTitle}>{calendarTitle}</span>
            {monthSessionCount > 0 && (
              <span style={st.calCount}>{monthSessionCount} session{monthSessionCount !== 1 ? "s" : ""}</span>
            )}
          </div>
          <button style={st.navBtn} onClick={nextMonth}>›</button>
        </div>

        {/* Day headers */}
        <div style={st.grid}>
          {DAYS.map((d) => (
            <div key={d} style={st.dayHeader}>{d}</div>
          ))}

          {/* Date cells */}
          {calendarWeeks.map((week) =>
            week.map((day) => {
              const iso = dateToISO(day);
              const isCurrentMonth = day.getMonth() === calendarMonth.month;
              const isToday = iso === todayStr;
              const isPast = iso < todayStr;
              const daySessions = sessionsByDate.get(iso) ?? [];

              return (
                <div
                  key={iso}
                  style={{
                    ...st.cell,
                    opacity: isCurrentMonth ? 1 : 0.25,
                    borderColor: isToday ? "var(--accent)" : "var(--line)",
                    background: isToday ? "var(--accent-dim)" : "var(--panel)",
                  }}
                >
                  <div style={{
                    ...st.dayNum,
                    color: isToday ? "var(--accent)" : "var(--mute)",
                    fontWeight: isToday ? 700 : 400,
                  }}>
                    {day.getDate()}
                  </div>

                  {daySessions.map((session) => {
                    const meta = TYPE_META[session.type];
                    return (
                      <button
                        key={session.id}
                        style={{
                          ...st.chip,
                          background: meta.color + (isPast ? "18" : "28"),
                          borderColor: meta.color + (isPast ? "44" : "88"),
                          color: meta.color,
                          opacity: isPast ? 0.7 : 1,
                        }}
                        onClick={() => router.push(`/a/${token}/sessions/${session.id}`)}
                      >
                        {meta.short}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Legend */}
        <div style={st.legend}>
          {Object.entries(TYPE_META).map(([type, meta]) => (
            <div key={type} style={st.legendItem}>
              <span style={{ ...st.legendDot, background: meta.color }} />
              <span style={st.legendLabel}>{meta.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming sessions list below calendar */}
      <div style={st.upcomingSection}>
        <div style={st.upcomingTitle}>Upcoming sessions</div>
        {sessions
          .filter((s) => s.date >= todayStr)
          .sort((a, b) => a.date < b.date ? -1 : 1)
          .slice(0, 5)
          .map((session) => {
            const meta = TYPE_META[session.type];
            const total = (session.exercises ?? []).reduce((n, e) => n + (e.log ?? []).length, 0);
            const done = (session.exercises ?? []).reduce(
              (n, e) => n + (e.log ?? []).filter((s) => s.done).length, 0
            );
            return (
              <button
                key={session.id}
                style={st.row}
                onClick={() => router.push(`/a/${token}/sessions/${session.id}`)}
              >
                <span style={{ ...st.typeDot, background: meta.color }} />
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" as const }}>
                  <div style={st.rowName}>{session.name}</div>
                  <div style={st.rowMeta}>
                    {session.date} · {meta.label}
                    {total > 0 ? ` · ${done}/${total} sets` : ""}
                  </div>
                </div>
              </button>
            );
          })}
        {sessions.filter((s) => s.date >= todayStr).length === 0 && (
          <div style={st.empty}>No upcoming sessions scheduled.</div>
        )}
        {sessions.filter((s) => s.date >= todayStr).length > 5 && (
          <div style={st.moreNote}>
            +{sessions.filter((s) => s.date >= todayStr).length - 5} more — navigate the calendar above to see all sessions
          </div>
        )}
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", maxWidth: 480, margin: "0 auto", padding: "0 0 40px" },
  header: { padding: "20px 16px 12px", borderBottom: "1px solid var(--line)" },
  brand: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: 2, color: "var(--accent)" },
  athleteName: { fontSize: 22, fontWeight: 700, color: "var(--text)", marginTop: 2 },
  tabs: { display: "flex", gap: 6, padding: "10px 16px", borderBottom: "1px solid var(--line)" },
  tab: { flex: 1, background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", padding: "9px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  // Calendar
  calWrap: { padding: "16px 12px 8px" },
  calHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  calTitleGroup: { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 2 },
  calTitle: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--text)" },
  calCount: { fontSize: 11, color: "var(--mute)" },
  navBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, width: 34, height: 34, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  grid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 },
  dayHeader: { fontSize: 10, fontWeight: 700, color: "var(--mute)", textAlign: "center" as const, padding: "3px 0", textTransform: "uppercase" as const },
  cell: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 6, padding: "4px 3px 3px", minHeight: 52, display: "flex", flexDirection: "column" as const, gap: 2 },
  dayNum: { fontSize: 10, color: "var(--mute)", textAlign: "right" as const, paddingRight: 2 },
  chip: { fontSize: 9, fontWeight: 700, borderRadius: 3, padding: "2px 3px", border: "1px solid", lineHeight: 1.4, cursor: "pointer", textAlign: "center" as const, width: "100%" },
  legend: { display: "flex", gap: 12, justifyContent: "center", marginTop: 10 },
  legendItem: { display: "flex", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: "50%" },
  legendLabel: { fontSize: 11, color: "var(--mute)" },
  // Upcoming list
  upcomingSection: { padding: "0 16px" },
  upcomingTitle: { fontSize: 12, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 10, marginTop: 4 },
  row: { display: "flex", alignItems: "center", gap: 12, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", cursor: "pointer", width: "100%", marginBottom: 8 },
  typeDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  rowName: { fontWeight: 700, fontSize: 15, color: "var(--text)" },
  rowMeta: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  empty: { color: "var(--mute)", fontSize: 14, padding: "20px 0", textAlign: "center" as const },
  moreNote: { fontSize: 12, color: "var(--mute)", fontStyle: "italic", textAlign: "center" as const, padding: "8px 0" },
};
