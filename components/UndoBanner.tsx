"use client";

// Small banner for the single-slot undo state from lib/use-pending-undo.ts
// - same green-tinted styling as the plain `flashBox` message convention
// already used per-page across this app, but with an inline Undo action,
// which the plain flash pattern has no slot for. No auto-dismiss timer:
// stays up until undone, dismissed, or replaced by the next destructive
// action, since the point is a durable escape hatch rather than a
// fleeting toast.

export default function UndoBanner({
  label,
  onUndo,
  onDismiss,
  restoring,
  error,
}: {
  label: string;
  onUndo: () => void;
  onDismiss: () => void;
  restoring?: boolean;
  error?: string;
}) {
  return (
    <div style={s.box}>
      <div style={s.row}>
        <span style={s.label}>{label}</span>
        <div style={s.actions}>
          <button style={{ ...s.undoBtn, opacity: restoring ? 0.6 : 1 }} disabled={restoring} onClick={onUndo}>
            {restoring ? "Undoing…" : "Undo"}
          </button>
          <button style={s.dismissBtn} onClick={onDismiss} title="Dismiss">
            ×
          </button>
        </div>
      </div>
      {error && <div style={s.error}>{error}</div>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  box: {
    background: "var(--good-dim)",
    border: "1px solid var(--good)",
    color: "var(--good)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    marginBottom: 16,
  },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  label: { flex: 1, minWidth: 0 },
  actions: { display: "flex", alignItems: "center", gap: 4, flexShrink: 0 },
  undoBtn: {
    background: "transparent",
    border: "1px solid var(--good)",
    color: "var(--good)",
    borderRadius: 6,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  dismissBtn: {
    background: "transparent",
    border: "none",
    color: "var(--good)",
    fontSize: 16,
    lineHeight: 1,
    padding: "0 4px",
    cursor: "pointer",
    opacity: 0.7,
  },
  error: { marginTop: 6, color: "#ff7d7d" },
};
