"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  getProgramme,
  updateProgramme,
  deleteProgramme,
  deleteProgrammeSession,
  addTemplateDefsToProgramme,
  assignProgrammeToAthlete,
  unassignProgrammeFromAthlete,
  loadProgrammeSessionForAthlete,
  scheduleProgrammeSessions,
} from "@/lib/data/programmes";
import { listTemplates } from "@/lib/data/templates";
import { listAthletes } from "@/lib/data/athletes";
import { todayISO } from "@/lib/date-utils";
import SessionDefView from "@/components/SessionDefView";
import type { Programme, ProgrammeSession, Athlete, Template } from "@/types";

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
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [addFromTemplateOpen, setAddFromTemplateOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");

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
      if (p?.sessions?.length && !activeSessionId) setActiveSessionId(p.sessions[0].id);
      setSelectedSessionIds(new Set((p?.sessions ?? []).map((s) => s.id)));
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

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm("Remove this session from the programme?")) return;
    try {
      await deleteProgrammeSession(sessionId);
      setProgramme((prev) =>
        prev ? { ...prev, sessions: prev.sessions?.filter((s) => s.id !== sessionId) } : prev
      );
      setSelectedSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
      if (activeSessionId === sessionId) setActiveSessionId(programme?.sessions?.[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove session");
    }
  };

  const handleAddFromTemplate = async (template: Template) => {
    if (!programme) return;
    try {
      const added = await addTemplateDefsToProgramme(programmeId, template, programme.sessions?.length ?? 0);
      setProgramme((prev) => (prev ? { ...prev, sessions: [...(prev.sessions ?? []), ...added] } : prev));
      setSelectedSessionIds((prev) => new Set([...prev, ...added.map((s) => s.id)]));
      if (added.length) setActiveSessionId(added[0].id);
      setAddFromTemplateOpen(false);
      showFlash(`Added ${added.length} session${added.length === 1 ? "" : "s"} from "${template.name}"`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add from template");
    }
  };

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

  const toggleSelectAll = () => {
    const allIds = (programme?.sessions ?? []).map((s) => s.id);
    setSelectedSessionIds((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)));
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
    bulkUseCustomSpacing ? bulkSpacingDays : undefined
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
  const filteredTemplates = templates.filter((t) =>
    t.name.toLowerCase().includes(templateSearch.trim().toLowerCase())
  );

  return (
    <div style={styles.page}>
      <button style={styles.backLink} onClick={() => router.push("/programmes")}>
        ← All programmes
      </button>

      {flash && <div style={styles.flashBox}>{flash}</div>}
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
        <div style={styles.sectionTitle}>Sessions</div>
        <div style={styles.layout}>
          <div style={styles.sessionListCol}>
            {(programme.sessions ?? []).length > 0 && (
              <label style={styles.selectAllRow}>
                <input
                  type="checkbox"
                  checked={selectedSessionIds.size === (programme.sessions ?? []).length}
                  onChange={toggleSelectAll}
                  style={styles.checkbox}
                />
                Select all
              </label>
            )}
            {(programme.sessions ?? []).map((s) => (
              <div
                key={s.id}
                style={{ ...styles.sessionRow, ...(s.id === activeSessionId ? styles.sessionRowActive : {}) }}
                onClick={() => setActiveSessionId(s.id)}
              >
                <input
                  type="checkbox"
                  checked={selectedSessionIds.has(s.id)}
                  onChange={() => toggleSessionSelected(s.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={styles.checkbox}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.sessionName}>{s.name}</div>
                  <div style={styles.sessionMeta}>{s.type}</div>
                </div>
                <button
                  style={styles.smallDeleteBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSession(s.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            {!(programme.sessions ?? []).length && (
              <div style={styles.emptySmall}>No sessions yet.</div>
            )}
            <button style={styles.addBtn} onClick={() => { setAddFromTemplateOpen(true); setTemplateSearch(""); }}>
              + Add from template
            </button>
          </div>

          {activeSession && (
            <div style={styles.editorCol}>
              <div style={styles.editorToolbar}>
                <button
                  style={{ ...styles.smallBtn, opacity: selectedSessionIds.size ? 1 : 0.5 }}
                  disabled={!selectedSessionIds.size}
                  onClick={handleOpenBulkLoad}
                >
                  Load onto athlete{selectedSessionIds.size ? ` (${selectedSessionIds.size})` : ""}
                </button>
              </div>
              <SessionDefView key={activeSession.id} def={activeSession} />
            </div>
          )}
        </div>
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
                  Sessions load with the exact day pattern they were saved with (including rest
                  days) - the first one lands on the start date above. You can switch to fixed
                  spacing instead on the next step.
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

      {addFromTemplateOpen && (
        <div style={styles.overlay} onClick={() => setAddFromTemplateOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>Add from template</div>
            <input
              autoFocus
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              placeholder="Search templates…"
              style={styles.modalInput}
            />
            <div style={styles.athletePickList}>
              {templates.length === 0 ? (
                <div style={styles.emptySmall}>No templates yet - build one in the Template Library first.</div>
              ) : filteredTemplates.length === 0 ? (
                <div style={styles.emptySmall}>No templates match &quot;{templateSearch}&quot;.</div>
              ) : (
                filteredTemplates.map((t) => (
                  <button key={t.id} style={styles.athletePickOption} onClick={() => handleAddFromTemplate(t)}>
                    {t.name}
                    <span style={styles.templateOptionMeta}>
                      {(t.defs ?? []).length} session{(t.defs ?? []).length === 1 ? "" : "s"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900 },
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
};
