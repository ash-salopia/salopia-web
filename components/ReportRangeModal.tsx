"use client";

import { useState } from "react";
import { todayISO, addDaysISO } from "@/lib/date-utils";

type RangeMode = "4w" | "8w" | "12w" | "all" | "custom";

export default function ReportRangeModal({
  athleteName,
  onGenerate,
  onClose,
}: {
  athleteName: string;
  onGenerate: (start: string | null, end: string | null) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<RangeMode>("4w");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState(todayISO());

  const presets: { key: RangeMode; label: string }[] = [
    { key: "4w", label: "Last 4 weeks" },
    { key: "8w", label: "Last 8 weeks" },
    { key: "12w", label: "Last 12 weeks" },
    { key: "all", label: "All time" },
    { key: "custom", label: "Custom range" },
  ];

  const canGenerate = mode !== "custom" || (customStart && customEnd && customEnd >= customStart);

  const handleGenerate = () => {
    if (mode === "all") {
      onGenerate(null, null);
      return;
    }
    if (mode === "custom") {
      if (!canGenerate) return;
      onGenerate(customStart, customEnd);
      return;
    }
    const weeks = mode === "4w" ? 4 : mode === "8w" ? 8 : 12;
    const end = todayISO();
    const start = addDaysISO(end, -weeks * 7);
    onGenerate(start, end);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.headerRow}>
          <div style={styles.title}>Reports{athleteName ? ` — ${athleteName}` : ""}</div>
          <button style={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>
        <div style={styles.helpText}>Choose how far back this report should cover.</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: mode === "custom" ? 12 : 16 }}>
          {presets.map((p) => (
            <label
              key={p.key}
              style={{
                ...styles.option,
                borderColor: mode === p.key ? "var(--accent)" : "var(--line)",
                background: mode === p.key ? "var(--accent-dim)" : "transparent",
              }}
            >
              <input
                type="radio"
                checked={mode === p.key}
                onChange={() => setMode(p.key)}
                style={{ accentColor: "var(--accent)" }}
              />
              <span style={{ fontWeight: 600, color: mode === p.key ? "var(--accent)" : "var(--text)" }}>
                {p.label}
              </span>
            </label>
          ))}
        </div>

        {mode === "custom" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={styles.fieldLabel}>From</div>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={styles.fieldLabel}>To</div>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={styles.input}
              />
            </div>
          </div>
        )}

        <button
          disabled={!canGenerate}
          style={{ ...styles.primaryBtn, opacity: canGenerate ? 1 : 0.5 }}
          onClick={handleGenerate}
        >
          Generate report
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(6,9,12,.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 60,
    padding: 16,
  },
  modal: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 380,
  },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700 },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 20, cursor: "pointer" },
  helpText: { fontSize: 12, color: "var(--mute)", marginBottom: 12 },
  option: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 10px",
    borderRadius: 8,
    border: "1px solid",
    cursor: "pointer",
  },
  fieldLabel: { fontSize: 11, color: "var(--mute)", marginBottom: 4 },
  input: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
  },
  primaryBtn: {
    width: "100%",
    background: "var(--accent)",
    color: "#0a1420",
    border: "none",
    borderRadius: 10,
    padding: "12px 0",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
};
