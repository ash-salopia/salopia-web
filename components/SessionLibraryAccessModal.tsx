"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SessionLibraryAccessModal
// Grant/revoke an athlete's access to templates from the Template
// Library, which they can then browse and log informally via their
// own "Library" tab — separate from their assigned programme.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { listTemplates } from "@/lib/data/templates";
import { listGrantedTemplateIds, grantTemplateAccess, revokeTemplateAccess } from "@/lib/data/session-library";
import type { Template } from "@/types";

interface Props {
  athleteId: string;
  athleteName: string;
  onClose: () => void;
}

export default function SessionLibraryAccessModal({ athleteId, athleteName, onClose }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [grantedIds, setGrantedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listTemplates(), listGrantedTemplateIds(athleteId)])
      .then(([allTemplates, granted]) => {
        setTemplates(allTemplates);
        setGrantedIds(new Set(granted));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load templates"))
      .finally(() => setLoading(false));
  }, [athleteId]);

  const handleToggle = async (templateId: string) => {
    const isGranted = grantedIds.has(templateId);
    setTogglingId(templateId);
    setError("");
    try {
      if (isGranted) {
        await revokeTemplateAccess(athleteId, templateId);
        setGrantedIds((prev) => {
          const next = new Set(prev);
          next.delete(templateId);
          return next;
        });
      } else {
        await grantTemplateAccess(athleteId, templateId);
        setGrantedIds((prev) => new Set(prev).add(templateId));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update access");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.title}>📚 Session Library — {athleteName}</span>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>

        <p style={s.hint}>
          Grant access to templates {athleteName} can browse and log informally, separate from their assigned programme.
        </p>

        {error && <div style={s.errorBox}>{error}</div>}

        {loading ? (
          <div style={s.loadingMsg}>Loading templates…</div>
        ) : templates.length === 0 ? (
          <div style={s.empty}>No templates yet — create one in the Template Library first.</div>
        ) : (
          <div style={s.list}>
            {templates.map((t) => {
              const granted = grantedIds.has(t.id);
              const defCount = (t.defs ?? []).length;
              return (
                <button
                  key={t.id}
                  style={{ ...s.row, ...(granted ? s.rowGranted : {}) }}
                  onClick={() => handleToggle(t.id)}
                  disabled={togglingId === t.id}
                >
                  <span style={{ ...s.checkbox, ...(granted ? s.checkboxOn : {}) }}>{granted ? "✓" : ""}</span>
                  <span style={s.rowName}>{t.name}</span>
                  <span style={s.rowMeta}>{defCount} session{defCount !== 1 ? "s" : ""}</span>
                </button>
              );
            })}
          </div>
        )}

        <button style={s.doneBtn} onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 460, maxHeight: "80vh", overflowY: "auto" as const, display: "flex", flexDirection: "column" as const, gap: 14 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--text)" },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 22, cursor: "pointer", padding: "0 4px", lineHeight: 1 },
  hint: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5, margin: 0 },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  loadingMsg: { fontSize: 14, color: "var(--mute)" },
  empty: { fontSize: 13, color: "var(--mute)", fontStyle: "italic" as const },
  list: { display: "flex", flexDirection: "column" as const, gap: 6 },
  row: {
    display: "flex", alignItems: "center", gap: 10, width: "100%",
    background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10,
    padding: "10px 12px", cursor: "pointer", textAlign: "left" as const,
  },
  rowGranted: { background: "var(--accent-dim)", borderColor: "var(--accent)" },
  checkbox: {
    width: 18, height: 18, borderRadius: 5, border: "1px solid var(--line)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 12, fontWeight: 700, color: "#0a1420", flexShrink: 0,
  },
  checkboxOn: { background: "var(--accent)", borderColor: "var(--accent)" },
  rowName: { flex: 1, fontSize: 14, fontWeight: 600, color: "var(--text)" },
  rowMeta: { fontSize: 11, color: "var(--mute)", flexShrink: 0 },
  doneBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" },
};
