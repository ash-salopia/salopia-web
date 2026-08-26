"use client";

import { useEffect, useState } from "react";
import { todayISO, resolveDateRange, type ReportRangeMode } from "@/lib/date-utils";
import { DEFAULT_REPORT_OPTIONS, hasAnyContentSelected, type ReportOptions } from "@/lib/report-options";
import { listReportPresets, saveReportPreset, deleteReportPreset, type ReportPreset } from "@/lib/data/report-presets";
import DateRangePicker from "@/components/reports/DateRangePicker";
import ReportOptionsForm from "@/components/reports/ReportOptionsForm";

export { DEFAULT_REPORT_OPTIONS };
export type { ReportOptions };

export default function ReportRangeModal({
  athleteName,
  hyroxEnabled = true,
  onGenerate,
  onClose,
}: {
  athleteName: string;
  hyroxEnabled?: boolean;
  onGenerate: (start: string | null, end: string | null, options: ReportOptions) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<ReportRangeMode>("4w");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [options, setOptions] = useState<ReportOptions>(DEFAULT_REPORT_OPTIONS);

  // 0087 — presets ("athlete" kind) are shared, org-scoped rows in
  // report_presets - the exact same table/list the bulk Reporting tab
  // already saves to, so a preset saved from either place shows up in
  // both. Previously only the bulk tab had this UI at all, which read
  // as "presets don't work" when tried from an individual athlete's
  // page - there was nowhere here to load or save one.
  const [presets, setPresets] = useState<ReportPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [presetSaving, setPresetSaving] = useState(false);
  const [presetError, setPresetError] = useState("");

  useEffect(() => {
    listReportPresets<ReportOptions>("athlete").then(setPresets).catch(() => {});
  }, []);

  const handleLoadPreset = (id: string) => {
    setSelectedPresetId(id);
    const preset = presets.find((p) => p.id === id);
    // Merge over the current defaults rather than trusting the saved
    // JSONB wholesale - a preset saved before a newer ReportOptions
    // field existed would otherwise load with that field undefined.
    if (preset) setOptions({ ...DEFAULT_REPORT_OPTIONS, ...preset.options });
  };

  const handleSavePreset = async () => {
    const name = presetName.trim();
    if (!name) return;
    setPresetError("");
    setPresetSaving(true);
    try {
      const saved = await saveReportPreset<ReportOptions>("athlete", name, options);
      setPresets((prev) => [...prev.filter((p) => p.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setPresetName("");
      setSelectedPresetId(saved.id);
    } catch (e) {
      setPresetError(e instanceof Error ? e.message : "Could not save preset");
    } finally {
      setPresetSaving(false);
    }
  };

  const handleDeletePreset = async (id: string) => {
    setPresetError("");
    try {
      await deleteReportPreset(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
      if (selectedPresetId === id) setSelectedPresetId("");
    } catch (e) {
      setPresetError(e instanceof Error ? e.message : "Could not delete preset");
    }
  };

  const canGenerate = hasAnyContentSelected(options) && (mode !== "custom" || (customStart && customEnd && customEnd >= customStart));

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

          {presets.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={styles.fieldLabel}>Load preset</div>
              <div style={{ display: "flex", gap: 6 }}>
                <select value={selectedPresetId} onChange={(e) => handleLoadPreset(e.target.value)} style={{ ...styles.input, flex: 1 }}>
                  <option value="">- Select a saved preset -</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {selectedPresetId && (
                  <button style={styles.smallGhostBtn} onClick={() => handleDeletePreset(selectedPresetId)} title="Delete this preset">
                    🗑
                  </button>
                )}
              </div>
            </div>
          )}

          <ReportOptionsForm options={options} onChange={setOptions} hyroxEnabled={hyroxEnabled} />

          <div style={{ marginTop: 4, marginBottom: 4 }}>
            <div style={styles.fieldLabel}>Save current metrics as a preset</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name, e.g. Monthly check-in"
                style={{ ...styles.input, flex: 1 }}
              />
              <button
                style={{ ...styles.smallGhostBtn, padding: "9px 14px", opacity: presetName.trim() && !presetSaving ? 1 : 0.5 }}
                disabled={!presetName.trim() || presetSaving}
                onClick={handleSavePreset}
              >
                {presetSaving ? "Saving…" : "💾 Save"}
              </button>
            </div>
            {presetError && <div style={styles.errorHint}>{presetError}</div>}
          </div>
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
  fieldLabel: { fontSize: 11, color: "var(--mute)", marginBottom: 4 },
  errorHint: { fontSize: 12, color: "#ff7d7d", marginTop: 8 },
  input: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
    boxSizing: "border-box" as const,
  },
  smallGhostBtn: {
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    borderRadius: 8,
    padding: "0 10px",
    fontSize: 13,
    cursor: "pointer",
    flexShrink: 0,
  },
};
