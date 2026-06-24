"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listProgrammes, createProgramme, deleteProgramme } from "@/lib/data/programmes";
import VoiceSessionModal from "@/components/VoiceSessionModal";
import NotesProgrammeModal from "@/components/NotesProgrammeModal";
import type { Programme } from "@/types";

export default function ProgrammesPage() {
  const router = useRouter();
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setProgrammes(await listProgrammes());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load programmes");
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
      const p = await createProgramme();
      router.push(`/programmes/${p.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create programme");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (p: Programme) => {
    if (!confirm(`Delete programme "${p.name}"?`)) return;
    try {
      await deleteProgramme(p.id);
      setProgrammes((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete programme");
    }
  };

  const filtered = query.trim()
    ? programmes.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : programmes;

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Programme Library</h1>
          <p style={styles.subtitle}>
            Bundle sessions together and assign them to athletes as a labelled package.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.ghostBtn} onClick={() => setVoiceOpen(true)}>🎤 Voice</button>
          <button style={styles.ghostBtn} onClick={() => setNotesOpen(true)}>📝 Notes</button>
          <button style={styles.primaryBtn} disabled={creating} onClick={handleCreate}>
            {creating ? "Creating…" : "+ New programme"}
          </button>
        </div>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {programmes.length > 0 && (
        <input
          placeholder="Search programmes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...styles.input, marginBottom: 16, maxWidth: 320 }}
        />
      )}

      {loading ? (
        <div style={styles.empty}>Loading…</div>
      ) : !programmes.length ? (
        <div style={styles.empty}>
          No programmes yet. Create one above, or build a Template first and use &quot;Add to
          Programme Library&quot; from its page.
        </div>
      ) : !filtered.length ? (
        <div style={styles.empty}>No programmes match &quot;{query}&quot;.</div>
      ) : (
        <div style={styles.list}>
          {filtered.map((p) => (
            <div key={p.id} style={styles.row} onClick={() => router.push(`/programmes/${p.id}`)}>
              <div style={styles.rowAvatar}>📁</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.rowName}>{p.name}</div>
                <div style={styles.rowMeta}>
                  {p.sessions?.length ?? 0} session{(p.sessions?.length ?? 0) !== 1 ? "s" : ""} ·{" "}
                  {p.assigned_to?.length ?? 0} assigned
                </div>
              </div>
              <button
                style={styles.deleteBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(p);
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
          mode="programme"
          onClose={() => setVoiceOpen(false)}
        />
      )}
      {notesOpen && (
        <NotesProgrammeModal
          onCreated={() => { setNotesOpen(false); load(); }}
          onClose={() => setNotesOpen(false)}
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
    background: "#1a2840",
    color: "var(--blue)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    flexShrink: 0,
  },
  rowName: { fontWeight: 700, fontSize: 14, color: "var(--text)" },
  rowMeta: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  deleteBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer" },
};
