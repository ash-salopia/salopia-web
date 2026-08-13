"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  getTemplate,
  updateTemplate,
  deleteTemplate,
  deleteTemplateDef,
  loadTemplateForAthlete,
} from "@/lib/data/templates";
import { createProgrammeFromTemplate } from "@/lib/data/programmes";
import { listAthletes } from "@/lib/data/athletes";
import { todayISO } from "@/lib/date-utils";
import SessionDefView from "@/components/SessionDefView";
import type { Template, Athlete } from "@/types";

export default function TemplateDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const templateId = params.id;

  const [template, setTemplate] = useState<Template | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [activeDefId, setActiveDefId] = useState<string | null>(null);
  const [loadOpen, setLoadOpen] = useState(false);
  const [loadAthleteId, setLoadAthleteId] = useState("");
  const [loadAthleteSearch, setLoadAthleteSearch] = useState("");
  const [loadStart, setLoadStart] = useState(todayISO());
  const [loadEnd, setLoadEnd] = useState(todayISO());
  const [loadingOnto, setLoadingOnto] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [t, a] = await Promise.all([getTemplate(templateId), listAthletes()]);
      setTemplate(t);
      setAthletes(a);
      if (t?.defs?.length && !activeDefId) setActiveDefId(t.defs[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load template");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (templateId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(""), 3000);
  };

  const handleNameChange = async (name: string) => {
    setTemplate((prev) => (prev ? { ...prev, name } : prev));
    try {
      await updateTemplate(templateId, { name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  };

  const handleDeleteDef = async (defId: string) => {
    if (!confirm("Remove this session from the template?")) return;
    try {
      await deleteTemplateDef(defId);
      setTemplate((prev) =>
        prev ? { ...prev, defs: prev.defs?.filter((d) => d.id !== defId) } : prev
      );
      if (activeDefId === defId) setActiveDefId(template?.defs?.[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove session");
    }
  };

  const handleDeleteTemplate = async () => {
    if (!confirm(`Delete template "${template?.name}"? This can't be undone.`)) return;
    try {
      await deleteTemplate(templateId);
      router.push("/templates");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete template");
    }
  };

  const handleAddToProgLib = async () => {
    if (!template) return;
    try {
      await createProgrammeFromTemplate(template);
      showFlash(`Added "${template.name}" to Programme Library`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add to Programme Library");
    }
  };

  const handleLoadOntoAthlete = async () => {
    if (!loadAthleteId || !loadStart || !loadEnd) return;
    setLoadingOnto(true);
    setError("");
    try {
      const result = await loadTemplateForAthlete(templateId, loadAthleteId, loadStart, loadEnd);
      const athlete = athletes.find((a) => a.id === loadAthleteId);
      showFlash(
        `Loaded ${result.sessionsCreated} session${result.sessionsCreated !== 1 ? "s" : ""} for ${athlete?.name ?? "athlete"}`
      );
      setLoadOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load onto athlete");
    } finally {
      setLoadingOnto(false);
    }
  };

  if (loading) return <div style={styles.empty}>Loading…</div>;
  if (error && !template) return <div style={styles.errorBox}>{error}</div>;
  if (!template) return <div style={styles.empty}>Template not found.</div>;

  const activeDef = template.defs?.find((d) => d.id === activeDefId) ?? null;
  const filteredAthletes = athletes.filter((a) =>
    a.name.toLowerCase().includes(loadAthleteSearch.trim().toLowerCase())
  );

  return (
    <div style={styles.page}>
      <button style={styles.backLink} onClick={() => router.push("/templates")}>
        ← All templates
      </button>

      {flash && <div style={styles.flashBox}>{flash}</div>}
      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.metaRow}>
        <input
          value={template.name}
          onChange={(e) => handleNameChange(e.target.value)}
          style={styles.nameInput}
        />
      </div>

      <div style={styles.toolbar}>
        <button
          style={styles.primaryBtn}
          onClick={() => {
            setLoadAthleteId("");
            setLoadAthleteSearch("");
            setLoadStart(todayISO());
            setLoadEnd(todayISO());
            setLoadOpen(true);
          }}
        >
          Load onto athlete
        </button>
        <button style={styles.ghostBtn} onClick={handleAddToProgLib}>
          Add to Programme Library
        </button>
        <button style={styles.ghostBtn} onClick={handleDeleteTemplate}>
          Delete template
        </button>
      </div>

      <div style={styles.layout}>
        <div style={styles.defList}>
          {(template.defs ?? []).map((d) => (
            <div
              key={d.id}
              style={{ ...styles.defRow, ...(d.id === activeDefId ? styles.defRowActive : {}) }}
              onClick={() => setActiveDefId(d.id)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.defName}>{d.name}</div>
                <div style={styles.defMeta}>{d.type}</div>
              </div>
              <button
                style={styles.smallDeleteBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteDef(d.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
          {!(template.defs ?? []).length && (
            <div style={styles.emptySmall}>
              No sessions left in this template. Delete it and save a fresh one from an athlete&apos;s
              session builder.
            </div>
          )}
        </div>

        {activeDef && <SessionDefView key={activeDef.id} def={activeDef} />}
      </div>

      {loadOpen && (
        <div style={styles.overlay} onClick={() => setLoadOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>Load &quot;{template.name}&quot; onto an athlete</div>
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
                {filteredAthletes.length ? (
                  filteredAthletes.map((a) => (
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
                  ))
                ) : (
                  <div style={styles.emptySmall}>No athletes match &quot;{loadAthleteSearch}&quot;.</div>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
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
              Sessions with repeat days set will be added on every matching weekday in this range.
              Sessions with no repeat days are added once, on the start date.
            </p>
            <button
              disabled={!loadAthleteId || loadingOnto}
              style={{ ...styles.primaryBtnFull, opacity: loadAthleteId && !loadingOnto ? 1 : 0.5 }}
              onClick={handleLoadOntoAthlete}
            >
              {loadingOnto ? "Loading…" : "Load template"}
            </button>
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
  emptySmall: { color: "var(--mute)", fontSize: 12, padding: "10px 2px", lineHeight: 1.5 },
  metaRow: { marginBottom: 12 },
  nameInput: { background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "10px 14px", fontSize: 18, fontWeight: 700, width: "100%" },
  toolbar: { display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" },
  layout: { display: "flex", gap: 16 },
  defList: { width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 },
  defRow: { display: "flex", alignItems: "center", gap: 8, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", cursor: "pointer" },
  defRowActive: { boxShadow: "inset 0 0 0 1px var(--accent)" },
  defName: { fontWeight: 700, fontSize: 13, color: "var(--text)" },
  defMeta: { fontSize: 11, color: "var(--mute)", marginTop: 2, textTransform: "capitalize" },
  smallDeleteBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 16, cursor: "pointer" },
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 380 },
  modalTitle: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 14 },
  modalInput: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14, marginBottom: 12 },
  modalNote: { fontSize: 12, color: "var(--mute)", margin: "-4px 0 14px", lineHeight: 1.5 },
  fieldLabel: { fontSize: 11, color: "var(--mute)", marginBottom: 4, fontWeight: 600 },
  athletePickList: { display: "flex", flexDirection: "column", gap: 2, maxHeight: 180, overflowY: "auto", background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: 4, marginBottom: 12 },
  athletePickOption: { display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 6, border: "none", background: "transparent", color: "var(--text)", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  primaryBtnFull: { width: "100%", background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" },
};
