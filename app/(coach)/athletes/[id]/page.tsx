"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import {
  listSessionsForAthlete,
  createSession,
  deleteSession,
  copySessionsRange,
  deleteSessionsRange,
} from "@/lib/data/sessions";
import { todayISO } from "@/lib/date-utils";
import { listTemplates, loadTemplateForAthlete } from "@/lib/data/templates";
import { generateReport, type ReportData } from "@/lib/data/reports";
import { archiveAthlete, toggleLiveGroup } from "@/lib/data/athletes";
import ReportRangeModal from "@/components/ReportRangeModal";
import ReportModal from "@/components/ReportModal";
import VoiceSessionModal from "@/components/VoiceSessionModal";
import NotesSessionModal from "@/components/NotesSessionModal";
import ModifySessionsModal from "@/components/ModifySessionsModal";
import { updateAthleteTestingSchedule, updateAthlete } from "@/lib/data/athletes";
import AssignProgrammeModal from "@/components/AssignProgrammeModal";
import GoalsManager from "@/components/GoalsManager";
import ExportModal from "@/components/ExportModal";
import type { Athlete, Session, SessionType, Template } from "@/types";

const TYPE_META: Record<SessionType, { label: string; color: string }> = {
  strength: { label: "Strength", color: "#3B8BEB" },
  hyrox: { label: "Hyrox", color: "#B388FF" },
  cardio: { label: "Cardio", color: "#4DC3FF" },
  power_speed: { label: "Power/Speed", color: "#A855F7" },
};

function EditableName({ name, onSave }: { name: string; onSave: (n: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!value.trim() || value === name) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(value.trim()); setEditing(false); }
    catch {}
    finally { setSaving(false); }
  };

  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
          style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, background: "var(--ink)", border: "1px solid var(--accent)", borderRadius: 6, color: "var(--text)", padding: "2px 8px" }}
          autoFocus
        />
        <button onClick={handleSave} disabled={saving} style={{ background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {saving ? "..." : "Save"}
        </button>
        <button onClick={() => setEditing(false)} style={{ background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, color: "var(--text)", margin: 0 }}>{name}</h1>
      <button onClick={() => setEditing(true)} style={{ background: "transparent", border: "none", color: "var(--mute)", cursor: "pointer", fontSize: 13, padding: "0 4px" }} title="Edit name">
        ✎
      </button>
    </div>
  );
}

