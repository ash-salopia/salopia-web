"use client";

import { useState } from "react";
import RecoveryChecklistItemsEditor from "@/components/recovery/RecoveryChecklistItemsEditor";
import type { RecoveryBlock, RecoveryBlockType } from "@/types";

const BLOCK_TYPE_META: Record<RecoveryBlockType, { label: string; icon: string }> = {
  instruction: { label: "Instruction", icon: "📝" },
  exercise: { label: "Exercise / mobility drill", icon: "🏃" },
  timed: { label: "Timed activity", icon: "⏱" },
  checklist: { label: "Checklist", icon: "✅" },
  media: { label: "Media", icon: "🎬" },
  feedback: { label: "Athlete feedback", icon: "💬" },
};

function newBlock(type: RecoveryBlockType): RecoveryBlock {
  const id = crypto.randomUUID();
  switch (type) {
    case "instruction": return { id, type, body: "" };
    case "exercise": return { id, type, name: "", video_url: "", duration_or_reps: "", sets: 1, side: "n/a", rest: "", notes: "", equipment: "", required: true };
    case "timed": return { id, type, duration_seconds: 60, instructions: "" };
    case "checklist": return { id, type, items: [] };
    case "media": return { id, type, media_url: "", caption: "" };
    case "feedback": return { id, type, prompt: "" };
  }
}

