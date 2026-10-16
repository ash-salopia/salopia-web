"use client";

import { useEffect, useState } from "react";
import SessionEditor from "@/components/SessionEditor";

// The full session editor as a pop-up over the athlete calendar, so a
// coach can programme from the Week / By-day views without leaving them.
// `items` is the run of sessions to step through with ‹ › (that week's
// sessions, or every upcoming Tuesday). Edits save as they're made, so
// closing or stepping never loses anything; the caller refreshes the
// calendar in onClose.

export interface SessionEditorModalItem {
  id: string;
  /** e.g. "Tue 21 Oct · Lower strength" */
  label: string;
}

export default function SessionEditorModal({
  athleteId,
  items,
  initialId,
  onClose,
}: {
  athleteId: string;
  items: SessionEditorModalItem[];
  initialId: string;
  onClose: () => void;
}) {
  const [list, setList] = useState(items);
  const [currentId, setCurrentId] = useState(initialId);
  const index = list.findIndex((i) => i.id === currentId);
  const current = list[index];

  // Stop the calendar scrolling behind the pop-up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const go = (delta: number) => {
    const next = list[index + delta];
    if (next) setCurrentId(next.id);
  };

  // Deleted from inside the editor: drop it and move on, or close if it
  // was the last one.
  const handleDeleted = () => {
    const remaining = list.filter((i) => i.id !== currentId);
    if (!remaining.length) return onClose();
    setList(remaining);
    setCurrentId((remaining[index] ?? remaining[remaining.length - 1]).id);
  };

  return (
    <div style={s.overlay}>
      <div style={s.panel} role="dialog" aria-modal="true">
        <div style={s.head}>
          <button style={{ ...s.navBtn, opacity: index > 0 ? 1 : 0.3 }} disabled={index <= 0} onClick={() => go(-1)} aria-label="Previous session">
            ‹
          </button>
          <div style={s.headMid}>
            <div style={s.headLabel}>{current?.label ?? "Session"}</div>
            {list.length > 1 && (
              <div style={s.headCount}>
                {index + 1} of {list.length}
              </div>
            )}
          </div>
          <button
            style={{ ...s.navBtn, opacity: index < list.length - 1 ? 1 : 0.3 }}
            disabled={index >= list.length - 1}
            onClick={() => go(1)}
            aria-label="Next session"
          >
            ›
          </button>
          <a
            href={`/athletes/${athleteId}/sessions/${currentId}`}
            style={s.fullPage}
            title="Open as a full page"
          >
            Full page ↗
          </a>
          <button style={s.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div style={s.body}>
          <SessionEditor
            key={currentId}
            athleteId={athleteId}
            sessionId={currentId}
            embedded
            onBack={onClose}
            onDone={handleDeleted}
            onOpenSession={(sid) => {
              if (!list.some((i) => i.id === sid)) setList((l) => [...l, { id: sid, label: "Session" }]);
              setCurrentId(sid);
            }}
          />
        </div>
      </div>
    </div>
  );
}

// Below the editor's own pop-ups (z 60-80) so those still open on top.
const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(6,9,12,.7)",
    zIndex: 55,
    display: "flex",
    alignItems: "stretch",
    justifyContent: "center",
    padding: "16px 12px",
  },
  panel: {
    background: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    width: "100%",
    maxWidth: 820,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  head: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderBottom: "1px solid var(--line)",
    background: "var(--panel)",
  },
  headMid: { flex: 1, minWidth: 0, textAlign: "center" },
  headLabel: { fontSize: 14, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  headCount: { fontSize: 11, color: "var(--mute)", marginTop: 1 },
  navBtn: {
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    width: 34,
    height: 34,
    fontSize: 20,
    lineHeight: 1,
    cursor: "pointer",
    flexShrink: 0,
  },
  fullPage: { fontSize: 12, fontWeight: 600, color: "var(--accent)", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 },
  close: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 26, lineHeight: 1, cursor: "pointer", padding: "0 4px", flexShrink: 0 },
  body: { flex: 1, overflowY: "auto", padding: "14px 16px 24px" },
};
