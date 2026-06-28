"use client";

import { useState, useEffect, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AthleteDocument {
  id: string;
  athlete_id: string;
  title: string;
  doc_type: "file" | "video_link";
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  video_url: string | null;
  notes: string | null;
  created_at: string;
}

interface Props {
  athleteId: string;
  athleteName: string;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mimeType: string | null): string {
  if (!mimeType) return "📄";
  if (mimeType === "application/pdf") return "📕";
  if (mimeType.includes("word")) return "📘";
  if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) return "📗";
  return "📄";
}

function videoIcon(url: string): string {
  if (url.includes("youtube") || url.includes("youtu.be")) return "▶️";
  if (url.includes("vimeo")) return "🎬";
  return "🔗";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DocumentsManager({ athleteId, athleteName, onClose }: Props) {
  const [docs, setDocs] = useState<AthleteDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"list" | "add-file" | "add-link">("list");
  const [saving, setSaving] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state — file
  const [fileTitle, setFileTitle] = useState("");
  const [fileNotes, setFileNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state — video link
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkNotes, setLinkNotes] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    fetch(`/api/documents?athlete_id=${athleteId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setDocs(d.documents ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [athleteId]);

  // ── File selection validation ───────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFileError("");
    if (!f) { setSelectedFile(null); return; }

    const ALLOWED = new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ]);

    if (!ALLOWED.has(f.type)) {
      setFileError("Only PDF, Word (.docx/.doc), and Excel (.xlsx/.xls) files are allowed.");
      setSelectedFile(null);
      return;
    }

    if (f.size > 10 * 1024 * 1024) {
      setFileError("File is too large — maximum size is 10 MB.");
      setSelectedFile(null);
      return;
    }

    setSelectedFile(f);
    if (!fileTitle) setFileTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  // ── Submit file ─────────────────────────────────────────────────────────────

  const handleFileSubmit = async () => {
    if (!selectedFile || !fileTitle.trim()) return;
    setSaving(true);
    setFileError("");

    const fd = new FormData();
    fd.append("athlete_id", athleteId);
    fd.append("title", fileTitle.trim());
    fd.append("notes", fileNotes.trim());
    fd.append("file", selectedFile);

    try {
      const r = await fetch("/api/documents", { method: "POST", body: fd });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setDocs((prev) => [d.document, ...prev]);
      setMode("list");
      setFileTitle(""); setFileNotes(""); setSelectedFile(null);
    } catch (e: any) {
      setFileError(e.message ?? "Upload failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Submit video link ───────────────────────────────────────────────────────

  const handleLinkSubmit = async () => {
    if (!linkTitle.trim() || !linkUrl.trim()) return;
    setSaving(true);
    setError("");

    try {
      const r = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athlete_id: athleteId,
          title: linkTitle.trim(),
          video_url: linkUrl.trim(),
          notes: linkNotes.trim(),
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setDocs((prev) => [d.document, ...prev]);
      setMode("list");
      setLinkTitle(""); setLinkUrl(""); setLinkNotes("");
    } catch (e: any) {
      setError(e.message ?? "Could not save link");
    } finally {
      setSaving(false);
    }
  };

  // ── Open a file (refresh signed URL first) ──────────────────────────────────

  const handleOpen = async (doc: AthleteDocument) => {
    if (doc.doc_type === "video_link" && doc.video_url) {
      window.open(doc.video_url, "_blank", "noopener");
      return;
    }
    setOpeningId(doc.id);
    try {
      const r = await fetch(`/api/documents/signed-url?id=${doc.id}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      window.open(d.url, "_blank", "noopener");
    } catch {
      setError("Could not open file — try again.");
    } finally {
      setOpeningId(null);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const r = await fetch(`/api/documents?id=${id}`, { method: "DELETE" });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setDocs((prev) => prev.filter((doc) => doc.id !== id));
    } catch (e: any) {
      setError(e.message ?? "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modal}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={s.headerTitle}>📁 Documents</div>
            <div style={s.headerSub}>{athleteName}</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error && <div style={s.errorBox}>{error}</div>}

        {/* ── List view ── */}
        {mode === "list" && (
          <>
            <div style={s.addRow}>
              <button style={s.addBtn} onClick={() => setMode("add-file")}>
                ⬆ Upload file
              </button>
              <button style={s.addBtn} onClick={() => setMode("add-link")}>
                🔗 Add video link
              </button>
            </div>

            {loading ? (
              <div style={s.empty}>Loading…</div>
            ) : docs.length === 0 ? (
              <div style={s.empty}>
                <div style={s.emptyIcon}>📂</div>
                <div style={s.emptyText}>No documents yet</div>
                <div style={s.emptyDesc}>
                  Upload PDFs, Word docs, or Excel files, or add links to training videos.
                </div>
              </div>
            ) : (
              <div style={s.list}>
                {docs.map((doc) => (
                  <div key={doc.id} style={s.docRow}>
                    <div style={s.docIcon}>
                      {doc.doc_type === "file"
                        ? fileIcon(doc.mime_type)
                        : videoIcon(doc.video_url ?? "")}
                    </div>
                    <div style={s.docInfo}>
                      <div style={s.docTitle}>{doc.title}</div>
                      <div style={s.docMeta}>
                        {doc.doc_type === "file" && doc.file_name && (
                          <span>{doc.file_name}{doc.file_size ? ` · ${formatBytes(doc.file_size)}` : ""} · </span>
                        )}
                        {doc.doc_type === "video_link" && (
                          <span>Video link · </span>
                        )}
                        <span>{formatDate(doc.created_at)}</span>
                      </div>
                      {doc.notes && <div style={s.docNotes}>{doc.notes}</div>}
                    </div>
                    <div style={s.docActions}>
                      <button
                        style={s.openBtn}
                        onClick={() => handleOpen(doc)}
                        disabled={openingId === doc.id}
                      >
                        {openingId === doc.id ? "…" : "Open"}
                      </button>
                      <button
                        style={s.deleteBtn}
                        onClick={() => handleDelete(doc.id)}
                        disabled={deletingId === doc.id}
                      >
                        {deletingId === doc.id ? "…" : "✕"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Add file view ── */}
        {mode === "add-file" && (
          <div style={s.form}>
            <div style={s.formTitle}>Upload file</div>
            <div style={s.formDesc}>
              PDF, Word (.docx/.doc), or Excel (.xlsx/.xls) — max 10 MB
            </div>

            {/* Drop zone */}
            <div
              style={{
                ...s.dropZone,
                ...(selectedFile ? s.dropZoneActive : {}),
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) {
                  const fakeEvent = { target: { files: [f] } } as any;
                  handleFileChange(fakeEvent);
                }
              }}
            >
              {selectedFile ? (
                <>
                  <div style={s.dropIcon}>{fileIcon(selectedFile.type)}</div>
                  <div style={s.dropName}>{selectedFile.name}</div>
                  <div style={s.dropSize}>{formatBytes(selectedFile.size)}</div>
                </>
              ) : (
                <>
                  <div style={s.dropIcon}>📄</div>
                  <div style={s.dropText}>Click to choose a file or drag it here</div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
            </div>

            {fileError && <div style={s.fieldError}>{fileError}</div>}

            <label style={s.label}>Title</label>
            <input
              style={s.input}
              value={fileTitle}
              onChange={(e) => setFileTitle(e.target.value)}
              placeholder="e.g. Strength Programme Q1"
            />

            <label style={s.label}>Note (optional)</label>
            <textarea
              style={s.textarea}
              value={fileNotes}
              onChange={(e) => setFileNotes(e.target.value)}
              placeholder="Any context for the athlete…"
              rows={2}
            />

            <div style={s.formBtns}>
              <button style={s.cancelBtn} onClick={() => { setMode("list"); setFileError(""); setSelectedFile(null); setFileTitle(""); setFileNotes(""); }}>
                Cancel
              </button>
              <button
                style={{ ...s.saveBtn, opacity: (!selectedFile || !fileTitle.trim() || saving) ? 0.5 : 1 }}
                disabled={!selectedFile || !fileTitle.trim() || saving}
                onClick={handleFileSubmit}
              >
                {saving ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        )}

        {/* ── Add video link view ── */}
        {mode === "add-link" && (
          <div style={s.form}>
            <div style={s.formTitle}>Add video link</div>
            <div style={s.formDesc}>
              YouTube, Vimeo, or any video URL
            </div>

            <label style={s.label}>Title</label>
            <input
              style={s.input}
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
              placeholder="e.g. Squat technique reference"
            />

            <label style={s.label}>URL</label>
            <input
              style={s.input}
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=…"
              type="url"
            />

            <label style={s.label}>Note (optional)</label>
            <textarea
              style={s.textarea}
              value={linkNotes}
              onChange={(e) => setLinkNotes(e.target.value)}
              placeholder="Any context for the athlete…"
              rows={2}
            />

            <div style={s.formBtns}>
              <button style={s.cancelBtn} onClick={() => { setMode("list"); setLinkTitle(""); setLinkUrl(""); setLinkNotes(""); }}>
                Cancel
              </button>
              <button
                style={{ ...s.saveBtn, opacity: (!linkTitle.trim() || !linkUrl.trim() || saving) ? 0.5 : 1 }}
                disabled={!linkTitle.trim() || !linkUrl.trim() || saving}
                onClick={handleLinkSubmit}
              >
                {saving ? "Saving…" : "Save link"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 200, padding: 16,
  },
  modal: {
    background: "var(--panel)", border: "1px solid var(--line)",
    borderRadius: 16, width: "100%", maxWidth: 560,
    maxHeight: "85vh", display: "flex", flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "18px 20px 14px", borderBottom: "1px solid var(--line)",
    flexShrink: 0,
  },
  headerTitle: { fontSize: 18, fontWeight: 700, color: "var(--text)" },
  headerSub: { fontSize: 13, color: "var(--mute)", marginTop: 2 },
  closeBtn: {
    background: "transparent", border: "none", color: "var(--mute)",
    fontSize: 18, cursor: "pointer", padding: 4,
  },
  errorBox: {
    background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B",
    borderRadius: 8, padding: "10px 16px", fontSize: 13, margin: "12px 20px 0",
    flexShrink: 0,
  },
  addRow: {
    display: "flex", gap: 8, padding: "14px 20px 10px", flexShrink: 0,
  },
  addBtn: {
    flex: 1, background: "var(--ink)", border: "1px solid var(--line)",
    color: "var(--text)", borderRadius: 10, padding: "10px 14px",
    fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  list: {
    overflowY: "auto", padding: "0 20px 20px", display: "flex",
    flexDirection: "column", gap: 8,
  },
  docRow: {
    display: "flex", alignItems: "flex-start", gap: 12,
    background: "var(--ink)", border: "1px solid var(--line)",
    borderRadius: 10, padding: "12px 14px",
  },
  docIcon: { fontSize: 22, flexShrink: 0, marginTop: 1 },
  docInfo: { flex: 1, minWidth: 0 },
  docTitle: { fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 3 },
  docMeta: { fontSize: 11, color: "var(--mute)" },
  docNotes: {
    fontSize: 12, color: "var(--mute)", marginTop: 4,
    fontStyle: "italic", lineHeight: 1.4,
  },
  docActions: { display: "flex", gap: 6, alignItems: "center", flexShrink: 0 },
  openBtn: {
    background: "var(--accent-dim)", border: "1px solid var(--accent)",
    color: "var(--accent)", borderRadius: 6, padding: "5px 12px",
    fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
  deleteBtn: {
    background: "transparent", border: "1px solid var(--line)",
    color: "#FF6B6B", borderRadius: 6, padding: "5px 8px",
    fontSize: 12, cursor: "pointer",
  },
  empty: {
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "40px 20px", gap: 8,
  },
  emptyIcon: { fontSize: 36, marginBottom: 4 },
  emptyText: { fontSize: 15, fontWeight: 600, color: "var(--text)" },
  emptyDesc: { fontSize: 13, color: "var(--mute)", textAlign: "center", lineHeight: 1.5 },
  // Form
  form: {
    padding: "16px 20px 20px", display: "flex", flexDirection: "column",
    gap: 10, overflowY: "auto",
  },
  formTitle: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  formDesc: { fontSize: 12, color: "var(--mute)" },
  label: { fontSize: 12, fontWeight: 600, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  input: {
    background: "var(--ink)", border: "1px solid var(--line)",
    color: "var(--text)", borderRadius: 8, padding: "10px 12px",
    fontSize: 14, fontFamily: "inherit",
  },
  textarea: {
    background: "var(--ink)", border: "1px solid var(--line)",
    color: "var(--text)", borderRadius: 8, padding: "10px 12px",
    fontSize: 13, fontFamily: "inherit", resize: "vertical" as const,
  },
  dropZone: {
    border: "2px dashed var(--line)", borderRadius: 12,
    padding: "24px 16px", display: "flex", flexDirection: "column",
    alignItems: "center", gap: 6, cursor: "pointer",
    transition: "border-color 0.2s",
  },
  dropZoneActive: { borderColor: "var(--accent)", background: "var(--accent-dim)" },
  dropIcon: { fontSize: 28 },
  dropText: { fontSize: 13, color: "var(--mute)", textAlign: "center" as const },
  dropName: { fontSize: 14, fontWeight: 600, color: "var(--text)" },
  dropSize: { fontSize: 12, color: "var(--mute)" },
  fieldError: {
    fontSize: 12, color: "#FF6B6B", background: "#2a0c0c",
    border: "1px solid #FF6B6B44", borderRadius: 6, padding: "6px 10px",
  },
  formBtns: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 },
  cancelBtn: {
    background: "transparent", border: "1px solid var(--line)",
    color: "var(--mute)", borderRadius: 8, padding: "10px 18px",
    fontSize: 13, cursor: "pointer",
  },
  saveBtn: {
    background: "var(--accent)", color: "#0a1420", border: "none",
    borderRadius: 8, padding: "10px 22px", fontSize: 13,
    fontWeight: 700, cursor: "pointer",
  },
};
