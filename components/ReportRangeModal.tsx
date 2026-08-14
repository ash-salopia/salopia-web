"use client";

import { useState } from "react";
import { todayISO, resolveDateRange, type ReportRangeMode } from "@/lib/date-utils";
import { DEFAULT_REPORT_OPTIONS, type ReportOptions } from "@/lib/report-options";
import DateRangePicker from "@/components/reports/DateRangePicker";
import ReportOptionsForm from "@/components/reports/ReportOptionsForm";

export { DEFAULT_REPORT_OPTIONS };
export type { ReportOptions };

export default function ReportRangeModal({
  athleteName,
  onGenerate,
  onClose,
}: {
  athleteName: string;
  onGenerate: (start: string | null, end: string | null, options: ReportOptions) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<ReportRangeMode>("4w");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [options, setOptions] = useState<ReportOptions>(DEFAULT_REPORT_OPTIONS);

  const hasMetric = options.ttl || options.e1rm;
  const canGenerate = hasMetric && (mode !== "custom" || (customStart && customEnd && customEnd >= customStart));

  const handleGenerate = () => {
    if (!canGenerate) return;
    const { start, end } = resolveDateRange(mode, customStart, customEnd);
    onGenerate(start, end, options);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.headerRow}>
          <div style={styles.title}>Reports{athleteName ? ` - ${athleteName}` : ""}</div>
          <button style={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>
        <div style={styles.scrollBody}>
          <div style={styles.helpText}>Choose how far back this report should cover.</div>

          <DateRangePicker
            mode={mode}
            onModeChange={setMode}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
          />

          <ReportOptionsForm options={options} onChange={setOptions} />
        </div>

        <div style={styles.footer}>
          <button
            disabled={!canGenerate}
            style={{ ...styles.primaryBtn, opacity: canGenerate ? 1 : 0.5 }}
            onClick={handleGenerate}
          >
            Generate report
          </button>
        </div>
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
    width: "100%",
    maxWidth: 380,
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 20px 10px",
    flexShrink: 0,
  },
  scrollBody: { overflowY: "auto", padding: "0 20px 4px" },
  footer: {
    flexShrink: 0,
    padding: 16,
    borderTop: "1px solid var(--line)",
  },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700 },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 20, cursor: "pointer" },
  helpText: { fontSize: 12, color: "var(--mute)", marginBottom: 12 },
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
