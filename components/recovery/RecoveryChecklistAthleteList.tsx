"use client";

import type { RecoveryChecklistItem } from "@/types";
import { RECOVERY_COLOR } from "@/lib/recovery-constants";

// Tappable checklist — shared by the Guided Routine's nested checklist
// block and the standalone Recovery Checklist format.
export default function RecoveryChecklistAthleteList({
  items,
  onToggle,
}: {
  items: RecoveryChecklistItem[];
  onToggle: (itemId: string) => void;
}) {
  return (
    <div style={s.wrap}>
      {items.map((item) => (
        <button key={item.id} style={{ ...s.item, ...(item.done ? s.itemDone : {}) }} onClick={() => onToggle(item.id)}>
          <span style={{ ...s.checkbox, ...(item.done ? s.checkboxDone : {}) }}>{item.done ? "✓" : ""}</span>
          <span style={s.textCol}>
            <span style={s.label}>{item.label}</span>
            {(item.category || item.target) && (
              <span style={s.meta}>{[item.category, item.target].filter(Boolean).join(" · ")}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 8 },
  item: {
    display: "flex", alignItems: "center", gap: 10, background: "var(--panel)", border: "1px solid var(--line)",
    borderRadius: 10, padding: "10px 12px", cursor: "pointer", textAlign: "left" as const, width: "100%",
  },
  itemDone: { borderColor: RECOVERY_COLOR, background: "#123832" },
  checkbox: { width: 20, height: 20, borderRadius: 6, border: "1px solid var(--line)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: RECOVERY_COLOR, fontWeight: 700 },
  checkboxDone: { borderColor: RECOVERY_COLOR, background: RECOVERY_COLOR, color: "#062a26" },
  textCol: { display: "flex", flexDirection: "column" as const, gap: 2 },
  label: { fontSize: 14, color: "var(--text)", fontWeight: 600 },
  meta: { fontSize: 11, color: "var(--mute)" },
};