export default function AthleteDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const athleteId = params.id;

  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [typePicker, setTypePicker] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [loadTemplateOpen, setLoadTemplateOpen] = useState(false);
  const [loadTemplateId, setLoadTemplateId] = useState("");
  const [loadStart, setLoadStart] = useState(todayISO());
  const [loadEnd, setLoadEnd] = useState(todayISO());
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [reportRangeOpen, setReportRangeOpen] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [rangeToolOpen, setRangeToolOpen] = useState<"copy" | "delete" | null>(null);
  const [rangeStart, setRangeStart] = useState(todayISO());
  const [rangeEnd, setRangeEnd] = useState(todayISO());
  const [copyWeeks, setCopyWeeks] = useState(1);
  const [rangeWorking, setRangeWorking] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [lastTestDate, setLastTestDate] = useState("");
  const [retestWeeks, setRetestWeeks] = useState<number | "">(8);
  const [testSaving, setTestSaving] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);

  // Calendar view state
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [calendarAddDate, setCalendarAddDate] = useState<string | null>(null);

  const handleCopyShareLink = async () => {
    if (!athlete) return;
    const url = `${window.location.origin}/a/${athlete.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError("Could not copy link — your browser may be blocking clipboard access.");
    }
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: athleteData, error: athleteError } = await supabase
        .from("athletes")
        .select("*")
        .eq("id", athleteId)
        .single();
      if (athleteError) throw athleteError;
      setAthlete(athleteData);
      setLastTestDate((athleteData as any).last_test_date ?? "");
      setRetestWeeks((athleteData as any).retest_weeks ?? 8);

      const sessionData = await listSessionsForAthlete(athleteId);
      setSessions(sessionData);

      const templateData = await listTemplates();
      setTemplates(templateData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load athlete");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (athleteId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  const handleAddSession = async (type: SessionType) => {
    setTypePicker(false);
    const date = calendarAddDate ?? todayISO();
    setCalendarAddDate(null);
    try {
      const session = await createSession(
        athleteId,
        type,
        date,
        `Session ${sessions.length + 1}`,
        []
      );
      router.push(`/athletes/${athleteId}/sessions/${session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create session");
    }
  };

  const handleDeleteSession = async (session: Session) => {
    if (!confirm(`Delete "${session.name}"? This can't be undone.`)) return;
    try {
      await deleteSession(session.id);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete session");
    }
  };

  const handleLoadTemplate = async () => {
    if (!loadTemplateId) return;
    setLoadingTemplate(true);
    setError("");
    try {
      const result = await loadTemplateForAthlete(loadTemplateId, athleteId, loadStart, loadEnd);
      // Refetch rather than reconstruct locally — a template load can
      // create anywhere from 1 to 90 sessions across multiple defs,
      // and a clean reload is simpler and less error-prone than
      // building all of that up client-side.
      const sessionData = await listSessionsForAthlete(athleteId);
      setSessions(sessionData);
      setFlash(`Added ${result.sessionsCreated} session${result.sessionsCreated !== 1 ? "s" : ""}`);
      setTimeout(() => setFlash(""), 3000);
      setLoadTemplateOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load template");
    } finally {
      setLoadingTemplate(false);
    }
  };

  const handleGenerateReport = async (start: string | null, end: string | null) => {
    setGeneratingReport(true);
    setError("");
    try {
      const data = await generateReport(athleteId, start, end);
      setReportData(data);
      setReportRangeOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate report");
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleArchive = async () => {
    if (!athlete) return;
    if (
      !confirm(
        `Archive ${athlete.name}? They'll be hidden from your active roster, but nothing is deleted — you can restore them from Athletes → Archived any time.`
      )
    )
      return;
    try {
      await archiveAthlete(athleteId);
      router.push("/athletes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not archive athlete");
    }
  };

  const handleToggleLiveGroup = async () => {
    if (!athlete) return;
    const next = !athlete.in_live_group;
    setAthlete((prev) => (prev ? { ...prev, in_live_group: next } : prev));
    try {
      await toggleLiveGroup(athleteId, next);
    } catch (e) {
      setAthlete((prev) => (prev ? { ...prev, in_live_group: !next } : prev)); // revert on failure
      setError(e instanceof Error ? e.message : "Could not update live group");
    }
  };

  const handleCopyRange = async () => {
    setRangeWorking(true);
    setError("");
    try {
      const result = await copySessionsRange(athleteId, rangeStart, rangeEnd, copyWeeks);
      if (!result.sourceCount) {
        setError("No sessions found in that date range.");
        return;
      }
      const sessionData = await listSessionsForAthlete(athleteId);
      setSessions(sessionData);
      setFlash(
        `Copied ${result.sourceCount} session${result.sourceCount !== 1 ? "s" : ""} × ${copyWeeks} week${copyWeeks !== 1 ? "s" : ""} (${result.createdCount} new sessions)`
      );
      setTimeout(() => setFlash(""), 3000);
      setRangeToolOpen(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not copy sessions");
    } finally {
      setRangeWorking(false);
    }
  };

  const handleDeleteRange = async () => {
    if (
      !confirm(
        `Delete every session for ${athlete?.name} between ${rangeStart} and ${rangeEnd}? This can't be undone.`
      )
    )
      return;
    setRangeWorking(true);
    setError("");
    try {
      const count = await deleteSessionsRange(athleteId, rangeStart, rangeEnd);
      setSessions((prev) => prev.filter((s) => !(s.date >= rangeStart && s.date <= rangeEnd)));
      setFlash(`Deleted ${count} session${count !== 1 ? "s" : ""}`);
      setTimeout(() => setFlash(""), 3000);
      setRangeToolOpen(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete sessions");
    } finally {
      setRangeWorking(false);
    }
  };

  // Calendar helpers — must be before any early returns (Rules of Hooks)
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      const list = map.get(s.date) ?? [];
      map.set(s.date, [...list, s]);
    }
    return map;
  }, [sessions]);

  const calendarWeeks = useMemo(() => {
    const { year, month } = calendarMonth;
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
  }, [calendarMonth]);

  if (loading) return <div style={styles.empty}>Loading…</div>;
  if (error && !athlete) return <div style={styles.errorBox}>{error}</div>;
  if (!athlete) return <div style={styles.empty}>Athlete not found.</div>;

  const sortedSessions = [...sessions].sort((a, b) => (a.date < b.date ? 1 : -1));

  const calendarTitle = new Date(calendarMonth.year, calendarMonth.month, 1)
    .toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const todayStr = new Date().toISOString().slice(0, 10);

  function dateToISO(d: Date): string {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  const prevMonth = () => setCalendarMonth(({ year, month }) =>
    month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
  );
  const nextMonth = () => setCalendarMonth(({ year, month }) =>
    month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
  );

  return (
    <div style={styles.page}>
      <button style={styles.backLink} onClick={() => router.push("/athletes")}>
        ← All athletes
      </button>

      <div style={styles.headerRow}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            style={{ ...styles.starBtn, color: athlete.in_live_group ? "var(--warn)" : "var(--mute)" }}
            onClick={handleToggleLiveGroup}
            title={athlete.in_live_group ? "Remove from live group" : "Add to live group"}
          >
            {athlete.in_live_group ? "★" : "☆"}
          </button>
          <div>
            <EditableName
              name={athlete.name}
              onSave={async (name) => {
                await updateAthlete(athleteId, { name });
                setAthlete((prev) => prev ? { ...prev, name } : prev);
              }}
            />
            {athlete.group && <div style={styles.groupLabel}>{athlete.group}</div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, position: "relative" }}>
          <button style={styles.ghostBtn} onClick={handleCopyShareLink}>
            {linkCopied ? "Copied!" : "Copy share link"}
          </button>
          <button
            style={styles.ghostBtn}
            onClick={() => {
              setLoadTemplateId(templates[0]?.id ?? "");
              setLoadStart(todayISO());
              setLoadEnd(todayISO());
              setLoadTemplateOpen(true);
            }}
          >
            Load template
          </button>
          <button style={styles.ghostBtn} onClick={() => setReportRangeOpen(true)}>
            📊 Reports
          </button>
          <button
            style={styles.ghostBtn}
            onClick={() => {
              setRangeStart(todayISO());
              setRangeEnd(todayISO());
              setCopyWeeks(1);
              setRangeToolOpen("copy");
            }}
          >
            Copy range
          </button>
          <button
            style={styles.ghostBtn}
            onClick={() => {
              setRangeStart(todayISO());
              setRangeEnd(todayISO());
              setRangeToolOpen("delete");
            }}
          >
            Delete range
          </button>
          <button style={styles.ghostBtn} onClick={() => setVoiceOpen(true)}>
            🎤 Voice
          </button>
          <button style={styles.ghostBtn} onClick={() => setNotesOpen(true)}>
            📝 Notes
          </button>
          <button style={styles.ghostBtn} onClick={() => setModifyOpen(true)}>
            ✏️ Modify
          </button>
          <button style={styles.ghostBtn} onClick={() => setAssignOpen(true)}>
            📅 Assign programme
          </button>
          <button style={styles.ghostBtn} onClick={() => router.push(`/athletes/${athleteId}/profile`)}>
            👤 Profile
          </button>
          <button style={styles.ghostBtn} onClick={() => setGoalsOpen(true)}>
            🎯 Goals
          </button>
          <button style={styles.primaryBtn} onClick={() => setTypePicker((v) => !v)}>
            + {calendarAddDate && calendarAddDate !== todayStr
              ? `Add session — ${new Date(calendarAddDate + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
              : "Add session"}
          </button>
          {typePicker && (
            <div style={styles.typePopover}>
              {calendarAddDate && (
                <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, padding: "4px 12px 8px", borderBottom: "1px solid var(--line)", marginBottom: 4 }}>
                  {new Date(calendarAddDate + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                </div>
              )}
              {(Object.keys(TYPE_META) as SessionType[]).map((t) => (
                <button
                  key={t}
                  style={styles.typeOption}
                  onClick={() => handleAddSession(t)}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      background: TYPE_META[t].color,
                      display: "inline-block",
                      marginRight: 8,
                    }}
                  />
                  {TYPE_META[t].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {flash && <div style={styles.flashBox}>{flash}</div>}
      {error && <div style={styles.errorBox}>{error}</div>}

      {/* Calendar view */}
      <div style={styles.calendarWrap}>
        {/* Month navigation */}
        <div style={styles.calendarHeader}>
          <button style={styles.calNavBtn} onClick={prevMonth}>‹</button>
          <span style={styles.calTitle}>{calendarTitle}</span>
          <button style={styles.calNavBtn} onClick={nextMonth}>›</button>
        </div>

        {/* Day headers */}
        <div style={styles.calGrid}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} style={styles.calDayHeader}>{d}</div>
          ))}

          {/* Weeks */}
          {calendarWeeks.map((week, wi) =>
            week.map((day) => {
              const iso = dateToISO(day);
              const isCurrentMonth = day.getMonth() === calendarMonth.month;
              const isToday = iso === todayStr;
              const daySessions = sessionsByDate.get(iso) ?? [];

              return (
                <div
                  key={iso}
                  style={{
                    ...styles.calCell,
                    opacity: isCurrentMonth ? 1 : 0.35,
                    background: calendarAddDate === iso ? "var(--accent-dim)" : isToday ? "rgba(59,139,235,0.08)" : "var(--panel)",
                    borderColor: calendarAddDate === iso ? "var(--accent)" : isToday ? "var(--accent)44" : "var(--line)",
                    cursor: isCurrentMonth ? "pointer" : "default",
                  }}
                  onClick={() => {
                    if (!isCurrentMonth) return;
                    setCalendarAddDate(iso);
                    setTypePicker(false); // close popover if open, let user use top-right button
                  }}
                >
                  <div style={{
                    ...styles.calDayNum,
                    color: isToday ? "var(--accent)" : isCurrentMonth ? "var(--mute)" : "var(--line)",
                    fontWeight: isToday ? 700 : 400,
                  }}>
                    {day.getDate()}
                  </div>
                  {daySessions.map((session) => {
                    const meta = TYPE_META[session.type] ?? TYPE_META.strength;
                    return (
                      <button
                        key={session.id}
                        style={{ ...styles.calSessionChip, background: meta.color + "22", borderColor: meta.color + "66", color: meta.color }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (session.id) router.push(`/athletes/${athleteId}/sessions/${session.id}`);
                        }}
                        title={session.name}
                      >
                        {session.name.length > 14 ? session.name.slice(0, 13) + "..." : session.name}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {sessions.length === 0 && (
          <div style={styles.empty}>No sessions yet. Add one above or click a date.</div>
        )}
      </div>

      {loadTemplateOpen && (
        <div style={styles.overlay} onClick={() => setLoadTemplateOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>Load template</div>
            {!templates.length ? (
              <p style={styles.modalNote}>
                No templates yet — build one in the Template Library first.
              </p>
            ) : (
              <>
                <div style={styles.fieldLabel}>Template</div>
                <select
                  value={loadTemplateId}
                  onChange={(e) => setLoadTemplateId(e.target.value)}
                  style={styles.modalInput}
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <div style={styles.modalRow}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.fieldLabel}>Start date</div>
                    <input
                      type="date"
                      value={loadStart}
                      onChange={(e) => setLoadStart(e.target.value)}
                      style={styles.modalInput}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={styles.fieldLabel}>End date</div>
                    <input
                      type="date"
                      value={loadEnd}
                      onChange={(e) => setLoadEnd(e.target.value)}
                      style={styles.modalInput}
                    />
                  </div>
                </div>
                <p style={styles.modalNote}>
                  Sessions with repeat days set will be added on every matching weekday in this
                  range. Sessions with no repeat days are added once, on the start date.
                </p>
                <button
                  disabled={loadingTemplate}
                  style={{ ...styles.primaryBtn, width: "100%", opacity: loadingTemplate ? 0.6 : 1 }}
                  onClick={handleLoadTemplate}
                >
                  {loadingTemplate ? "Loading…" : "Load template"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {reportRangeOpen && (
        <ReportRangeModal
          athleteName={athlete.name}
          onGenerate={handleGenerateReport}
          onClose={() => setReportRangeOpen(false)}
        />
      )}

      {generatingReport && <div style={styles.empty}>Generating report…</div>}

      {reportData && (
        <ReportModal
          data={reportData}
          athleteName={athlete.name}
          athleteGroup={athlete.group}
          onClose={() => setReportData(null)}
        />
      )}

      {rangeToolOpen && (
        <div style={styles.overlay} onClick={() => setRangeToolOpen(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>
              {rangeToolOpen === "copy" ? "Copy sessions" : "Delete sessions"}
            </div>
            <p style={styles.modalNote}>
              {rangeToolOpen === "copy"
                ? "Every session for this athlete in the date range below will be duplicated, repeated weekly. Logged weights are not carried over."
                : "Every session for this athlete in the date range below will be permanently deleted."}
            </p>
            <div style={styles.modalRow}>
              <div style={{ flex: 1 }}>
                <div style={styles.fieldLabel}>Start date</div>
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  style={styles.modalInput}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={styles.fieldLabel}>End date</div>
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  style={styles.modalInput}
                />
              </div>
            </div>
            {rangeToolOpen === "copy" && (
              <>
                <div style={styles.fieldLabel}>Repeat for how many weeks?</div>
                <input
                  value={copyWeeks}
                  inputMode="numeric"
                  onChange={(e) => setCopyWeeks(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  style={styles.modalInput}
                />
              </>
            )}
            <button
              disabled={rangeWorking}
              style={{ ...styles.primaryBtn, width: "100%", opacity: rangeWorking ? 0.6 : 1 }}
              onClick={rangeToolOpen === "copy" ? handleCopyRange : handleDeleteRange}
            >
              {rangeWorking
                ? "Working…"
                : rangeToolOpen === "copy"
                  ? "Copy sessions"
                  : "Delete sessions"}
            </button>
          </div>
        </div>
      )}

      {/* Power/Speed benchmark link */}
      <button
        style={{ ...styles.testingCard, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #A855F744", background: "#A855F708" }}
        onClick={() => router.push(`/athletes/${athleteId}/power-speed`)}
      >
        <div>
          <div style={{ ...styles.testingTitle, color: "#A855F7" }}>⚡ Power / Speed Benchmarks</div>
          <div style={{ fontSize: 12, color: "var(--mute)", marginTop: 2 }}>10m, 20m, CMJ, RSI, Broad Jump, 505 →</div>
        </div>
        <span style={{ fontSize: 20, color: "#A855F7" }}>›</span>
      </button>

      {/* Testing schedule card */}
      <div style={styles.testingCard}>
        <div style={styles.testingTitle}>🔬 Testing schedule</div>
        <div style={styles.testingRow}>
          <div>
            <div style={styles.testingLabel}>Last test date</div>
            <input
              type="date"
              value={lastTestDate}
              onChange={(e) => setLastTestDate(e.target.value)}
              style={styles.testingInput}
            />
          </div>
          <div>
            <div style={styles.testingLabel}>Retest every</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="number"
                min={1}
                max={52}
                value={retestWeeks}
                onChange={(e) => setRetestWeeks(e.target.value ? Number(e.target.value) : "")}
                style={{ ...styles.testingInput, width: 60 }}
              />
              <span style={{ fontSize: 13, color: "var(--mute)" }}>weeks</span>
            </div>
          </div>
          <div>
            <div style={styles.testingLabel}>Next test due</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", paddingTop: 9 }}>
              {lastTestDate && retestWeeks
                ? (() => {
                    const d = new Date(lastTestDate + "T12:00:00Z");
                    d.setDate(d.getDate() + Number(retestWeeks) * 7);
                    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                  })()
                : "—"}
            </div>
          </div>
          <button
            style={{ ...styles.ghostBtn, alignSelf: "flex-end", opacity: testSaving ? 0.5 : 1 }}
            disabled={testSaving}
            onClick={async () => {
              setTestSaving(true);
              try {
                await updateAthleteTestingSchedule(
                  athleteId,
                  lastTestDate || null,
                  retestWeeks ? Number(retestWeeks) : null
                );
                setFlash("Testing schedule saved");
                setTimeout(() => setFlash(""), 2000);
              } catch {}
              finally { setTestSaving(false); }
            }}
          >
            {testSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {voiceOpen && (
        <VoiceSessionModal
          mode="new"
          athleteId={athleteId}
          sessionCount={sessions.length}
          onCreated={(session) => {
            setVoiceOpen(false);
            router.push(`/athletes/${athleteId}/sessions/${session.id}`);
          }}
          onClose={() => setVoiceOpen(false)}
        />
      )}

      {goalsOpen && athlete && (
        <GoalsManager
          athleteId={athleteId}
          athleteName={athlete.name}
          onClose={() => setGoalsOpen(false)}
        />
      )}

      {exportOpen && (
        <ExportModal
          mode="single"
          athleteId={athleteId}
          athleteName={athlete?.name}
          onClose={() => setExportOpen(false)}
        />
      )}

      {assignOpen && athlete && (
        <AssignProgrammeModal
          athleteId={athleteId}
          athleteName={athlete.name}
          onScheduled={(count) => {
            setAssignOpen(false);
            setFlash(`Scheduled ${count} session${count !== 1 ? "s" : ""} on calendar`);
            setTimeout(() => setFlash(""), 3000);
            load();
          }}
          onClose={() => setAssignOpen(false)}
        />
      )}

      {modifyOpen && (
        <ModifySessionsModal
          upcomingSessions={sessions.filter((s) => s.date >= new Date().toISOString().slice(0, 10))}
          onApplied={() => { setModifyOpen(false); load(); }}
          onClose={() => setModifyOpen(false)}
        />
      )}

      {notesOpen && (
        <NotesSessionModal
          athleteId={athleteId}
          sessionCount={sessions.length}
          onCreated={(newSessions) => {
            setSessions((prev) => [...prev, ...newSessions]);
            setNotesOpen(false);
            setFlash(
              `Added ${newSessions.length} session${newSessions.length !== 1 ? "s" : ""} to calendar`
            );
            setTimeout(() => setFlash(""), 3000);
          }}
          onClose={() => setNotesOpen(false)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900 },
  backLink: {
    background: "transparent",
    border: "none",
    color: "var(--mute)",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
    marginBottom: 16,
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: 0 },
  groupLabel: { fontSize: 13, color: "var(--mute)", marginTop: 2 },
  starBtn: {
    background: "transparent",
    border: "none",
    fontSize: 28,
    cursor: "pointer",
    padding: "0 2px",
    lineHeight: 1,
  },
  primaryBtn: {
    background: "var(--accent)",
    color: "#0a1420",
    border: "none",
    borderRadius: 10,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  ghostBtn: {
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  testingCard: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "14px 16px",
    marginTop: 16,
  },
  testingTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text)",
    marginBottom: 10,
  },
  testingRow: {
    display: "flex",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap" as const,
  },
  testingLabel: {
    fontSize: 11,
    color: "var(--mute)",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    marginBottom: 4,
    letterSpacing: "0.04em",
  },
  testingInput: {
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
  },
  typePopover: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    background: "var(--panel2)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: 6,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 140,
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    zIndex: 10,
  },
  typeOption: {
    display: "flex",
    alignItems: "center",
    padding: "8px 10px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
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
  empty: { color: "var(--mute)", fontSize: 14, padding: "40px 0", textAlign: "center" },
  sessionList: { display: "flex", flexDirection: "column", gap: 8 },
  sessionRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "12px 14px",
    cursor: "pointer",
  },
  // Calendar
  calendarWrap: { marginTop: 8 },
  calendarHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  calTitle: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--text)" },
  calNavBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, width: 32, height: 32, fontSize: 18, cursor: "pointer" },
  calGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 },
  calDayHeader: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textAlign: "center" as const, padding: "4px 0", textTransform: "uppercase" as const },
  calCell: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 6px 4px", minHeight: 72, cursor: "pointer", display: "flex", flexDirection: "column" as const, gap: 3 },
  calDayNum: { fontSize: 11, marginBottom: 2, textAlign: "right" as const },
  calSessionChip: { fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "2px 5px", border: "1px solid", lineHeight: 1.4, cursor: "pointer", overflow: "hidden", whiteSpace: "nowrap" as const },
  typeDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  sessionName: { fontWeight: 700, fontSize: 14, color: "var(--text)" },
  sessionMeta: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  deleteBtn: {
    background: "transparent",
    border: "none",
    color: "var(--mute)",
    fontSize: 18,
    cursor: "pointer",
    padding: 4,
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
    maxWidth: 380,
  },
  modalTitle: {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 14,
  },
  modalRow: { display: "flex", gap: 10 },
  modalNote: { fontSize: 12, color: "var(--mute)", lineHeight: 1.5, marginBottom: 12 },
  fieldLabel: { fontSize: 11, color: "var(--mute)", marginBottom: 4, fontWeight: 600 },
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
};
