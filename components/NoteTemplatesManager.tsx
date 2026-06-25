"use client";

// ============================================================
// NoteTemplatesManager
// Embedded in the Templates page. Lets coaches create, edit,
// and delete session note templates (warm-up protocols,
// coaching cue sheets etc.) which appear in SessionNotesBlock.
// ============================================================

import { useState, useEffect } from "react";
import {
  listNoteTemplates, saveNoteTemplate,
  updateNoteTemplate, deleteNoteTemplate,
  type NoteTemplate,
} from "@/lib/data/note-templates";

const CATEGORIES: NoteTemplate["category"][] = ["general", "warm_up", "strength", "power_speed", "cardio"];
const CATEGORY_LABELS: Record<NoteTemplate["category"], string> = {
  general: "General",
  warm_up: "Warm-Up",
  strength: "Strength",
  power_speed: "Power / Speed",
  cardio: "Cardio",
};

export default function NoteTemplatesManager() {
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", content: "", category: "general" as NoteTemplate["category"] });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setTemplates(await listNoteTemplates());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load templates");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const t = await saveNoteTemplate({ name: form.name.trim(), content: form.content, category: form.category, sort_order: templates.length });
      setTemplates(prev => [...prev, t]);
      setCreating(false);
      setForm({ name: "", content: "", category: "general" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally { setSaving(false); }
  };

  const handleUpdate = async (t: NoteTemplate) => {
    setSaving(true);
    try {
      await updateNoteTemplate(t.id, { name: t.name, content: t.content, category: t.category });
      setTemplates(prev => prev.map(x => x.id === t.id ? t : x));
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await deleteNoteTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  };

  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = templates.filter(t => t.category === cat);
    return acc;
  }, {} as Record<string, NoteTemplate[]>);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div>
          <div style={s.title}>📋 Session Note Templates</div>
          <div style={s.subtitle}>These appear in the template picker inside Session Notes on any session.</div>
        </div>
        <button style={s.addBtn} onClick={() => { setCreating(true); setEditingId(null); }}>
          + New template
        </button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {/* Create form */}
      {creating && (
        <div style={s.formCard}>
          <div style={s.formTitle}>New note template</div>
          <div style={s.formRow}>
            <div style={{ flex: 2 }}>
              <div style={s.fieldLabel}>Name</div>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Sprint Warm-Up Protocol" style={s.input} autoFocus />
            </div>
            <div style={{ flex: 1 }}>
              <div style={s.fieldLabel}>Category</div>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as NoteTemplate["category"] }))} style={s.input}>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
          </div>
          <div style={s.fieldLabel}>Content</div>
          <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            placeholder="Paste or type your template content here…"
            rows={8} style={s.textarea} />
          <div style={s.formBtns}>
            <button style={s.cancelBtn} onClick={() => setCreating(false)}>Cancel</button>
            <button style={{ ...s.saveBtn, opacity: !form.name.trim() || saving ? 0.5 : 1 }}
              disabled={!form.name.trim() || saving} onClick={handleCreate}>
              {saving ? "Saving…" : "Save template"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : templates.length === 0 && !creating ? (
        <div style={s.empty}>No note templates yet. Create your first one above.</div>
      ) : (
        CATEGORIES.map(cat => {
          const group = grouped[cat];
          if (!group.length) return null;
          return (
            <div key={cat} style={s.group}>
              <div style={s.groupLabel}>{CATEGORY_LABELS[cat]}</div>
              {group.map(t => {
                const isEditing = editingId === t.id;
                return (
                  <div key={t.id} style={s.templateCard}>
                    {isEditing ? (
                      <EditForm
                        template={t}
                        saving={saving}
                        onSave={handleUpdate}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <>
                        <div style={s.templateHeader}>
                          <div style={s.templateName}>{t.name}</div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button style={s.editBtn} onClick={() => setEditingId(t.id)}>Edit</button>
                            <button style={s.deleteBtn} onClick={() => handleDelete(t.id, t.name)}>Delete</button>
                          </div>
                        </div>
                        <pre style={s.preview}>{t.content.slice(0, 200)}{t.content.length > 200 ? "…" : ""}</pre>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}

function EditForm({ template, saving, onSave, onCancel }: {
  template: NoteTemplate;
  saving: boolean;
  onSave: (t: NoteTemplate) => void;
  onCancel: () => void;
}) {
  const [t, setT] = useState(template);
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={t.name} onChange={e => setT(x => ({ ...x, name: e.target.value }))}
          style={s.input} />
        <select value={t.category} onChange={e => setT(x => ({ ...x, category: e.target.value as NoteTemplate["category"] }))}
          style={{ ...s.input, width: 140 }}>
          {(["general", "warm_up", "strength", "power_speed", "cardio"] as const).map(c => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </div>
      <textarea value={t.content} onChange={e => setT(x => ({ ...x, content: e.target.value }))}
        rows={8} style={s.textarea} />
      <div style={{ display: "flex", gap: 8 }}>
        <button style={s.cancelBtn} onClick={onCancel}>Cancel</button>
        <button style={{ ...s.saveBtn, opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={() => onSave(t)}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { marginTop: 32, borderTop: "1px solid var(--line)", paddingTop: 24 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  title: { fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 4 },
  subtitle: { fontSize: 12, color: "var(--mute)" },
  addBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  error: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 },
  empty: { color: "var(--mute)", fontSize: 13, padding: "16px 0" },
  group: { marginBottom: 20 },
  groupLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 },
  templateCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 8 },
  templateHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  templateName: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  preview: { fontSize: 11, color: "var(--mute)", fontFamily: "monospace", whiteSpace: "pre-wrap" as const, margin: 0, lineHeight: 1.5 },
  editBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" },
  deleteBtn: { background: "transparent", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" },
  formCard: { background: "var(--panel)", border: "1px solid var(--accent)44", borderRadius: 12, padding: 16, marginBottom: 16, display: "flex", flexDirection: "column" as const, gap: 10 },
  formTitle: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  formRow: { display: "flex", gap: 10 },
  fieldLabel: { fontSize: 11, color: "var(--mute)", fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 4 },
  input: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 13 },
  textarea: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 12, fontFamily: "monospace", resize: "vertical" as const, minHeight: 160 },
  formBtns: { display: "flex", gap: 8 },
  cancelBtn: { flex: 1, background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "9px 0", fontSize: 13, cursor: "pointer" },
  saveBtn: { flex: 2, background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "9px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" },
};
