"use client";

import { useState } from "react";
import RecoveryChecklistAthleteList from "@/components/recovery/RecoveryChecklistAthleteList";
import RecoveryCountdown from "@/components/recovery/RecoveryCountdown";
import { RECOVERY_COLOR } from "@/lib/recovery-constants";
import type { RecoveryBlock } from "@/types";

// One block, one card, on the athlete side. Every block type except
// checklist (which tracks completion per-item instead) gets a simple
// mark-done toggle — checklist items toggle individually via
// onToggleItem.
export default function RecoveryBlockAthleteCard({
  block,
  onUpdate,
  onToggleItem,
}: {
  block: RecoveryBlock;
  onUpdate: (patch: Partial<RecoveryBlock>) => void;
  onToggleItem: (itemId: string) => void;
}) {
  const [responseDraft, setResponseDraft] = useState((block as any).response ?? "");

  const doneToggle = block.type !== "checklist" && (
    <button
      style={{ ...s.doneBtn, ...(block.done ? s.doneBtnOn : {}) }}
      onClick={() => onUpdate({ done: !block.done })}
    >
      {block.done ? "✓" : "○"}
    </button>
  );

  let body: React.ReactNode = null;
  switch (block.type) {
    case "instruction":
      body = <div style={s.text}>{block.body}</div>;
      break;
    case "exercise":
      body = (
        <>
          <div style={s.exerciseHeadRow}>
            <span style={s.exerciseName}>{block.name}</span>
            {block.required ? <span style={s.requiredTag}>Required</span> : <span style={s.optionalTag}>Optional</span>}
          </div>
          {block.video_url && (
            <a href={block.video_url} target="_blank" rel="noreferrer" style={s.link}>▶ Watch video</a>
          )}
          <div style={s.exerciseMeta}>
            {[
              block.duration_or_reps,
              block.sets > 1 ? `${block.sets} sets` : "",
              block.side !== "n/a" ? block.side : "",
              block.rest ? `rest ${block.rest}` : "",
            ].filter(Boolean).join(" · ")}
          </div>
          {block.equipment && <div style={s.equipment}>🎒 {block.equipment}</div>}
          {block.notes && <div style={s.text}>{block.notes}</div>}
        </>
      );
      break;
    case "timed":
      body = (
        <>
          {block.instructions && <div style={s.text}>{block.instructions}</div>}
          <RecoveryCountdown seconds={block.duration_seconds} onDone={() => onUpdate({ done: true })} />
        </>
      );
      break;
    case "checklist":
      body = <RecoveryChecklistAthleteList items={block.items} onToggle={onToggleItem} />;
      break;
    case "media":
      body = (
        <>
          <a href={block.media_url} target="_blank" rel="noreferrer" style={s.link}>▶ View media</a>
          {block.caption && <div style={s.text}>{block.caption}</div>}
        </>
      );
      break;
    case "feedback":
      body = (
        <>
          <div style={s.text}>{block.prompt}</div>
          <textarea
            value={responseDraft}
            onChange={(e) => setResponseDraft(e.target.value)}
            onBlur={() => onUpdate({ response: responseDraft, done: responseDraft.trim().length > 0 })}
            placeholder="Your answer…"
            rows={2}
            style={s.textarea}
          />
        </>
      );
      break;
  }

  return (
    <div style={{ ...s.card, ...(block.type !== "checklist" && block.done ? s.cardDone : {}) }}>
      <div style={s.cardHeadRow}>
        <div style={{ flex: 1 }}>{block.title && <div style={s.blockTitle}>{block.title}</div>}</div>
        {doneToggle}
      </div>
      {body}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 },
  cardDone: { borderColor: RECOVERY_COLOR },
  cardHeadRow: { display: "flex", alignItems: "flex-start", gap: 8 },
  blockTitle: { fontSize: 13, fontWeight: 700, color: "var(--text)" },
  doneBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, width: 30, height: 30, fontSize: 15, cursor: "pointer", flexShrink: 0 },
  doneBtnOn: { background: "#123832", borderColor: RECOVERY_COLOR, color: RECOVERY_COLOR },
  text: { fontSize: 14, color: "var(--text)", lineHeight: 1.5 },
  link: { fontSize: 13, color: RECOVERY_COLOR, fontWeight: 600, textDecoration: "none" },
  exerciseHeadRow: { display: "flex", alignItems: "center", gap: 8 },
  exerciseName: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  requiredTag: { fontSize: 10, fontWeight: 700, color: "#FFC94D", background: "#3a2f10", borderRadius: 5, padding: "2px 6px", textTransform: "uppercase" as const },
  optionalTag: { fontSize: 10, fontWeight: 700, color: "var(--mute)", background: "var(--panel2)", borderRadius: 5, padding: "2px 6px", textTransform: "uppercase" as const },
  exerciseMeta: { fontSize: 12, color: "var(--mute)" },
  equipment: { fontSize: 12, color: "var(--mute)" },
  textarea: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", resize: "vertical" as const, boxSizing: "border-box" as const },
};
