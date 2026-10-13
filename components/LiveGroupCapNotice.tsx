"use client";

import Link from "next/link";
import { UPGRADE_HREF } from "@/lib/billing/live-group-limits";

// Shown when starring an athlete would take the Live Group over the
// plan's athlete cap (the message comes from /api/live-group/star).
export default function LiveGroupCapNotice({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div style={styles.box} role="alert">
      <span style={{ flex: 1 }}>{message}</span>
      <Link href={UPGRADE_HREF} style={styles.upgrade}>Upgrade</Link>
      <button style={styles.close} onClick={onClose} aria-label="Dismiss">×</button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  box: {
    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
    background: "var(--accent-dim)", border: "1px solid var(--accent)", color: "var(--text)",
    borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16,
  },
  upgrade: {
    background: "var(--accent)", color: "#0a1420", borderRadius: 8, padding: "7px 14px",
    fontSize: 13, fontWeight: 700, textDecoration: "none", flexShrink: 0,
  },
  close: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer", lineHeight: 1 },
};
