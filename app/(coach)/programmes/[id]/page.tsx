"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  getProgramme,
  updateProgramme,
  deleteProgramme,
  deleteProgrammeSession,
  assignProgrammeToAthlete,
  unassignProgrammeFromAthlete,
  loadProgrammeSessionForAthlete,
  scheduleProgrammeSessions,
  insertProgrammeSessions,
  saveProgrammeSessions,
  deleteProgrammeSessions,
  updateProgrammeSession,
} from "@/lib/data/programmes";
import { listLibrary } from "@/lib/data/library";
import WeekGrid from "@/components/programme/WeekGrid";
import ProgrammeSessionEditor from "@/components/programme/ProgrammeSessionEditor";
import { AddTemplateModal, CopyModal, ProgressionModal, type AddPlan } from "@/components/programme/BuilderModals";
import {
  blankSessionDraft, copySessionDraft, dayOf, draftFromTemplateDef, offsetFor, planCopyToWeeks, programmeWeekCount,
  sortOrderFor, weekOf, type SessionDraft,
} from "@/lib/programme-builder";
import { listTemplates } from "@/lib/data/templates";
import { listAthletes } from "@/lib/data/athletes";
import { todayISO } from "@/lib/date-utils";
import { usePendingUndo } from "@/lib/use-pending-undo";
import UndoBanner from "@/components/UndoBanner";
import type { Programme, ProgrammeSession, Athlete, Template, LibraryEntry } from "@/types";

function formatScheduleDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  });
}

