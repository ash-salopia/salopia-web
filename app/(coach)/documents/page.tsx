"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import { listGroups, listGroupMembers, type Group } from "@/lib/data/groups";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AthleteDoc {
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
  athlete?: { id: string; name: string };
}

interface Athlete {
  id: string;
  name: string;
  group?: string;
}

type FilterMode = "all" | "athlete" | "group";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const [docs, setDocs] = useState<AthleteDoc[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filter state
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedAthleteId, setSelectedAthleteId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [athleteSearch, setAthleteSearch] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<Set<string>>(new Set());

  // Add doc state
  const [addMode, setAddMode] = useState<null | "file" | "link" | "group-file" | "group-link">(null);
  const [saving, setSaving] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // File form
  const [fileTitle, setFileTitle] = useState("");
  const [fileNotes, setFileNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Link form
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkNotes, setLinkNotes] = useState("");

  // Target for add form
  const [addTargetAthleteId, setAddTargetAthleteId] = useState("");
  const [addTargetGroupId, setAddTargetGroupId] = useState("");
  const [addAthleteSearch, setAddAthleteSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [docsRes, athletesData, groupsData] = await Promise.all([
        fetch("/api/documents/all").then((r) => r.json()),
        createClient().from("athletes").select("id, name, group").eq("archived", false).order("name"),
        listGroups(),
      ]);
      if (docsRes.error) throw new Error(docsRes.error);
      setDocs(docsRes.documents ?? []);
      setAthletes(athletesData.data ?? []);
      setGroups(groupsData);
    } catch (e: any) {
      setError(e.message ?? "Could not load documents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Derived filtered docs ─────────────────────────────────────────────────

  const filteredDocs = docs.filter((doc) => {
    if (filterMode === "athlete" && selectedAthleteId) return doc.athlete_id === selectedAthleteId;
    if (filterMode === "group" && selectedGroupId && groupMemberIds.size > 0) return groupMemberIds.has(doc.athlete_id);
    if (filterMode === "group" && selectedGroupId && groupMemberIds.size === 0) return false;
    return true;
  });

  // ── File handling ─────────────────────────────────────────────────────────

  const ALLOWED_MIME = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFileError("");
    if (!f) { setSelectedFile(null); return; }
    if (!ALLOWED_MIME.has(f.type)) { setFileError("Only PDF, Word, and Excel files are allowed."); setSelectedFile(null); return; }
    if (f.size > 10 * 1024 * 1024) { setFileError("File is too large — maximum 10 MB."); setSelectedFile(null); return; }
    setSelectedFile(f);
    if (!fileTitle) setFileTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  // ── Submit file for single athlete ────────────────────────────────────────

  const handleFileSubmit = async (athleteId: string) => {
    if (!selectedFile || !fileTitle.trim() || !athleteId) return;
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
      await load();
      resetForms();
    } catch (e: any) {
      setFileError(e.message ?? "Upload failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Submit file to all athletes in a group ────────────────────────────────

  const handleGroupFileSubmit = async (groupId: string) => {
    if (!selectedFile || !fileTitle.trim() || !groupId) return;
    setSaving(true);
    setFileError("");
    try {
      const members = await listGroupMembers(groupId);
      if (members.length === 0) throw new Error("No athletes in this group");
      await Promise.all(members.map(async (m) => {
        const fd = new FormData();
        fd.append("athlete_id", m.athlete_id);
        fd.append("title", fileTitle.trim());
        fd.append("notes", fileNotes.trim());
        fd.append("file", selectedFile!);
        const r = await fetch("/api/documents", { method: "POST", body: fd });
        const d = await r.json();
        if (d.error) throw new Error(d.error);
      }));
      await load();
      resetForms();
    } catch (e: any) {
      setFileError(e.message ?? "Upload failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Submit link for single athlete ────────────────────────────────────────

  const handleLinkSubmit = async (athleteId: string) => {
    if (!linkTitle.trim() || !linkUrl.trim() || !athleteId) return;
    setSaving(true);
    try {
      const r = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athlete_id: athleteId, title: linkTitle.trim(), video_url: linkUrl.trim(), notes: linkNotes.trim() }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      await load();
      resetForms();
    } catch (e: any) {
      setError(e.message ?? "Could not save link");
    } finally {
      setSaving(false);
    }
  };

  // ── Submit link to all athletes in a group ────────────────────────────────

  const handleGroupLinkSubmit = async (groupId: string) => {
    if (!linkTitle.trim() || !linkUrl.trim() || !groupId) return;
    setSaving(true);
    try {
      const members = await listGroupMembers(groupId);
      if (members.length === 0) throw new Error("No athletes in this group");
      await Promise.all(members.map(async (m) => {
        const r = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ athlete_id: m.athlete_id, title: linkTitle.trim(), video_url: linkUrl.trim(), notes: linkNotes.trim() }),
        });
        const d = await r.json();
        if (d.error) throw new Error(d.error);
      }));
      await load();
      resetForms();
    } catch (e: any) {
      setError(e.message ?? "Could not save link");
    } finally {
      setSaving(false);
    }
  };

  const resetForms = () => {
    setAddMode(null);
    setFileTitle(""); setFileNotes(""); setSelectedFile(null); setFileError("");
    setLinkTitle(""); setLinkUrl(""); setLinkNotes("");
    setAddTargetAthleteId(""); setAddTargetGroupId(""); setAddAthleteSearch("");
  };

  // ── Open file ─────────────────────────────────────────────────────────────

  const handleOpen = async (doc: AthleteDoc) => {
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

  // ── Delete ────────────────────────────────────────────────────────────────

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

  // ── Athlete search matches ────────────────────────────────────────────────

  const athleteMatches = addAthleteSearch.trim()
    ? athletes.filter((a) => a.name.toLowerCase().includes(addAthleteSearch.toLowerCase())).slice(0, 8)
    : [];

  const isFileMode = addMode === "file" || addMode === "group-file";
  const isGroupMode = addMode === "group-file" || addMode === "group-link";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      <div style={s.headRow}>
        <h1 style={s.title}>Documents</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={s.addBtn} onClick={() => setAddMode("file")}>⬆ Upload to athlete</button>
          <button style={s.addBtn} onClick={() => setAddMode("group-file")}>⬆ Upload to group</button>
          <button style={s.addBtn} onClick={() => setAddMode("link")}>🔗 Link to athlete</button>
          <button style={s.addBtn} onClick={() => setAddMode("group-link")}>🔗 Link to group</button>
        </div>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {/* ── Add form ── */}
      {addMode && (
        <div style={s.addForm}>
          <div style={s.addFormTitle}>
            {addMode === "file" && "Upload file to athlete"}
            {addMode === "group-file" && "Upload file to group"}
            {addMode === "link" && "Add video link for athlete"}
            {addMode === "group-link" && "Add video link to group"}
          </div>

          {/* Target selector */}
          {isGroupMode ? (
            <div>
              <div style={s.fieldLabel}>Group</div>
              <select
                value={addTargetGroupId}
                onChange={(e) => setAddTargetGroupId(e.target.value)}
                style={s.select}
              >
                <option value="">Select a group…</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              {addTargetGroupId && (
                <div style={s.targetHint}>
                  Will be shared with all athletes in {groups.find(g => g.id === addTargetGroupId)?.name}
                </div>
              )}
            </div>
          ) : (
            <div style={{ position: "relative" as const }}>
              <div style={s.fieldLabel}>Athlete</div>
              <input
                value={addAthleteSearch}
                onChange={(e) => { setAddAthleteSearch(e.target.value); setAddTargetAthleteId(""); }}
                placeholder="Search athlete…"
                style={s.input}
              />
              {athleteMatches.length > 0 && !addTargetAthleteId && (
                <div style={s.dropdown}>
                  {athleteMatches.map((a) => (
                    <button
                      key={a.id}
                      style={s.dropdownItem}
                      onMouseDown={() => { setAddTargetAthleteId(a.id); setAddAthleteSearch(a.name); }}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              )}
              {addTargetAthleteId && <div style={s.targetHint}>✓ {addAthleteSearch}</div>}
            </div>
          )}

          {/* File upload */}
          {isFileMode ? (
            <>
              <div
                style={{ ...s.dropZone, ...(selectedFile ? s.dropZoneActive : {}) }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const fakeEvent = { target: { files: e.dataTransfer.files } } as any;
                  handleFileChange(fakeEvent);
                }}
              >
                {selectedFile ? (
                  <><div style={{ fontSize: 24 }}>{fileIcon(selectedFile.type)}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{selectedFile.name}</div>
                  <div style={{ fontSize: 11, color: "var(--mute)" }}>{formatBytes(selectedFile.size)}</div></>
                ) : (
                  <><div style={{ fontSize: 24 }}>📄</div>
                  <div style={{ fontSize: 13, color: "var(--mute)" }}>Click to choose file or drag here</div>
                  <div style={{ fontSize: 11, color: "var(--mute)" }}>PDF, Word, Excel — max 10 MB</div></>
                )}
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" style={{ display: "none" }} onChange={handleFileChange} />
              </div>
              {fileError && <div style={s.fieldError}>{fileError}</div>}
              <div style={s.fieldLabel}>Title</div>
              <input style={s.input} value={fileTitle} onChange={(e) => setFileTitle(e.target.value)} placeholder="e.g. Strength Programme Q1" />
              <div style={s.fieldLabel}>Note (optional)</div>
              <textarea style={s.textarea} value={fileNotes} onChange={(e) => setFileNotes(e.target.value)} placeholder="Context for the athlete…" rows={2} />
            </>
          ) : (
            <>
              <div style={s.fieldLabel}>Title</div>
              <input style={s.input} value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="e.g. Squat technique reference" />
              <div style={s.fieldLabel}>URL</div>
              <input style={s.input} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://youtube.com/watch?v=…" type="url" />
              <div style={s.fieldLabel}>Note (optional)</div>
              <textarea style={s.textarea} value={linkNotes} onChange={(e) => setLinkNotes(e.target.value)} placeholder="Context for the athlete…" rows={2} />
            </>
          )}

          <div style={s.formBtns}>
            <button style={s.cancelBtn} onClick={resetForms}>Cancel</button>
            <button
              style={{
                ...s.saveBtn,
                opacity: (
                  saving ||
                  (isFileMode && (!selectedFile || !fileTitle.trim())) ||
                  (!isFileMode && (!linkTitle.trim() || !linkUrl.trim())) ||
                  (isGroupMode && !addTargetGroupId) ||
                  (!isGroupMode && !addTargetAthleteId)
                ) ? 0.4 : 1
              }}
              disabled={
                saving ||
                (isFileMode && (!selectedFile || !fileTitle.trim())) ||
                (!isFileMode && (!linkTitle.trim() || !linkUrl.trim())) ||
                (isGroupMode && !addTargetGroupId) ||
                (!isGroupMode && !addTargetAthleteId)
              }
              onClick={() => {
                if (addMode === "file") handleFileSubmit(addTargetAthleteId);
                if (addMode === "group-file") handleGroupFileSubmit(addTargetGroupId);
                if (addMode === "link") handleLinkSubmit(addTargetAthleteId);
                if (addMode === "group-link") handleGroupLinkSubmit(addTargetGroupId);
              }}
            >
              {saving ? (isGroupMode ? "Sending to group…" : "Saving…") : (isGroupMode ? "Send to group" : "Save")}
            </button>
          </div>
        </div>
      )}

      {/* ── Filter bar ── */}
      <div style={s.filterBar}>
        {(["all", "athlete", "group"] as FilterMode[]).map((mode) => (
          <button
            key={mode}
            style={{ ...s.filterBtn, ...(filterMode === mode ? s.filterBtnActive : {}) }}
            onClick={() => { setFilterMode(mode); setSelectedAthleteId(""); setSelectedGroupId(""); setAthleteSearch(""); setGroupMemberIds(new Set()); }}
          >
            {mode === "all" ? "All documents" : mode === "athlete" ? "By athlete" : "By group"}
          </button>
        ))}

        {filterMode === "athlete" && (
          <div style={{ position: "relative" as const, flex: 1 }}>
            <input
              value={athleteSearch}
              onChange={(e) => { setAthleteSearch(e.target.value); setSelectedAthleteId(""); }}
              placeholder="Search athlete…"
              style={{ ...s.input, margin: 0 }}
            />
            {athleteSearch && !selectedAthleteId && (
              <div style={s.dropdown}>
                {athletes.filter((a) => a.name.toLowerCase().includes(athleteSearch.toLowerCase())).slice(0, 6).map((a) => (
                  <button key={a.id} style={s.dropdownItem} onMouseDown={() => { setSelectedAthleteId(a.id); setAthleteSearch(a.name); }}>
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {filterMode === "group" && (
          <select
            value={selectedGroupId}
            onChange={async (e) => {
              const gid = e.target.value;
              setSelectedGroupId(gid);
              if (gid) {
                const members = await listGroupMembers(gid);
                setGroupMemberIds(new Set(members.map(m => m.athlete_id)));
              } else {
                setGroupMemberIds(new Set());
              }
            }}
            style={s.select}
          >
            <option value="">Select group…</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
      </div>

      {/* ── Count ── */}
      <div style={s.countRow}>
        {loading ? "Loading…" : `${filteredDocs.length} document${filteredDocs.length !== 1 ? "s" : ""}`}
      </div>

      {/* ── Doc list ── */}
      {!loading && filteredDocs.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📂</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>No documents yet</div>
          <div style={{ fontSize: 13, color: "var(--mute)" }}>Upload files or add video links using the buttons above.</div>
        </div>
      ) : (
        <div style={s.list}>
          {filteredDocs.map((doc) => (
            <div key={doc.id} style={s.docRow}>
              <div style={s.docIcon}>
                {doc.doc_type === "file" ? fileIcon(doc.mime_type) : videoIcon(doc.video_url ?? "")}
              </div>
              <div style={s.docInfo}>
                <div style={s.docTitle}>{doc.title}</div>
                <div style={s.docMeta}>
                  <span style={s.athleteTag}>{doc.athlete?.name ?? "Unknown athlete"}</span>
                  {doc.doc_type === "file" && doc.file_name && (
                    <span> · {doc.file_name}{doc.file_size ? ` (${formatBytes(doc.file_size)})` : ""}</span>
                  )}
                  {doc.doc_type === "video_link" && <span> · Video link</span>}
                  <span> · {formatDate(doc.created_at)}</span>
                </div>
                {doc.notes && <div style={s.docNotes}>{doc.notes}</div>}
              </div>
              <div style={s.docActions}>
                <button style={s.openBtn} onClick={() => handleOpen(doc)} disabled={openingId === doc.id}>
                  {openingId === doc.id ? "…" : "Open"}
                </button>
                <button style={s.deleteBtn} onClick={() => handleDelete(doc.id)} disabled={deletingId === doc.id}>
                  {deletingId === doc.id ? "…" : "✕"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 860 },
  headRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap" as const, gap: 10 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: 0 },
  addBtn: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 },
  addForm: { background: "var(--panel)", border: "1px solid var(--accent)44", borderRadius: 14, padding: 18, marginBottom: 20, display: "flex", flexDirection: "column" as const, gap: 10 },
  addFormTitle: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  fieldLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  input: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14, fontFamily: "inherit" },
  textarea: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", resize: "vertical" as const },
  select: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14, width: "100%" },
  targetHint: { fontSize: 12, color: "var(--accent)", marginTop: 4 },
  dropdown: { position: "absolute" as const, top: "100%", left: 0, right: 0, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, zIndex: 10, overflow: "hidden" },
  dropdownItem: { width: "100%", padding: "9px 12px", background: "transparent", border: "none", color: "var(--text)", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" as const },
  dropZone: { border: "2px dashed var(--line)", borderRadius: 10, padding: "20px", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 6, cursor: "pointer" },
  dropZoneActive: { borderColor: "var(--accent)", background: "var(--accent-dim)" },
  fieldError: { fontSize: 12, color: "#FF6B6B", background: "#2a0c0c", border: "1px solid #FF6B6B44", borderRadius: 6, padding: "6px 10px" },
  formBtns: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 },
  cancelBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "10px 18px", fontSize: 13, cursor: "pointer" },
  saveBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "10px 22px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  filterBar: { display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" as const, alignItems: "center" },
  filterBtn: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  filterBtnActive: { background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" },
  countRow: { fontSize: 12, color: "var(--mute)", marginBottom: 10 },
  empty: { textAlign: "center" as const, padding: "48px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  docRow: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 12 },
  docIcon: { fontSize: 22, flexShrink: 0, marginTop: 1 },
  docInfo: { flex: 1, minWidth: 0 },
  docTitle: { fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 3 },
  docMeta: { fontSize: 11, color: "var(--mute)" },
  athleteTag: { fontWeight: 700, color: "var(--accent)" },
  docNotes: { fontSize: 12, color: "var(--mute)", marginTop: 3, fontStyle: "italic" as const },
  docActions: { display: "flex", gap: 6, alignItems: "center", flexShrink: 0 },
  openBtn: { background: "var(--accent-dim)", border: "1px solid var(--accent)", color: "var(--accent)", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  deleteBtn: { background: "transparent", border: "1px solid var(--line)", color: "#FF6B6B", borderRadius: 6, padding: "5px 8px", fontSize: 12, cursor: "pointer" },
};
