"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  getProgramme,
  updateProgramme,
  deleteProgramme,
  addProgrammeSession,
  updateProgrammeSession,
  deleteProgrammeSession,
  addTemplateDefsToProgramme,
  assignProgrammeToAthlete,
  unassignProgrammeFromAthlete,
  loadProgrammeSessionForAthlete,
} from "@/lib/data/programmes";
import { listTemplates } from "@/lib/data/templates";
import { listAthletes } from "@/lib/data/athletes";
import { todayISO } from "@/lib/date-utils";
import SessionDefEditor from "@/components/SessionDefEditor";
import type { Programme, ProgrammeSession, Athlete, Template } from "@/types";

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
  const [assignPickerOpen, setAssignPickerOpen] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [loadPickerSession, setLoadPickerSession] = useState<ProgrammeSession | null>(null);
  const [loadAthleteId, setLoadAthleteId] = useState("");
  const [loadAthleteSearch, setLoadAthleteSearch] = useState("");
  const [loadDate, setLoadDate] = useState(todayISO());
  const [addFromTemplateOpen, setAddFromTemplateOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [p, a, t] = await Promise.all([getProgramme(programmeId), listAthletes(), listTemplates()]);
      setProgramme(p);
      setAthletes(a);
      setTemplates(t);
      if (p?.sessions?.length && !activeSessionId) setActiveSessionId(p.sessions[0].id);
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

  const handleAddSession = async () => {
    if (!programme) return;
    try {
      const s = await addProgrammeSession(programmeId, programme.sessions?.length ?? 0);
      setProgramme((prev) => (prev ? { ...prev, sessions: [...(prev.sessions ?? []), s] } : prev));
      setActiveSessionId(s.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add session");
    }
  };

  const handleUpdateSession = async (sessionId: string, patch: Partial<ProgrammeSession>) => {
    setProgramme((prev) =>
      prev
        ? { ...prev, sessions: prev.sessions?.map((s) => (s.id === sessionId ? { ...s, ...patch } : s)) }
        : prev
    );
    try {
      await updateProgrammeSession(sessionId, patch);
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

  const handleAssign = async (athleteId: string) => {
    try {
      await assignProgrammeToAthlete(programmeId, athleteId);
      setProgramme((prev) =>
        prev ? { ...prev, assigned_to: [...(prev.assigned_to ?? []), athleteId] } : prev
      );
      const athlete = athletes.find((a) => a.id === athleteId);
      showFlash(`Assigned to ${athlete?.name ?? "athlete"}`);
      setAssignPickerOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign");
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

  const handleLoadSession = async () => {
    if (!loadPickerSession || !loadAthleteId) return;
    try {
      await loadProgrammeSessionForAthlete(loadPickerSession, loadAthleteId, loadDate);
      const athlete = athletes.find((a) => a.id === loadAthleteId);
      showFlash(`"${loadPickerSession.name}" loaded for ${athlete?.name ?? "athlete"}`);
      setLoadPickerSession(null);
      setLoadAthleteId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load session");
    }
  };

  if (loading) return <div style={styles.empty}>Loading…</div>;
  if (error && !programme) return <div style={styles.errorBox}>{error}</div>;
  if (!programme) return <div style={styles.empty}>Programme not found.</div>;

  const assignedAthletes = athletes.filter((a) => programme.assigned_to?.includes(a.id));
  const unassignedAthletes = athletes.filter((a) => !programme.assigned_to?.includes(a.id));
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
            {(programme.sessions ?? []).map((s) => (
              <div
                key={s.id}
                style={{ ...styles.sessionRow, ...(s.id === activeSessionId ? styles.sessionRowActive : {}) }}
                onClick={() => setActiveSessionId(s.id)}
              >
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
            <button style={styles.addBtn} onClick={handleAddSession}>
              + Add session
            </button>
            <button style={styles.addBtn} onClick={() => { setAddFromTemplateOpen(true); setTemplateSearch(""); }}>
              + Add from template
            </button>
          </div>

          {activeSession && (
            <div style={styles.editorCol}>
              <div style={styles.editorToolbar}>
                <button
                  style={styles.smallBtn}
                  onClick={() => {
                    setLoadPickerSession(activeSession);
                    setLoadAthleteId("");
                    setLoadAthleteSearch("");
                    setLoadDate(todayISO());
                  }}
                >
                  Load onto athlete
                </button>
              </div>
              <SessionDefEditor
                key={activeSession.id}
                def={activeSession}
                onUpdate={(patch) => handleUpdateSession(activeSession.id, patch)}
              />
            </div>
          )}
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeadRow}>
          <div style={styles.sectionTitle}>Assigned athletes</div>
          <div style={{ position: "relative" }}>
            <button
              style={styles.smallBtn}
              onClick={() => {
                setAssignPickerOpen((v) => !v);
                setAssignSearch("");
              }}
            >
              + Assign
            </button>
            {assignPickerOpen && (
              <div style={styles.assignPopover}>
                {unassignedAthletes.length > 0 && (
                  <input
                    autoFocus
                    value={assignSearch}
                    onChange={(e) => setAssignSearch(e.target.value)}
                    placeholder="Search athletes…"
                    style={styles.pickerSearchInput}
                  />
                )}
                {unassignedAthletes.length ? (
                  (() => {
                    const filtered = unassignedAthletes.filter((a) =>
                      a.name.toLowerCase().includes(assignSearch.trim().toLowerCase())
                    );
                    return filtered.length ? (
                      filtered.map((a) => (
                        <button key={a.id} style={styles.assignOption} onClick={() => handleAssign(a.id)}>
                          {a.name}
                        </button>
                      ))
                    ) : (
                      <div style={styles.emptySmall}>No athletes match &quot;{assignSearch}&quot;.</div>
                    );
                  })()
                ) : (
                  <div style={styles.emptySmall}>All athletes already assigned.</div>
                )}
              </div>
            )}
          </div>
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

      {loadPickerSession && (
        <div style={styles.overlay} onClick={() => setLoadPickerSession(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>Load &quot;{loadPickerSession.name}&quot;</div>
            <div style={styles.fieldLabel}>Athlete</div>
            <input
              value={loadAthleteSearch}
              onChange={(e) => {
                setLoadAthleteSearch(e.target.value);
                setLoadAthleteId("");
              }}
              placeholder="Search athletes…"
              style={styles.modalInput}
            />
            {!loadAthleteId && (
              <div style={styles.athletePickList}>
                {(() => {
                  const filtered = athletes.filter((a) =>
                    a.name.toLowerCase().includes(loadAthleteSearch.trim().toLowerCase())
                  );
                  if (!filtered.length) {
                    return <div style={styles.emptySmall}>No athletes match &quot;{loadAthleteSearch}&quot;.</div>;
                  }
                  return filtered.map((a) => (
                    <button
                      key={a.id}
                      style={styles.athletePickOption}
                      onClick={() => {
                        setLoadAthleteId(a.id);
                        setLoadAthleteSearch(a.name);
                      }}
                    >
                      {a.name}
                    </button>
                  ));
                })()}
              </div>
            )}
            <div style={styles.fieldLabel}>Date</div>
            <input
              type="date"
              value={loadDate}
              onChange={(e) => setLoadDate(e.target.value)}
              style={styles.modalInput}
            />
            <button
              disabled={!loadAthleteId}
              style={{ ...styles.primaryBtn, opacity: loadAthleteId ? 1 : 0.5, marginTop: 14 }}
              onClick={handleLoadSession}
            >
              Load session
            </button>
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
  sessionRow: { display: "flex", alignItems: "center", gap: 8, background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", cursor: "pointer" },
  sessionRowActive: { boxShadow: "inset 0 0 0 1px var(--accent)" },
  sessionName: { fontWeight: 700, fontSize: 13, color: "var(--text)" },
  sessionMeta: { fontSize: 11, color: "var(--mute)", marginTop: 2, textTransform: "capitalize" },
  smallBtn: { background: "var(--accent-dim)", border: "none", color: "var(--accent)", borderRadius: 7, padding: "7px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  smallDeleteBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 16, cursor: "pointer" },
  addBtn: { width: "100%", background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 8, padding: "9px 0", fontSize: 13, cursor: "pointer" },
  editorCol: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 },
  editorToolbar: { display: "flex", justifyContent: "flex-end" },
  assignPopover: { position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 20, background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 10, padding: 6, minWidth: 200, maxHeight: 260, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" },
  assignOption: { display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", color: "var(--text)", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  pickerSearchInput: { width: "100%", boxSizing: "border-box", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 7, padding: "7px 9px", fontSize: 13, marginBottom: 6 },
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
  primaryBtn: { width: "100%", background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" },
};
