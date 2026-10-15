"use client";

import { useState } from "react";

// Password-gated confirm for permanently deleting athletes (0114). The
// parent does the actual delete in onConfirm(password); any error it
// throws (e.g. "Incorrect delete password.") is shown inline so the
// coach can retry without the modal closing.
export default function DeleteAthleteModal({
  title,
  message,
  confirmLabel = "Delete permanently",
  onConfirm,
  onClose,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm: (password: string) => Promise<void>;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
      setBusy(false);
    }
  };

  return (
    <div style={s.overlay} onClick={() => !busy && onClose()}>
      <form style={s.modal} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div style={s.title}>{title}</div>
        <div style={s.desc}>{message}</div>
        <label style={s.label}>
          Delete password
          <input
            type="password"
            autoFocus
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={s.input}
            placeholder="Set by the owner in Settings"
          />
        </label>
        {error && <div style={s.error}>{error}</div>}
        <div style={s.btnRow}>
          <button type="button" style={s.ghost} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" style={{ ...s.danger, opacity: !password || busy ? 0.5 : 1 }} disabled={!password || busy}>
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", gap: 12 },
  title: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  desc: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--mute)" },
  input: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14, fontFamily: "inherit" },
  error: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "8px 12px", fontSize: 13 },
  btnRow: { display: "flex", justifyContent: "space-between", gap: 10, marginTop: 4 },
  ghost: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  danger: { background: "#ff7d7d", color: "#2a0c0c", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
};
