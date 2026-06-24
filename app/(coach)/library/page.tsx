"use client";

import { useEffect, useState, useRef } from "react";
import { listLibrary, saveLibraryEntry, deleteLibraryEntry } from "@/lib/data/library";
import { importLibraryCsv } from "@/lib/library-csv-import";
import YouTubeImportDialog from "@/components/YouTubeImportDialog";
import VideoModal from "@/components/VideoModal";
import type { LibraryEntry } from "@/types";

export default function LibraryPage() {
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<LibraryEntry | null>(null);
  const [importing, setImporting] = useState(false);
  const [youtubeDialogOpen, setYoutubeDialogOpen] = useState(false);
  const [videoModal, setVideoModal] = useState<LibraryEntry | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listLibrary();
      setLibrary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load library");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (entry: LibraryEntry) => {
    if (!confirm(`Delete "${entry.name}" from the library?`)) return;
    try {
      await deleteLibraryEntry(entry.id);
      setLibrary((prev) => prev.filter((e) => e.id !== entry.id));
      if (selected?.id === entry.id) setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete entry");
    }
  };

  const handleSave = async (entry: Partial<LibraryEntry> & { name: string }) => {
    try {
      const saved = await saveLibraryEntry(entry);
      setLibrary((prev) => {
        const exists = prev.some((e) => e.id === saved.id);
        const next = exists ? prev.map((e) => (e.id === saved.id ? saved : e)) : [...prev, saved];
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
      setSelected(saved);
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save entry");
    }
  };

  const handleCsvImport = async (file: File) => {
    setImporting(true);
    setError("");
    try {
      const result = await importLibraryCsv(file);
      // Re-fetch rather than try to merge results in manually — a
      // bulk import can touch many rows at once (new + updated mixed
      // together), and a clean reload is simpler and less error-prone
      // than reconciling that locally.
      await load();
      const parts: string[] = [];
      if (result.created > 0) parts.push(`${result.created} added`);
      if (result.updated > 0) parts.push(`${result.updated} updated`);
      if (result.skipped > 0) parts.push(`${result.skipped} skipped (no name)`);
      setFlash(parts.length ? parts.join(", ") : "Nothing to import");
      setTimeout(() => setFlash(""), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import CSV");
    } finally {
      setImporting(false);
    }
  };

  const filtered = query.trim()
    ? library.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()))
    : library;

  return (
    <div style={styles.page}>
      <div style={styles.layout}>
        <div style={styles.listPane}>
          <div style={styles.headerRow}>
            <h1 style={styles.title}>Exercise Library</h1>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/comma-separated-values,application/csv,application/vnd.ms-excel"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCsvImport(f);
                  e.target.value = "";
                }}
              />
              <button
                style={styles.ghostBtn}
                disabled={importing}
                onClick={() => fileRef.current?.click()}
              >
                {importing ? "Importing…" : "Import CSV"}
              </button>
              <button style={styles.ghostBtn} onClick={() => setYoutubeDialogOpen(true)}>
                Import from YouTube
              </button>
              <button
                style={styles.primaryBtn}
                onClick={() => {
                  setSelected(null);
                  setAdding(true);
                }}
              >
                + New
              </button>
            </div>
          </div>

          {flash && <div style={styles.flashBox}>{flash}</div>}
          {error && <div style={styles.errorBox}>{error}</div>}

          {library.length > 0 && (
            <input
              placeholder="Search exercises…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ ...styles.input, marginBottom: 14 }}
            />
          )}

          {loading ? (
            <div style={styles.empty}>Loading…</div>
          ) : !library.length ? (
            <div style={styles.empty}>
              No exercises yet. Save one with the video link and presets you want to reuse.
            </div>
          ) : !filtered.length ? (
            <div style={styles.empty}>No exercises match &quot;{query}&quot;.</div>
          ) : (
            <div style={styles.list}>
              {filtered.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    ...styles.row,
                    ...(selected?.id === entry.id ? styles.rowActive : {}),
                  }}
                  onClick={() => {
                    setSelected(entry);
                    setAdding(false);
                  }}
                >
                  <div
                    style={{ ...styles.rowAvatar, ...(entry.video_url ? styles.rowAvatarPlayable : {}) }}
                    onClick={(e) => {
                      if (!entry.video_url) return;
                      e.stopPropagation();
                      setVideoModal(entry);
                    }}
                  >
                    {entry.video_url ? "▶" : entry.name.slice(0, 1).toUpperCase() || "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.rowName}>{entry.name || "Untitled"}</div>
                    {entry.types.length > 0 && (
                      <div style={styles.rowTypes}>{entry.types.join(", ")}</div>
                    )}
                  </div>
                  <button
                    style={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(entry);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {(selected || adding) && (
          <LibraryEntryEditor
            key={selected?.id ?? "new"}
            entry={selected}
            onSave={handleSave}
            onClose={() => {
              setSelected(null);
              setAdding(false);
            }}
          />
        )}
      </div>

      {youtubeDialogOpen && (
        <YouTubeImportDialog
          onClose={() => setYoutubeDialogOpen(false)}
          onImported={async (count) => {
            setYoutubeDialogOpen(false);
            await load();
            setFlash(`${count} exercise${count !== 1 ? "s" : ""} imported from YouTube`);
            setTimeout(() => setFlash(""), 4000);
          }}
        />
      )}

      {videoModal && (
        <VideoModal
          videoUrl={videoModal.video_url}
          title={videoModal.name}
          onClose={() => setVideoModal(null)}
        />
      )}
    </div>
  );
}

function LibraryEntryEditor({
  entry,
  onSave,
  onClose,
}: {
  entry: LibraryEntry | null;
  onSave: (entry: Partial<LibraryEntry> & { name: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(entry?.name ?? "");
  const [videoUrl, setVideoUrl] = useState(entry?.video_url ?? "");
  const [sets, setSets] = useState(entry?.sets ?? "");
  const [reps, setReps] = useState(entry?.reps ?? "");
  const [rest, setRest] = useState(entry?.rest ?? "");
  const [targetLoad, setTargetLoad] = useState(entry?.target_load ?? "");
  const [tempo, setTempo] = useState(entry?.tempo ?? "2-0-2");
  const [notes, setNotes] = useState(entry?.notes ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: entry?.id,
      name: name.trim(),
      video_url: videoUrl.trim(),
      sets,
      reps,
      rest,
      target_load: targetLoad,
      tempo,
      notes,
    } as Partial<LibraryEntry> & { name: string });
  };

  return (
    <form onSubmit={handleSubmit} style={styles.editorPane}>
      <div style={styles.headerRow}>
        <h2 style={styles.editorTitle}>{entry ? "Edit exercise" : "New exercise"}</h2>
        <button type="button" style={styles.closeBtn} onClick={onClose}>
          ×
        </button>
      </div>
      <FieldRow label="Name">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={styles.input} />
      </FieldRow>
      <FieldRow label="Video URL">
        <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://..." style={styles.input} />
      </FieldRow>
      <div style={{ display: "flex", gap: 8 }}>
        <FieldRow label="Sets"><input value={sets} onChange={(e) => setSets(e.target.value)} style={styles.input} /></FieldRow>
        <FieldRow label="Reps"><input value={reps} onChange={(e) => setReps(e.target.value)} style={styles.input} /></FieldRow>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <FieldRow label="Rest"><input value={rest} onChange={(e) => setRest(e.target.value)} style={styles.input} /></FieldRow>
        <FieldRow label="Tempo">
          <input
            value={tempo}
            onChange={(e) => setTempo(e.target.value.replace(/[^0-9-]/g, ""))}
            style={styles.input}
          />
        </FieldRow>
      </div>
      <FieldRow label="Default load">
        <input value={targetLoad} onChange={(e) => setTargetLoad(e.target.value)} placeholder="e.g. 60kg" style={styles.input} />
      </FieldRow>
      <FieldRow label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...styles.input, minHeight: 70 }} />
      </FieldRow>
      <button type="submit" style={styles.primaryBtn}>
        Save
      </button>
    </form>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12, flex: 1 }}>
      <div style={styles.fieldLabel}>{label}</div>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000 },
  layout: { display: "flex", gap: 20 },
  listPane: { flex: 1, minWidth: 0 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, margin: 0 },
  editorTitle: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, margin: 0 },
  primaryBtn: {
    background: "var(--accent)",
    color: "#0a1420",
    border: "none",
    borderRadius: 10,
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
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
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer" },
  flashBox: {
    background: "var(--good-dim)",
    border: "1px solid var(--good)",
    color: "var(--good)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    marginBottom: 16,
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
  input: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
  },
  list: { display: "flex", flexDirection: "column", gap: 6 },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: 10,
    cursor: "pointer",
  },
  rowActive: { boxShadow: "inset 0 0 0 1px var(--accent)" },
  rowAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "var(--panel2)",
    color: "var(--mute)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 13,
    flexShrink: 0,
  },
  rowAvatarPlayable: {
    background: "var(--accent-dim)",
    color: "var(--accent)",
    cursor: "pointer",
  },
  rowName: { fontWeight: 700, fontSize: 14, color: "var(--text)" },
  rowTypes: { fontSize: 11, color: "var(--mute)", marginTop: 2 },
  deleteBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 16, cursor: "pointer" },
  editorPane: {
    width: 320,
    flexShrink: 0,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: 16,
    height: "fit-content",
  },
  fieldLabel: { fontSize: 11, color: "var(--mute)", marginBottom: 4, fontWeight: 600 },
};
