"use client";

import { useEffect, useState } from "react";
import { listRecoveryPresets, deleteRecoveryPreset } from "@/lib/data/recovery";
import { recoveryCategoryLabel } from "@/lib/recovery-constants";
import type { RecoveryPreset } from "@/types";

const FORMAT_LABEL: Record<string, string> = { quick: "Quick", guided: "Guided", checklist: "Checklist" };

export default function RecoveryPresetPicker({ onSelect }: { onSelect: (preset: RecoveryPreset) => void }) {
  const [presets, setPresets] = useState<RecoveryPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listRecoveryPresets()
      .then(setPresets)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load presets"))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this preset?")) return;
    try {
      await deleteRecoveryPreset(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete preset");
    }
  };

  if (loading) return <div style={s.empty}>Loading presets…</div>;
  if (error) return <div style={s.error}>{error}</div>;
  if (!presets.length) {
    return (
      <div style={s.empty}>
        No saved presets yet - build a Recovery session, then use &quot;Save as preset&quot; to reuse it later.
      </div>
    );
  }

  return (
    <div style={s.list}>
      {presets.map((p) => (
        <button key={p.id} style={s.card} onClick={() => onSelect(p)}>
          <div style={s.cardTop}>
            <span style={s.name}>{p.name}</span>
            <span style={s.formatTag}>{FORMAT_LABEL[p.format] ?? p.format}</span>
          </div>
          <div style={s.category}>{recoveryCategoryLabel(p.category, p.config.custom_category_label)}</div>
          <button style={s.deleteBtn} onClick={(e) => handleDelete(p.id, e)} title="Delete preset">✕</button>
        </button>
      ))}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  list: { display: "flex", flexDirection: "column", gap: 8 },
  empty: { fontSize: 13, color: "var(--mute)", fontStyle: "italic", padding: "8px 0" },
  error: { fontSize: 13, color: "#FF6B6B" },
  card: {
    position: "relative" as const, textAlign: "left" as const, background: "var(--ink)", border: "1px solid var(--line)",
    borderRadius: 10, padding: "12px 40px 12px 14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 3, width: "100%",
  },
  cardTop: { display: "flex", alignItems: "center", gap: 8 },
  name: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  formatTag: { fontSize: 10, fontWeight: 700, color: "var(--mute)", background: "var(--panel2)", borderRadius: 5, padding: "2px 6px", textTransform: "uppercase" as const },
  category: { fontSize: 12, color: "var(--mute)" },
  deleteBtn: { position: "absolute" as const, top: 10, right: 10, background: "transparent", border: "none", color: "#FF6B6B", cursor: "pointer", fontSize: 13, padding: 4 },
};
