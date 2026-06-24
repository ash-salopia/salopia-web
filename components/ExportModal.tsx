"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ExportModal
//
// Used from two places:
//   - Athlete page: mode="single", athleteId + athleteName pre-set
//   - Athletes list: mode="all"
//
// Lets the coach choose: scope (single/all), format (CSV/JSON),
// date range, and which optional data fields to include.
// Core fields (exercise, sets, weight, reps) are pre-ticked.
// Downloads the file directly in the browser.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { todayISO } from "@/lib/date-utils";

// ── Field definitions ─────────────────────────────────────────────────────────

interface FieldDef {
  id: string;
  label: string;
  description: string;
  defaultOn: boolean;
  locked?: boolean; // always included, can't untick
}

const FIELDS: FieldDef[] = [
  {
    id: "exercise",
    label: "Exercise name",
    description: "Name of each exercise in the session",
    defaultOn: true,
    locked: true,
  },
  {
    id: "sets",
    label: "Sets completed / total",
    description: "How many sets were done out of prescribed",
    defaultOn: true,
    locked: true,
  },
  {
    id: "reps",
    label: "Reps logged per set",
    description: "Actual reps performed vs prescribed",
    defaultOn: true,
  },
  {
    id: "weight",
    label: "Weight logged per set (kg)",
    description: "Load used for each set, plus prescribed load",
    defaultOn: true,
  },
  {
    id: "volume",
    label: "Session volume (kg)",
    description: "Sets × reps × weight per exercise and per set",
    defaultOn: true,
  },
  {
    id: "pbs",
    label: "Personal bests",
    description: "All-time best weights per exercise",
    defaultOn: false,
  },
  {
    id: "programme",
    label: "Programme name",
    description: "Which programme(s) the athlete is assigned to",
    defaultOn: false,
  },
  {
    id: "summary",
    label: "AI session summary",
    description: "Saved AI-generated coaching notes per session",
    defaultOn: false,
  },
  {
    id: "notes",
    label: "Coach & athlete notes",
    description: "Exercise notes, athlete set notes, and progress flags",
    defaultOn: false,
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  mode: "single" | "all";
  athleteId?: string;
  athleteName?: string;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExportModal({ mode, athleteId, athleteName, onClose }: Props) {
  const [scope, setScope] = useState<"single" | "all">(mode);
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [dateRange, setDateRange] = useState<"all" | "custom">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(todayISO());
  const [selected, setSelected] = useState<Set<string>>(
    new Set(FIELDS.filter((f) => f.defaultOn || f.locked).map((f) => f.id))
  );
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const toggle = (id: string) => {
    const field = FIELDS.find((f) => f.id === id);
    if (field?.locked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError("");

    const opts = {
      athleteId: scope === "all" ? "all" : athleteId!,
      format,
      fields: Array.from(selected),
      dateFrom: dateRange === "custom" ? dateFrom : undefined,
      dateTo: dateRange === "custom" ? dateTo : undefined,
    };

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Export failed");
      }

      // Trigger browser download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      const scopeLabel = scope === "all" ? "all-athletes" : athleteName?.toLowerCase().replace(/\s+/g, "-") ?? "athlete";
      a.download = `athletiq-export-${scopeLabel}-${date}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed — please try again");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={s.header}>
          <span style={s.title}>📥 Export data</span>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>

        {error && <div style={s.errorBox}>{error}</div>}

        {/* Scope */}
        <div>
          <div style={s.sectionLabel}>Scope</div>
          <div style={s.toggle}>
            <button
              style={{ ...s.toggleBtn, ...(scope === "single" ? s.toggleBtnActive : {}) }}
              onClick={() => setScope("single")}
              disabled={!athleteId}
            >
              {athleteName ?? "This athlete"}
            </button>
            <button
              style={{ ...s.toggleBtn, ...(scope === "all" ? s.toggleBtnActive : {}) }}
              onClick={() => setScope("all")}
            >
              All athletes
            </button>
          </div>
        </div>

        {/* Format */}
        <div>
          <div style={s.sectionLabel}>Format</div>
          <div style={s.toggle}>
            <button
              style={{ ...s.toggleBtn, ...(format === "csv" ? s.toggleBtnActive : {}) }}
              onClick={() => setFormat("csv")}
            >
              CSV <span style={s.formatHint}>Excel, Google Sheets</span>
            </button>
            <button
              style={{ ...s.toggleBtn, ...(format === "json" ? s.toggleBtnActive : {}) }}
              onClick={() => setFormat("json")}
            >
              JSON <span style={s.formatHint}>Power BI, APIs</span>
            </button>
          </div>
        </div>

        {/* Date range */}
        <div>
          <div style={s.sectionLabel}>Date range</div>
          <div style={s.toggle}>
            <button
              style={{ ...s.toggleBtn, ...(dateRange === "all" ? s.toggleBtnActive : {}) }}
              onClick={() => setDateRange("all")}
            >
              All time
            </button>
            <button
              style={{ ...s.toggleBtn, ...(dateRange === "custom" ? s.toggleBtnActive : {}) }}
              onClick={() => setDateRange("custom")}
            >
              Custom range
            </button>
          </div>
          {dateRange === "custom" && (
            <div style={s.dateRow}>
              <div>
                <div style={s.fieldLabel}>From</div>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={s.dateInput}
                />
              </div>
              <div>
                <div style={s.fieldLabel}>To</div>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={s.dateInput}
                />
              </div>
            </div>
          )}
        </div>

        {/* Field selection */}
        <div>
          <div style={s.sectionLabel}>
            Data to include
            <span style={s.sectionSubLabel}> — click to toggle</span>
          </div>
          <div style={s.fieldList}>
            {FIELDS.map((field) => {
              const isOn = selected.has(field.id);
              return (
                <button
                  key={field.id}
                  style={{
                    ...s.fieldRow,
                    ...(isOn ? s.fieldRowOn : s.fieldRowOff),
                    cursor: field.locked ? "default" : "pointer",
                  }}
                  onClick={() => toggle(field.id)}
                >
                  <div style={{ ...s.checkbox, ...(isOn ? s.checkboxOn : {}) }}>
                    {isOn && "✓"}
                    {field.locked && isOn && <span style={{ fontSize: 8, marginLeft: 2 }}>🔒</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={s.fieldName}>{field.label}</div>
                    <div style={s.fieldDesc}>{field.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Download */}
        <div style={s.footer}>
          <div style={s.footerMeta}>
            {selected.size} field{selected.size !== 1 ? "s" : ""} selected · {format.toUpperCase()}
            {scope === "all" ? " · All athletes" : athleteName ? ` · ${athleteName}` : ""}
          </div>
          <button
            style={{ ...s.downloadBtn, opacity: downloading ? 0.6 : 1 }}
            disabled={downloading}
            onClick={handleDownload}
          >
            {downloading ? "Preparing…" : `📥 Download ${format.toUpperCase()}`}
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--text)" },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 22, cursor: "pointer", padding: "0 4px", lineHeight: 1 },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  sectionLabel: { fontSize: 11, color: "var(--mute)", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 },
  sectionSubLabel: { fontWeight: 400, textTransform: "none" as const, opacity: 0.7 },
  toggle: { display: "flex", gap: 6, background: "var(--ink)", borderRadius: 10, padding: 4 },
  toggleBtn: { flex: 1, background: "transparent", border: "none", color: "var(--mute)", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" as const },
  toggleBtnActive: { background: "var(--panel)", color: "var(--text)", boxShadow: "0 1px 3px rgba(0,0,0,.3)" },
  formatHint: { fontSize: 10, color: "var(--mute)", fontWeight: 400, display: "block", marginTop: 1 },
  dateRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 },
  fieldLabel: { fontSize: 11, color: "var(--mute)", fontWeight: 600, marginBottom: 4 },
  dateInput: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 13 },
  fieldList: { display: "flex", flexDirection: "column", gap: 4 },
  fieldRow: { display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid transparent", width: "100%", textAlign: "left" as const },
  fieldRowOn: { background: "var(--accent-dim)", borderColor: "var(--accent)44" },
  fieldRowOff: { background: "var(--ink)", borderColor: "var(--line)" },
  checkbox: { width: 20, height: 20, borderRadius: 5, border: "1px solid var(--line)", background: "var(--panel)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--mute)", flexShrink: 0, marginTop: 1 },
  checkboxOn: { background: "var(--accent)", border: "1px solid var(--accent)", color: "#0a1420" },
  fieldName: { fontSize: 13, fontWeight: 600, color: "var(--text)" },
  fieldDesc: { fontSize: 11, color: "var(--mute)", marginTop: 2 },
  footer: { borderTop: "1px solid var(--line)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 },
  footerMeta: { fontSize: 12, color: "var(--mute)" },
  downloadBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "13px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", width: "100%" },
};
