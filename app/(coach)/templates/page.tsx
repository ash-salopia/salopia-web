"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listTemplates, createTemplate, deleteTemplate } from "@/lib/data/templates";
import VoiceSessionModal from "@/components/VoiceSessionModal";
import NotesTemplateModal from "@/components/NotesTemplateModal";
import ImportTemplatesCsvModal from "@/components/ImportTemplatesCsvModal";
import NoteTemplatesManager from "@/components/NoteTemplatesManager";
import type { Template } from "@/types";

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setTemplates(await listTemplates());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const t = await createTemplate();
      router.push(`/templates/${t.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create template");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (t: Template) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    try {
      await deleteTemplate(t.id);
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete template");
    }
  };

  const filtered = query.trim()
    ? templates.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()))
    : templates;

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Template Library</h1>
          <p style={styles.subtitle}>
            Build reusable session structures. Set exercises and tick repeat days, then load onto an
            athlete from their page.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.ghostBtn} onClick={() => setVoiceOpen(true)}>🎤 Voice</button>
          <button style={styles.ghostBtn} onClick={() => setNotesOpen(true)}>📝 Notes</button>
          <button style={styles.ghostBtn} onClick={() => setCsvOpen(true)}>📄 Import CSV</button>
          <button style={styles.primaryBtn} disabled={creating} onClick={handleCreate}>
            {creating ? "Creating…" : "+ New template"}
          </button>
        </div>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {templates.length > 0 && (
        <input
          placeholder="Search templates…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...styles.input, marginBottom: 16, maxWidth: 320 }}
        />
      )}

      {loading ? (
        <div style={styles.empty}>Loading…</div>
      ) : !templates.length ? (
        <div style={styles.empty}>No templates yet. Create your first one above.</div>
      ) : !filtered.length ? (
        <div style={styles.empty}>No templates match &quot;{query}&quot;.</div>
      ) : (
        <div style={styles.list}>
          {filtered.map((t) => (
            <div key={t.id} style={styles.row} onClick={() => router.push(`/templates/${t.id}`)}>
              <div style={styles.rowAvatar}>▦</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.rowName}>{t.name}</div>
                <div style={styles.rowMeta}>
                  {t.defs?.length ?? 0} session{(t.defs?.length ?? 0) !== 1 ? "s" : ""}
                </div>
              </div>
              <button
                style={styles.deleteBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(t);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {voiceOpen && (
        <VoiceSessionModal
          mode="template"
          onClose={() => setVoiceOpen(false)}
        />
      )}
      {notesOpen && (
        <NotesTemplateModal
          onCreated={() => { setNotesOpen(false); load(); }}
          onClose={() => setNotesOpen(false)}
        />
      )}
      {csvOpen && (
        <ImportTemplatesCsvModal
          onCreated={() => { setCsvOpen(false); load(); }}
          onClose={() => setCsvOpen(false)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 700 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 16 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 13, color: "var(--mute)", marginTop: 4, maxWidth: 420 },
  primaryBtn: {
    background: "var(--accent)",
    color: "#0a1420",
    border: "none",
    borderRadius: 10,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  ghostBtn: {
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    borderRadius: 10,
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  input: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
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
  list: { display: "flex", flexDirection: "column", gap: 8 },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "12px 14px",
    cursor: "pointer",
  },
  rowAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "#16332a",
    color: "var(--good)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 14,
    flexShrink: 0,
  },
  rowName: { fontWeight: 700, fontSize: 14, color: "var(--text)" },
  rowMeta: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  deleteBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer" },
};
