"use client";

import { useState } from "react";
import { todayISO, type ReportRangeMode } from "@/lib/date-utils";
import { DEFAULT_REPORT_OPTIONS, type ReportOptions } from "@/lib/report-options";
import ReportTargetPicker from "@/components/reports/ReportTargetPicker";
import DateRangePicker from "@/components/reports/DateRangePicker";
import ReportOptionsForm from "@/components/reports/ReportOptionsForm";

type Tab = "athletes" | "squad";

export default function ReportingPage() {
  const [tab, setTab] = useState<Tab>("athletes");

  // Athlete Reports tab state
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [mode, setMode] = useState<ReportRangeMode>("4w");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [options, setOptions] = useState<ReportOptions>(DEFAULT_REPORT_OPTIONS);
  const [includeBulkAi, setIncludeBulkAi] = useState(false);

  return (
    <div style={s.page}>
      <h1 style={s.title}>Reporting</h1>

      <div style={s.tabRow}>
        {(["athletes", "squad"] as Tab[]).map((t) => (
          <button key={t} style={{ ...s.tabBtn, ...(tab === t ? s.tabBtnActive : {}) }} onClick={() => setTab(t)}>
            {t === "athletes" ? "Athlete Reports" : "Squad Report"}
          </button>
        ))}
      </div>

      {tab === "athletes" ? (
        <div style={s.layout}>
          <div style={s.col}>
            <div style={s.card}>
              <div style={s.cardTitle}>Athletes</div>
              <ReportTargetPicker
                selectedIds={targetIds}
                onChange={(ids) => setTargetIds(ids)}
              />
            </div>
          </div>

          <div style={s.col}>
            <div style={s.card}>
              <div style={s.cardTitle}>Date range</div>
              <DateRangePicker
                mode={mode}
                onModeChange={setMode}
                customStart={customStart}
                customEnd={customEnd}
                onCustomStartChange={setCustomStart}
                onCustomEndChange={setCustomEnd}
              />
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>Metrics</div>
              <ReportOptionsForm options={options} onChange={setOptions} />
            </div>
          </div>
        </div>
      ) : (
        <div style={s.card}>
          <div style={s.emptyNote}>Squad Report coming shortly.</div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: "0 0 16px" },
  tabRow: { display: "flex", gap: 4, border: "1px solid var(--line)", borderRadius: 10, padding: 4, marginBottom: 20, width: "fit-content" },
  tabBtn: { background: "transparent", border: "none", color: "var(--mute)", padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 8 },
  tabBtnActive: { background: "var(--accent-dim)", color: "var(--accent)" },
  layout: { display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" },
  col: { display: "flex", flexDirection: "column", gap: 16 },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 },
  cardTitle: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12, textTransform: "uppercase" as const, letterSpacing: "0.04em" },
  emptyNote: { fontSize: 13, color: "var(--mute)", fontStyle: "italic" },
};