function BlockFields({ block, onChange }: { block: RecoveryBlock; onChange: (patch: Partial<RecoveryBlock>) => void }) {
  switch (block.type) {
    case "instruction":
      return (
        <textarea
          value={block.body}
          onChange={(e) => onChange({ body: e.target.value })}
          placeholder="What should the athlete do or know?"
          rows={2}
          style={{ ...s.input, resize: "vertical" as const, fontFamily: "inherit" }}
        />
      );
    case "exercise":
      return (
        <div style={s.grid2}>
          <input value={block.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Exercise name" style={s.input} />
          <input value={block.video_url} onChange={(e) => onChange({ video_url: e.target.value })} placeholder="Video URL" style={s.input} />
          <input value={block.duration_or_reps} onChange={(e) => onChange({ duration_or_reps: e.target.value })} placeholder="Duration or reps, e.g. 10 reps / 30s" style={s.input} />
          <input type="number" inputMode="numeric" value={block.sets} onChange={(e) => onChange({ sets: parseInt(e.target.value, 10) || 1 })} placeholder="Sets" style={s.input} />
          <select value={block.side} onChange={(e) => onChange({ side: e.target.value as any })} style={s.input}>
            <option value="n/a">N/A</option>
            <option value="both">Both sides</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
          <input value={block.rest} onChange={(e) => onChange({ rest: e.target.value })} placeholder="Rest, e.g. 30s" style={s.input} />
          <input value={block.equipment} onChange={(e) => onChange({ equipment: e.target.value })} placeholder="Equipment (optional)" style={s.input} />
          <label style={s.checkRow}>
            <input type="checkbox" checked={block.required} onChange={(e) => onChange({ required: e.target.checked })} style={{ accentColor: "#2DD4BF" }} />
            Required
          </label>
          <textarea
            value={block.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder="Coach notes"
            rows={2}
            style={{ ...s.input, gridColumn: "1 / -1", resize: "vertical" as const, fontFamily: "inherit" }}
          />
        </div>
      );
    case "timed":
      return (
        <div style={s.grid2}>
          <input type="number" inputMode="numeric" value={block.duration_seconds} onChange={(e) => onChange({ duration_seconds: parseInt(e.target.value, 10) || 0 })} placeholder="Duration (seconds)" style={s.input} />
          <input value={block.instructions} onChange={(e) => onChange({ instructions: e.target.value })} placeholder="Instructions" style={s.input} />
        </div>
      );
    case "checklist":
      return <RecoveryChecklistItemsEditor items={block.items} onChange={(items) => onChange({ items })} />;
    case "media":
      return (
        <div style={s.grid2}>
          <input value={block.media_url} onChange={(e) => onChange({ media_url: e.target.value })} placeholder="Media URL" style={s.input} />
          <input value={block.caption} onChange={(e) => onChange({ caption: e.target.value })} placeholder="Caption (optional)" style={s.input} />
        </div>
      );
    case "feedback":
      return <input value={block.prompt} onChange={(e) => onChange({ prompt: e.target.value })} placeholder="What should the athlete reflect on?" style={s.input} />;
  }
}

export default function RecoveryBlockBuilder({
  blocks,
  onChange,
}: {
  blocks: RecoveryBlock[];
  onChange: (blocks: RecoveryBlock[]) => void;
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const updateBlock = (id: string, patch: Partial<RecoveryBlock>) =>
    onChange(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as RecoveryBlock) : b)));
  const removeBlock = (id: string) => onChange(blocks.filter((b) => b.id !== id));
  const moveBlock = (index: number, dir: -1 | 1) => {
    const next = [...blocks];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    onChange(next);
  };
  const addBlock = (type: RecoveryBlockType) => {
    onChange([...blocks, newBlock(type)]);
    setAddMenuOpen(false);
  };

  return (
    <div style={s.wrap}>
      {blocks.length === 0 && (
        <div style={s.empty}>No blocks yet - add instructions, drills, timers, checklists, media, or a feedback prompt below.</div>
      )}
      {blocks.map((block, i) => (
        <div key={block.id} style={s.blockCard}>
          <div style={s.blockHeader}>
            <span style={s.blockType}>
              {BLOCK_TYPE_META[block.type].icon} {BLOCK_TYPE_META[block.type].label}
            </span>
            <div style={s.blockActions}>
              <button style={{ ...s.miniBtn, opacity: i === 0 ? 0.3 : 1 }} disabled={i === 0} onClick={() => moveBlock(i, -1)}>▴</button>
              <button style={{ ...s.miniBtn, opacity: i === blocks.length - 1 ? 0.3 : 1 }} disabled={i === blocks.length - 1} onClick={() => moveBlock(i, 1)}>▾</button>
              <button style={s.miniBtnDanger} onClick={() => removeBlock(block.id)}>✕</button>
            </div>
          </div>
          <BlockFields block={block} onChange={(patch) => updateBlock(block.id, patch)} />
        </div>
      ))}

      <div style={{ position: "relative" }}>
        <button style={s.addBtn} onClick={() => setAddMenuOpen((v) => !v)}>+ Add block</button>
        {addMenuOpen && (
          <div style={s.addMenu}>
            {(Object.keys(BLOCK_TYPE_META) as RecoveryBlockType[]).map((t) => (
              <button key={t} style={s.addMenuItem} onClick={() => addBlock(t)}>
                {BLOCK_TYPE_META[t].icon} {BLOCK_TYPE_META[t].label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 },
  empty: { fontSize: 13, color: "var(--mute)", fontStyle: "italic", padding: "8px 0" },
  blockCard: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 },
  blockHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  blockType: { fontSize: 12, fontWeight: 700, color: "var(--text)" },
  blockActions: { display: "flex", gap: 4 },
  miniBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 5, width: 22, height: 22, fontSize: 10, cursor: "pointer" },
  miniBtnDanger: { background: "transparent", border: "1px solid var(--line)", color: "#FF6B6B", borderRadius: 5, width: 22, height: 22, fontSize: 11, cursor: "pointer" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  input: { width: "100%", background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 7, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" as const },
  checkRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text)", cursor: "pointer" },
  addBtn: { background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%" },
  addMenu: {
    position: "absolute" as const, top: "100%", left: 0, right: 0, marginTop: 4, background: "var(--panel)",
    border: "1px solid var(--line)", borderRadius: 8, zIndex: 10, overflow: "hidden",
  },
  addMenuItem: { display: "block", width: "100%", textAlign: "left" as const, background: "transparent", border: "none", borderBottom: "1px solid var(--line)", color: "var(--text)", padding: "9px 12px", fontSize: 13, cursor: "pointer" },
};
