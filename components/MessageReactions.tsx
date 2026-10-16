"use client";

import type { MessageReaction } from "@/types";
import { REACTION_EMOJI } from "@/lib/message-reactions";

// 👍/👎 quick replies on direct messages (0117). Used by the coach's
// DirectMessageThread, the Dashboard's "Athlete messages" panel and the
// athlete app's Coach chat. A message carries one reaction, set by the
// other side of the thread; tapping the active thumb again clears it.

export function ReactionButtons({
  current,
  onReact,
  disabled,
}: {
  current: MessageReaction | null | undefined;
  onReact: (r: MessageReaction | null) => void;
  disabled?: boolean;
}) {
  return (
    <span style={st.wrap}>
      {(["up", "down"] as const).map((r) => {
        const active = current === r;
        return (
          <button
            key={r}
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onReact(active ? null : r);
            }}
            aria-pressed={active}
            aria-label={r === "up" ? "Thumbs up" : "Thumbs down"}
            title={active ? "Remove reaction" : r === "up" ? "Thumbs up" : "Thumbs down"}
            style={{ ...st.btn, ...(active ? st.btnActive : {}), opacity: disabled ? 0.5 : 1 }}
          >
            {REACTION_EMOJI[r]}
          </button>
        );
      })}
    </span>
  );
}

/** The reaction the other side left, pinned to the corner of a bubble. */
export function ReactionBadge({ reaction, by }: { reaction: MessageReaction; by?: string | null }) {
  return (
    <span style={st.badge} title={by ? `${by} reacted ${REACTION_EMOJI[reaction]}` : undefined}>
      {REACTION_EMOJI[reaction]}
    </span>
  );
}

const st: Record<string, React.CSSProperties> = {
  wrap: { display: "inline-flex", gap: 4 },
  btn: {
    background: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 13,
    lineHeight: 1.4,
    cursor: "pointer",
    filter: "grayscale(0.6)",
  },
  btnActive: { background: "var(--accent-dim)", borderColor: "var(--accent)", filter: "none" },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "1px 6px",
    fontSize: 12,
    lineHeight: 1.4,
  },
};