export default function ProgrammeDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const programmeId = params.id;

  const [programme, setProgramme] = useState<Programme | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const undo = usePendingUndo();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  // Builder tools (0132).
  const [addAt, setAddAt] = useState<{ week: number; day: number } | "toolbar" | null>(null);
  const [copyFrom, setCopyFrom] = useState<{ sessions: ProgrammeSession[]; weeks: Set<number>; allowDay: boolean; title: string } | null>(null);
  const [progressionOpen, setProgressionOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Edits save shortly after the coach stops typing, per session.
  const pendingSaves = useRef(new Map<string, { patch: Partial<ProgrammeSession>; timer: ReturnType<typeof setTimeout> }>());

  // Bulk "Load onto athlete" flow - pick an athlete/start date/spacing for
  // whichever sessions are checked in the list, preview the resulting
  // calendar dates, optionally drop individual rows from just this load,
  // then generate. Mirrors AssignProgrammeModal's scheduling logic but
  // scoped to a subset of sessions rather than the whole programme, and
  // launched from the programme editor rather than the athlete page.
  const [bulkLoadOpen, setBulkLoadOpen] = useState(false);
  const [bulkPhase, setBulkPhase] = useState<"pick" | "preview">("pick");
  const [bulkAthleteId, setBulkAthleteId] = useState("");
  const [bulkAthleteSearch, setBulkAthleteSearch] = useState("");
  const [bulkStartDate, setBulkStartDate] = useState(todayISO());
  const [bulkBaseSessions, setBulkBaseSessions] = useState<ProgrammeSession[]>([]);
  const [bulkRemovedIds, setBulkRemovedIds] = useState<Set<string>>(new Set());
  const [bulkUseCustomSpacing, setBulkUseCustomSpacing] = useState(false);
  const [bulkSpacingDays, setBulkSpacingDays] = useState(2);
  const [bulkSaving, setBulkSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [p, a, t] = await Promise.all([getProgramme(programmeId), listAthletes(), listTemplates()]);
      setProgramme(p);
      setAthletes(a);
      setTemplates(t);
      setSelectedSessionIds(new Set());
      listLibrary().then(setLibrary).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load programme");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (programmeId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programmeId]);

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(""), 3000);
  };

  const handleNameChange = async (name: string) => {
    setProgramme((prev) => (prev ? { ...prev, name } : prev));
    try {
      await updateProgramme(programmeId, { name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  };

  const handleDescriptionChange = async (description: string) => {
    setProgramme((prev) => (prev ? { ...prev, description } : prev));
    try {
      await updateProgramme(programmeId, { description });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  };

  // ── Builder (0132) ──────────────────────────────────────────────────────
  const sessionsNow = () => programme?.sessions ?? [];
  const weeks = programmeWeekCount(programme?.weeks, programme?.sessions ?? []);

  const setWeeks = async (next: number) => {
    if (!programme || next < 1 || next > 104) return;
    const dropping = sessionsNow().filter((s) => weekOf(s.day_offset) >= next);
    if (dropping.length && !confirm(`Remove week${weeks - next === 1 ? "" : "s"} ${next + 1}${weeks - next > 1 ? `-${weeks}` : ""} and the ${dropping.length} session${dropping.length === 1 ? "" : "s"} in ${weeks - next === 1 ? "it" : "them"}?`)) return;
    try {
      if (dropping.length) await deleteProgrammeSessions(dropping.map((s) => s.id));
      await updateProgramme(programmeId, { weeks: next });
      setProgramme((prev) => prev ? { ...prev, weeks: next, sessions: (prev.sessions ?? []).filter((s) => weekOf(s.day_offset) < next) } : prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the number of weeks");
    }
  };

  // Adds drafts, numbering them after whatever is already on each day.
  const addDrafts = async (drafts: SessionDraft[], msg?: string) => {
    if (!drafts.length) return [] as ProgrammeSession[];
    setBusy(true);
    setError("");
    try {
      const perDay = new Map<number, number>();
      for (const s of sessionsNow()) perDay.set(s.day_offset, (perDay.get(s.day_offset) ?? 0) + 1);
      const numbered = drafts.map((d) => {
        const idx = perDay.get(d.day_offset) ?? 0;
        perDay.set(d.day_offset, idx + 1);
        return { ...d, sort_order: sortOrderFor(d.day_offset, idx) };
      });
      const added = await insertProgrammeSessions(programmeId, numbered);
      setProgramme((prev) => (prev ? { ...prev, sessions: [...(prev.sessions ?? []), ...added] } : prev));
      if (msg) showFlash(msg);
      return added;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add sessions");
      return [] as ProgrammeSession[];
    } finally {
      setBusy(false);
    }
  };

  const handleAddPlan = async (plan: AddPlan[]) => {
    setAddAt(null);
    await addDrafts(plan.map((p) => draftFromTemplateDef(p.def, offsetFor(p.week, p.day), 0)), `Added ${plan.length} session${plan.length === 1 ? "" : "s"}`);
  };

  const handleBlank = async (week: number, day: number) => {
    setAddAt(null);
    const [added] = await addDrafts([blankSessionDraft(offsetFor(week, day), 0)]);
    if (added) setActiveSessionId(added.id);
  };

  const handleDrop = async (id: string, week: number, day: number, copy: boolean) => {
    const s = sessionsNow().find((x) => x.id === id);
    if (!s) return;
    const off = offsetFor(week, day);
    if (copy) {
      await addDrafts([copySessionDraft(s, off, 0)], `Copied "${s.name}" to week ${week + 1} ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day]}`);
      return;
    }
    if (s.day_offset === off) return;
    const idx = sessionsNow().filter((x) => x.day_offset === off).length;
    const patch = { day_offset: off, sort_order: sortOrderFor(off, idx) };
    setProgramme((prev) => prev ? { ...prev, sessions: (prev.sessions ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)) } : prev);
    try {
      await updateProgrammeSession(id, patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move the session");
    }
  };

  const handleCopy = async (targetWeeks: number[], toDay: number | null, extendTo: number | null) => {
    if (!copyFrom) return;
    const source = copyFrom.sessions;
    setCopyFrom(null);
    if (extendTo && extendTo > weeks) await setWeeks(extendTo);
    const drafts = planCopyToWeeks(source, targetWeeks, sessionsNow(), toDay);
    await addDrafts(drafts, `Copied ${source.length} session${source.length === 1 ? "" : "s"} to ${targetWeeks.length} week${targetWeeks.length === 1 ? "" : "s"}`);
  };

  const removeSessions = async (ids: string[], label: string) => {
    if (!ids.length || !confirm(`Delete ${label}? This can't be undone.`)) return;
    try {
      await deleteProgrammeSessions(ids);
      const gone = new Set(ids);
      setProgramme((prev) => (prev ? { ...prev, sessions: (prev.sessions ?? []).filter((s) => !gone.has(s.id)) } : prev));
      setSelectedSessionIds((prev) => new Set(Array.from(prev).filter((id) => !gone.has(id))));
      if (activeSessionId && gone.has(activeSessionId)) setActiveSessionId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  };

  const handleWeekAction = (week: number, action: "copy" | "clear") => {
    const inWeek = sessionsNow().filter((s) => weekOf(s.day_offset) === week);
    if (action === "clear") removeSessions(inWeek.map((s) => s.id), `all ${inWeek.length} session${inWeek.length === 1 ? "" : "s"} in week ${week + 1}`);
    else setCopyFrom({ sessions: inWeek, weeks: new Set([week]), allowDay: false, title: `Copy week ${week + 1}` });
  };

  const handleApplyProgression = async (updated: ProgrammeSession[]) => {
    setProgressionOpen(false);
    setBusy(true);
    try {
      await saveProgrammeSessions(updated);
      const byId = new Map(updated.map((u) => [u.id, u]));
      setProgramme((prev) => (prev ? { ...prev, sessions: (prev.sessions ?? []).map((s) => byId.get(s.id) ?? s) } : prev));
      showFlash(`Updated ${updated.length} session${updated.length === 1 ? "" : "s"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply the progression");
    } finally {
      setBusy(false);
    }
  };

  const editSession = (id: string, patch: Partial<ProgrammeSession>) => {
    setProgramme((prev) => (prev ? { ...prev, sessions: (prev.sessions ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)) } : prev));
    const pending = pendingSaves.current.get(id);
    if (pending) clearTimeout(pending.timer);
    const merged = { ...(pending?.patch ?? {}), ...patch };
    const timer = setTimeout(async () => {
      pendingSaves.current.delete(id);
      try {
        await updateProgrammeSession(id, merged);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the session");
      }
    }, 600);
    pendingSaves.current.set(id, { patch: merged, timer });
  };

  // Save anything still waiting when leaving the page.
  useEffect(() => {
    const pending = pendingSaves.current;
    return () => {
      pending.forEach(({ patch, timer }, id) => {
        clearTimeout(timer);
        updateProgrammeSession(id, patch).catch(() => {});
      });
    };
  }, []);

  const handleDeleteProgramme = async () => {
    if (!confirm(`Delete programme "${programme?.name}"? This can't be undone.`)) return;
    try {
      await deleteProgramme(programmeId);
      router.push("/programmes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete programme");
    }
  };

  const handleUnassign = async (athleteId: string) => {
    try {
      await unassignProgrammeFromAthlete(programmeId, athleteId);
      setProgramme((prev) =>
        prev ? { ...prev, assigned_to: prev.assigned_to?.filter((id) => id !== athleteId) } : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unassign");
    }
  };

  const toggleSessionSelected = (sessionId: string) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const handleOpenBulkLoad = () => {
    setBulkPhase("pick");
    setBulkAthleteId("");
    setBulkAthleteSearch("");
    setBulkStartDate(todayISO());
    setBulkUseCustomSpacing(false);
    setBulkSpacingDays(2);
    setBulkLoadOpen(true);
  };

  // "Load Programme" (the Assigned athletes section) always means the
  // whole programme, regardless of whatever subset happens to be
  // checked in the Sessions list for the separate scoped-load flow -
  // forcing full selection here keeps the two entry points from
  // stepping on each other.
  const handleOpenLoadProgramme = () => {
    setSelectedSessionIds(new Set((programme?.sessions ?? []).map((s) => s.id)));
    handleOpenBulkLoad();
  };

  const handleBuildPreview = () => {
    if (!programme || !bulkAthleteId) return;
    const selected = (programme.sessions ?? []).filter((s) => selectedSessionIds.has(s.id));
    setBulkBaseSessions(selected);
    setBulkRemovedIds(new Set());
    setBulkPhase("preview");
  };

  const handleRemoveFromBulkPreview = (sessionId: string) => {
    setBulkRemovedIds((prev) => new Set(prev).add(sessionId));
  };

  // Derived rather than stored - recomputes live as the start date or the
  // custom-spacing toggle changes, while bulkRemovedIds keeps whatever the
  // coach has already crossed out of this load intact across either change.
  const bulkScheduled = scheduleProgrammeSessions(
    bulkBaseSessions,
    bulkStartDate,
    bulkUseCustomSpacing ? bulkSpacingDays : undefined,
    programme?.weeks != null
  ).filter((row) => !bulkRemovedIds.has(row.session.id));

  const handleGenerateBulkLoad = async () => {
    if (!bulkAthleteId || !bulkScheduled.length) return;
    setBulkSaving(true);
    setError("");
    try {
      await assignProgrammeToAthlete(programmeId, bulkAthleteId);
      for (const row of bulkScheduled) {
        await loadProgrammeSessionForAthlete(row.session, bulkAthleteId, row.date);
      }
      setProgramme((prev) =>
        prev && !prev.assigned_to?.includes(bulkAthleteId)
          ? { ...prev, assigned_to: [...(prev.assigned_to ?? []), bulkAthleteId] }
          : prev
      );
      const athlete = athletes.find((a) => a.id === bulkAthleteId);
      showFlash(
        `Loaded ${bulkScheduled.length} session${bulkScheduled.length === 1 ? "" : "s"} for ${athlete?.name ?? "athlete"}`
      );
      setBulkLoadOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load sessions");
    } finally {
      setBulkSaving(false);
    }
  };

  if (loading) return <div style={styles.empty}>Loading…</div>;
  if (error && !programme) return <div style={styles.errorBox}>{error}</div>;
  if (!programme) return <div style={styles.empty}>Programme not found.</div>;

  const assignedAthletes = athletes.filter((a) => programme.assigned_to?.includes(a.id));
  const activeSession = programme.sessions?.find((s) => s.id === activeSessionId) ?? null;
  const selectedSessions = (programme.sessions ?? []).filter((s) => selectedSessionIds.has(s.id));
  const weekStart = programme.weeks != null;

  return (
    <div style={styles.page}>
      <button style={styles.backLink} onClick={() => router.push("/programmes")}>
        ← All programmes
      </button>

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

      <input
        value={programme.name}
        onChange={(e) => handleNameChange(e.target.value)}
        style={styles.nameInput}
      />
      <textarea
        value={programme.description}
        onChange={(e) => handleDescriptionChange(e.target.value)}
        placeholder="Description (optional)"
        style={styles.descInput}
      />

      <div style={styles.toolbar}>
        <button style={styles.ghostBtn} onClick={handleDeleteProgramme}>
          Delete programme
        </button>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeadRow}>
          <div style={styles.sectionTitle}>Programme</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={styles.weeksBox}>
              <button style={styles.stepBtn} onClick={() => setWeeks(weeks - 1)} disabled={weeks <= 1} aria-label="Remove a week">−</button>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{weeks} week{weeks === 1 ? "" : "s"}</span>
              <button style={styles.stepBtn} onClick={() => setWeeks(weeks + 1)} aria-label="Add a week">+</button>
            </div>
            <button style={styles.smallBtn} onClick={() => setAddAt("toolbar")}>+ Add from template</button>
          </div>
        </div>
        <p style={styles.hint}>
          Click a session to edit it · tick sessions to copy, delete or progress them · drag to move (hold Alt / Option to copy) · + adds to that day.
        </p>

        {selectedSessions.length > 0 && (
          <div style={styles.actionBar}>
            <span style={{ fontWeight: 800, fontSize: 13 }}>{selectedSessions.length} selected</span>
            <button style={styles.smallBtn} onClick={() => setCopyFrom({ sessions: selectedSessions, weeks: new Set(selectedSessions.map((s) => weekOf(s.day_offset))), allowDay: true, title: `Copy ${selectedSessions.length} session${selectedSessions.length === 1 ? "" : "s"}` })}>
              Copy to weeks…
            </button>
            <button style={styles.smallBtn} onClick={() => setProgressionOpen(true)}>Progression…</button>
            <button style={styles.smallBtn} onClick={handleOpenBulkLoad}>Load onto athlete</button>
            <button style={{ ...styles.smallBtn, color: "#FF6B6B", background: "transparent", border: "1px solid var(--line)" }} onClick={() => removeSessions(selectedSessions.map((s) => s.id), `${selectedSessions.length} session${selectedSessions.length === 1 ? "" : "s"}`)}>
              Delete
            </button>
            <button style={styles.linkBtn} onClick={() => setSelectedSessionIds(new Set())}>Clear</button>
          </div>
        )}
        {busy && <div style={styles.hint}>Saving…</div>}

        <WeekGrid
          weeks={weeks}
          sessions={programme.sessions ?? []}
          selected={selectedSessionIds}
          activeId={activeSessionId}
          onToggle={toggleSessionSelected}
          onSelectMany={(ids, on) =>
            setSelectedSessionIds((prev) => {
              const next = new Set(prev);
              for (const id of ids) {
                if (on) next.add(id);
                else next.delete(id);
              }
              return next;
            })
          }
          onOpen={setActiveSessionId}
          onAddAt={(week, day) => setAddAt({ week, day })}
          onDrop={handleDrop}
          onWeekAction={handleWeekAction}
        />
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeadRow}>
          <div style={styles.sectionTitle}>Assigned athletes</div>
          <button style={styles.smallBtn} onClick={handleOpenLoadProgramme}>
            Load Programme
          </button>
        </div>
        <div style={styles.assignedList}>
          {assignedAthletes.map((a) => (
            <div key={a.id} style={styles.assignedRow}>
              <span>{a.name}</span>
              <button style={styles.smallDeleteBtn} onClick={() => handleUnassign(a.id)}>
                ×
              </button>
            </div>
          ))}
          {!assignedAthletes.length && (
            <div style={styles.emptySmall}>Not assigned to any athletes yet.</div>
          )}
        </div>
      </div>

      {bulkLoadOpen && (
        <div style={styles.overlay} onClick={() => setBulkLoadOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            {bulkPhase === "pick" ? (
              <>
                <div style={styles.modalTitle}>Load onto athlete</div>
                <div style={styles.fieldLabel}>Athlete</div>
                <input
                  value={bulkAthleteSearch}
                  onChange={(e) => {
                    setBulkAthleteSearch(e.target.value);
                    setBulkAthleteId("");
                  }}
                  placeholder="Search athletes…"
                  style={styles.modalInput}
                />
                {!bulkAthleteId && (
                  <div style={styles.athletePickList}>
                    {(() => {
                      const filtered = athletes.filter((a) =>
                        a.name.toLowerCase().includes(bulkAthleteSearch.trim().toLowerCase())
                      );
                      if (!filtered.length) {
                        return <div style={styles.emptySmall}>No athletes match &quot;{bulkAthleteSearch}&quot;.</div>;
                      }
                      return filtered.map((a) => (
                        <button
                          key={a.id}
                          style={styles.athletePickOption}
                          onClick={() => {
                            setBulkAthleteId(a.id);
                            setBulkAthleteSearch(a.name);
                          }}
                        >
                          {a.name}
                        </button>
                      ));
                    })()}
                  </div>
                )}
                <div style={styles.fieldLabel}>Start date</div>
                <input
                  type="date"
                  value={bulkStartDate}
                  onChange={(e) => setBulkStartDate(e.target.value)}
                  style={styles.modalInput}
                />
                <p style={styles.hint}>
                  {weekStart
                    ? `Pick the Monday of week 1 - every session lands on its own weekday from there.${bulkStartDate && dayOf(Math.round((Date.parse(bulkStartDate + "T12:00:00Z") / 86400000) + 3)) !== 0 ? " (That date isn't a Monday, so sessions shift to match it.)" : ""}`
                    : "Sessions load with the exact day pattern they were saved with (including rest days) - the first one lands on the start date above. You can switch to fixed spacing instead on the next step."}
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button style={{ ...styles.ghostBtn, flex: 1 }} onClick={() => setBulkLoadOpen(false)}>
                    Cancel
                  </button>
                  <button
                    disabled={!bulkAthleteId}
                    style={{ ...styles.primaryBtn, flex: 2, opacity: bulkAthleteId ? 1 : 0.5 }}
                    onClick={handleBuildPreview}
                  >
                    Preview →
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={styles.modalTitle}>
                  Load {bulkScheduled.length} session{bulkScheduled.length === 1 ? "" : "s"} for{" "}
                  {athletes.find((a) => a.id === bulkAthleteId)?.name ?? "athlete"}
                </div>
                <p style={styles.hint}>
                  These dates are for this load only - the saved programme isn&apos;t changed.
                </p>
                <label style={styles.selectAllRow}>
                  <input
                    type="checkbox"
                    checked={bulkUseCustomSpacing}
                    onChange={(e) => setBulkUseCustomSpacing(e.target.checked)}
                    style={styles.checkbox}
                  />
                  Use fixed spacing instead of the original day pattern
                </label>
                {bulkUseCustomSpacing && (
                  <select
                    value={bulkSpacingDays}
                    onChange={(e) => setBulkSpacingDays(Number(e.target.value))}
                    style={styles.modalInput}
                  >
                    <option value={1}>Every day</option>
                    <option value={2}>Every 2 days</option>
                    <option value={3}>Every 3 days</option>
                    <option value={7}>Weekly</option>
                  </select>
                )}
                <div style={styles.scheduleList}>
                  {bulkScheduled.map((row) => (
                    <div key={row.session.id} style={styles.scheduleRow}>
                      <div style={styles.scheduleName}>{row.session.name}</div>
                      <div style={styles.scheduleDate}>{formatScheduleDate(row.date)}</div>
                      <button
                        style={styles.smallDeleteBtn}
                        onClick={() => handleRemoveFromBulkPreview(row.session.id)}
                        title="Remove from this load"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {!bulkScheduled.length && <div style={styles.emptySmall}>No sessions left to load.</div>}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button style={{ ...styles.ghostBtn, flex: 1 }} onClick={() => setBulkLoadOpen(false)}>
                    Cancel
                  </button>
                  <button
                    disabled={!bulkScheduled.length || bulkSaving}
                    style={{ ...styles.primaryBtn, flex: 2, opacity: bulkScheduled.length && !bulkSaving ? 1 : 0.5 }}
                    onClick={handleGenerateBulkLoad}
                  >
                    {bulkSaving ? "Generating…" : "Generate programme"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {addAt && (
        <AddTemplateModal
          templates={templates}
          weeks={weeks}
          at={addAt === "toolbar" ? null : addAt}
          onClose={() => setAddAt(null)}
          onAdd={handleAddPlan}
          onBlank={handleBlank}
        />
      )}
      {copyFrom && (
        <CopyModal
          title={copyFrom.title}
          weeks={weeks}
          sourceWeeks={copyFrom.weeks}
          allowDay={copyFrom.allowDay}
          onClose={() => setCopyFrom(null)}
          onCopy={handleCopy}
        />
      )}
      {progressionOpen && (
        <ProgressionModal sessions={selectedSessions} onClose={() => setProgressionOpen(false)} onApply={handleApplyProgression} />
      )}
      {activeSession && (
        <div style={styles.drawerBackdrop} onClick={() => setActiveSessionId(null)}>
          <div style={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <ProgrammeSessionEditor
              key={activeSession.id}
              session={activeSession}
              library={library}
              onChange={(patch) => editSession(activeSession.id, patch)}
              onClose={() => setActiveSessionId(null)}
              onDuplicate={async () => {
                const [added] = await addDrafts([copySessionDraft(activeSession, activeSession.day_offset, 0)], "Duplicated");
                if (added) setActiveSessionId(added.id);
              }}
              onDelete={() => removeSessions([activeSession.id], `"${activeSession.name}"`)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1200 },
  backLink: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 16 },
  flashBox: { background: "var(--good-dim)", border: "1px solid var(--good)", color: "var(--good)", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16 },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16 },
  empty: { color: "var(--mute)", fontSize: 14, padding: "40px 0", textAlign: "center" },
  emptySmall: { color: "var(--mute)", fontSize: 13, padding: "10px 0" },
  nameInput: { width: "100%", background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "10px 14px", fontSize: 18, fontWeight: 700, marginBottom: 8 },
  descInput: { width: "100%", background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "10px 14px", fontSize: 13, minHeight: 60, marginBottom: 16 },
  toolbar: { display: "flex", gap: 8, marginBottom: 20 },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" },
  section: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionHeadRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 10 },
  layout: { display: "flex", gap: 16 },
  sessionListCol: { width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 },
  selectAllRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: "var(--mute)", padding: "0 2px 2px", cursor: "pointer" },
  checkbox: { width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 },
  sessionRow: { display: "flex", alignItems: "center", gap: 8, background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", cursor: "pointer" },
  sessionRowActive: { boxShadow: "inset 0 0 0 1px var(--accent)" },
  sessionName: { fontWeight: 700, fontSize: 13, color: "var(--text)" },
  sessionMeta: { fontSize: 11, color: "var(--mute)", marginTop: 2, textTransform: "capitalize" },
  smallBtn: { background: "var(--accent-dim)", border: "none", color: "var(--accent)", borderRadius: 7, padding: "7px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  smallDeleteBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 16, cursor: "pointer" },
  addBtn: { width: "100%", background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 8, padding: "9px 0", fontSize: 13, cursor: "pointer" },
  editorCol: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 },
  editorToolbar: { display: "flex", justifyContent: "flex-end" },
  athletePickList: { display: "flex", flexDirection: "column", gap: 2, maxHeight: 180, overflowY: "auto", background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: 4, marginBottom: 4 },
  athletePickOption: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 6, border: "none", background: "transparent", color: "var(--text)", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  templateOptionMeta: { fontSize: 11, color: "var(--mute)", fontWeight: 400, textTransform: "none" },
  assignedList: { display: "flex", flexDirection: "column", gap: 6 },
  assignedRow: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--ink)", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "var(--text)" },
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 360 },
  modalTitle: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 14 },
  fieldLabel: { fontSize: 11, color: "var(--mute)", marginBottom: 4, fontWeight: 600 },
  modalInput: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14, marginBottom: 12 },
  modalRow: { display: "flex", gap: 10 },
  primaryBtn: { width: "100%", background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  hint: { fontSize: 12, color: "var(--mute)", lineHeight: 1.5, margin: "-6px 0 12px" },
  scheduleList: { display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" },
  scheduleRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8 },
  scheduleName: { flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text)" },
  scheduleDate: { fontSize: 12, color: "var(--mute)", flexShrink: 0 },
  weeksBox: { display: "flex", alignItems: "center", gap: 8, background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "3px 6px" },
  stepBtn: { background: "transparent", border: "none", color: "var(--text)", fontSize: 16, fontWeight: 700, cursor: "pointer", padding: "0 6px" },
  actionBar: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: "var(--accent-dim)", border: "1px solid var(--accent)", borderRadius: 10, padding: "8px 10px", marginBottom: 10, position: "sticky", top: 8, zIndex: 5 },
  linkBtn: { background: "none", border: "none", color: "var(--mute)", fontSize: 12, cursor: "pointer", marginLeft: "auto" },
  drawerBackdrop: { position: "fixed", inset: 0, background: "rgba(6,9,12,.45)", zIndex: 65, display: "flex", justifyContent: "flex-end" },
  drawer: { width: "min(640px, 100%)", height: "100%", overflowY: "auto", background: "var(--bg)", borderLeft: "1px solid var(--line)", padding: 14, boxSizing: "border-box" },
};
