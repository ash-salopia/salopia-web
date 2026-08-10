"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  getTemplate,
  updateTemplate,
  deleteTemplate,
  addTemplateDef,
  updateTemplateDef,
  deleteTemplateDef,
} from "@/lib/data/templates";
import { createProgrammeFromTemplate } from "@/lib/data/programmes";
import SessionDefEditor from "@/components/SessionDefEditor";
import type { Template, TemplateDef } from "@/types";

export default function TemplateDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const templateId = params.id;

  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [activeDefId, setActiveDefId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const t = await getTemplate(templateId);
      setTemplate(t);
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

  const handleAddDef = async () => {
    if (!template) return;
    try {
      const def = await addTemplateDef(templateId, template.defs?.length ?? 0);
      setTemplate((prev) => (prev ? { ...prev, defs: [...(prev.defs ?? []), def] } : prev));
      setActiveDefId(def.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add session");
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

  const handleUpdateDef = async (defId: string, patch: Partial<TemplateDef>) => {
    setTemplate((prev) =>
      prev
        ? { ...prev, defs: prev.defs?.map((d) => (d.id === defId ? { ...d, ...patch } : d)) }
        : prev
    );
    try {
      await updateTemplateDef(defId, patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
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

  if (loading) return <div style={styles.empty}>Loading…</div>;
  if (error && !template) return <div style={styles.errorBox}>{error}</div>;
  if (!template) return <div style={styles.empty}>Template not found.</div>;

  const activeDef = template.defs?.find((d) => d.id === activeDefId) ?? null;

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
          <button style={styles.addDefBtn} onClick={handleAddDef}>
            + Add session
          </button>
        </div>

        {activeDef && (
          <SessionDefEditor
            key={activeDef.id}
            def={activeDef}
            onUpdate={(patch) => handleUpdateDef(activeDef.id, patch)}
          />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900 },
  backLink: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 16 },
  flashBox: { background: "var(--good-dim)", border: "1px solid var(--good)", color: "var(--good)", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16 },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16 },
  empty: { color: "var(--mute)", fontSize: 14, padding: "40px 0", textAlign: "center" },
  metaRow: { marginBottom: 12 },
  nameInput: { background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "10px 14px", fontSize: 18, fontWeight: 700, width: "100%" },
  toolbar: { display: "flex", gap: 8, marginBottom: 20 },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" },
  layout: { display: "flex", gap: 16 },
  defList: { width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 },
  defRow: { display: "flex", alignItems: "center", gap: 8, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", cursor: "pointer" },
  defRowActive: { boxShadow: "inset 0 0 0 1px var(--accent)" },
  defName: { fontWeight: 700, fontSize: 13, color: "var(--text)" },
  defMeta: { fontSize: 11, color: "var(--mute)", marginTop: 2, textTransform: "capitalize" },
  smallDeleteBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 16, cursor: "pointer" },
  addDefBtn: { background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 10, padding: "10px 0", fontSize: 13, cursor: "pointer" },
};
