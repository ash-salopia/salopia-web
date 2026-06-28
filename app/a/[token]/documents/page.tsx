"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

interface AthleteDocument {
  id: string;
  title: string;
  doc_type: "file" | "video_link";
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  video_url: string | null;
  notes: string | null;
  created_at: string;
}

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

export default function AthleteDocumentsPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [docs, setDocs] = useState<AthleteDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/athlete-link/documents?token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setDocs(d.documents ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleOpen = async (doc: AthleteDocument) => {
    if (doc.doc_type === "video_link" && doc.video_url) {
      window.open(doc.video_url, "_blank", "noopener");
      return;
    }
    setOpeningId(doc.id);
    try {
      const r = await fetch(`/api/athlete-link/documents/signed-url?token=${token}&id=${doc.id}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      window.open(d.url, "_blank", "noopener");
    } catch {
      setError("Could not open file — try again.");
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => router.push(`/a/${token}`)}>← Back</button>
        <div style={s.brand}>AthletiQ</div>
        <div style={{ width: 60 }} />
      </div>
      <div style={{ padding: "12px 16px 0", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: "var(--text)" }}>
        📁 Documents
      </div>

      <div style={s.content}>
        {error && <div style={s.errorBox}>{error}</div>}

        {loading ? (
          <div style={s.loading}>Loading…</div>
        ) : docs.length === 0 ? (
          <div style={s.emptyState}>
            <div style={s.emptyIcon}>📂</div>
            <div style={s.emptyText}>No documents yet</div>
            <div style={s.emptySubtext}>
              Your coach will share programmes, plans, and resources here.
            </div>
          </div>
        ) : (
          <div style={s.list}>
            {docs.map((doc) => (
              <div key={doc.id} style={s.card}>
                <div style={s.cardIcon}>
                  {doc.doc_type === "file"
                    ? fileIcon(doc.mime_type)
                    : videoIcon(doc.video_url ?? "")}
                </div>
                <div style={s.cardBody}>
                  <div style={s.cardTitle}>{doc.title}</div>
                  <div style={s.cardMeta}>
                    {doc.doc_type === "file" && doc.file_name && (
                      <span>{doc.file_name}{doc.file_size ? ` · ${formatBytes(doc.file_size)}` : ""} · </span>
                    )}
                    {doc.doc_type === "video_link" && <span>Video · </span>}
                    <span>{formatDate(doc.created_at)}</span>
                  </div>
                  {doc.notes && <div style={s.cardNotes}>{doc.notes}</div>}
                </div>
                <button
                  style={s.openBtn}
                  onClick={() => handleOpen(doc)}
                  disabled={openingId === doc.id}
                >
                  {openingId === doc.id ? "…" : doc.doc_type === "video_link" ? "Watch" : "Open"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" },
  header: {
    height: 56, background: "var(--ink)", borderBottom: "1px solid var(--line)",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 16px", flexShrink: 0,
  },
  brand: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, color: "var(--accent)" },
  backBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" },
  content: { padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 480, width: "100%" },
  errorBox: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  loading: { fontSize: 14, color: "var(--mute)", padding: "20px 0" },
  emptyState: { textAlign: "center" as const, padding: "40px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  emptySubtext: { fontSize: 13, color: "var(--mute)", maxWidth: 280, lineHeight: 1.5 },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: {
    background: "var(--panel)", border: "1px solid var(--line)",
    borderRadius: 12, padding: 14, display: "flex", alignItems: "flex-start", gap: 12,
  },
  cardIcon: { fontSize: 24, flexShrink: 0, marginTop: 1 },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 3 },
  cardMeta: { fontSize: 11, color: "var(--mute)" },
  cardNotes: { fontSize: 12, color: "var(--mute)", marginTop: 4, fontStyle: "italic" as const, lineHeight: 1.4 },
  openBtn: {
    background: "var(--accent)", color: "#0a1420", border: "none",
    borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700,
    cursor: "pointer", flexShrink: 0,
  },
};
