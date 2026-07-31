"use client";

import type { RecoveryChecklistItem } from "@/types";

// Shared by the Guided Routine's checklist block type AND the
// standalone Recovery Checklist format (same item shape either way).
export default function RecoveryChecklistItemsEditor({
  items,
  onChange,
}: {
  items: RecoveryChecklistItem[];
  onChange: (items: RecoveryChecklistItem[]) => void;
}) {
  const updateItem = (id: string, patch: Partial<RecoveryChecklistItem>) =>
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const removeItem = (id: string) => onChange(items.filter((i) => i.id !== id));
  const addItem = () =>
    onChange([...items, { id: crypto.randomUUID(), label: "", category: "", target: "" }]);

  return (
    <div style={s.wrap}>
      {items.length === 0 && <div style={s.empty}>No items yet.</div>}
      {items.map((item) => (
        <div key={item.id} style={s.itemRow}>
          <input
            value={item.label}
            onChange={(e) => updateItem(item.id, { label: e.target.value })}
            placeholder="e.g. Drink 2L water"
            style={{ ...s.input, flex: 2 }}
          />
          <input
            value={item.category}
            onChange={(e) => updateItem(item.id, { category: e.target.value })}
            placeholder="Category"
            style={{ ...s.input, flex: 1 }}
          />
          <input
            value={item.target ?? ""}
            onChange={(e) => updateItem(item.id, { target: e.target.value })}
            placeholder="Target (optional)"
            style={{ ...s.input, flex: 1 }}
          />
          <button style={s.removeBtn} onClick={() => removeItem(item.id)}>✕</button>
        </div>
      ))}
      <button style={s.addBtn} onClick={addItem}>+ Add item</button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 8 },
  empty: { fontSize: 12, color: "var(--mute)", fontStyle: "italic" },
  itemRow: { display: "flex", gap: 6, alignItems: "center" },
  input: { background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 7, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" as const, minWidth: 0 },
  removeBtn: { background: "transparent", border: "none", color: "#FF6B6B", cursor: "pointer", fontSize: 13, padding: "0 4px", flexShrink: 0 },
  addBtn: { alignSelf: "flex-start", background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
};
