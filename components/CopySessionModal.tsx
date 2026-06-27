"use client";

// ============================================================
// CopySessionModal
// Opens from a session card. Lets coaches copy a single session
// to one or more dates with flexible repeat patterns:
//   • Specific date (single copy)
//   • MWF / Tu+Th / Daily / Weekdays / Custom days
//   • Duration: X weeks or between two dates
// ============================================================

import { useState } from "react";
import {
  copySessionToDates,
  generateRepeatDates,
  endDateFromWeeks,
  type RepeatPattern,
} from "@/lib/data/sessions";

interface Props {
  sessionId: string;
  sessionName: string;
  sessionDate: string;
  athleteId: string;
  onDone: (count: number) => void;
  onClose: () => void;
}

const PATTERNS: { value: RepeatPattern; label: string; desc: string }[] = [
  { value: "mwf",     label: "Mon / Wed / Fri",   desc: "3×/week" },
  { value: "tu_th",   label: "Tue / Thu",          desc: "2×/week" },
  { value: "mtwthf",  label: "Weekdays",           desc: "5×/week" },
  { value: "daily",   label: "Every day",          desc: "7×/week" },
  { value: "weekends",label: "Sat / Sun",          desc: "Weekends" },
  { value: "custom",  label: "Custom days",        desc: "Pick days" },
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const WEEK_OPTIONS = [1, 2, 3, 4, 6, 8, 12];

export default function CopySessionModal({
  sessionId, sessionName, sessionDate, athleteId, onDone, onClose,
}: Props) {
  const [mode, setMode] = useState<"single" | "repeat">("single");
  const [targetDate, setTargetDate] = useState("");
  const [pattern, setPattern] = useState<RepeatPattern>("mwf");
  const [customDays, setCustomDays] = useState<number[]>([1, 3, 5]);
  const [durationType, setDurationType] = useState<"weeks" | "range">("weeks");
  const [weeks, setWeeks] = useState(4);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");

  // Preview dates
  const previewDates = (() => {
    if (mode === "single") return targetDate ? [targetDate] : [];
    const start = durationType === "range" ? rangeStart : sessionDate;
    const end = durationType === "range"
      ? rangeEnd
      : endDateFromWeeks(sessionDate, weeks);
    if (!start || !end) return [];
    return generateRepeatDates(
      start > sessionDate ? start : addDay(sessionDate),
      end,
      pattern,
      pattern === "custom" ? customDays : undefined
    ).slice(0, 20); // show max 20 in preview
  })();

  function addDay(date: string): string {
    const d = new Date(date + "T12:00:00Z");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  function formatDate(d: string) {
    return new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short",
    });
  }

  async function handleCopy() {
    if (!previewDates.length) return;
    setCopying(true);
    setError("");
    try {
      const count = await copySessionToDates(sessionId, athleteId, previewDates);
      onDone(count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not copy session");
    } finally {
      setCopying(false);
    }
  }

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        <div style={s.header}>
          <div>
            <div style={s.title}>Copy session</div>
            <div style={s.subtitle}>{sessionName} · {formatDate(sessionDate)}</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error && <div style={s.error}>{error}</div>}

        {/* Mode toggle */}
        <div style={s.modeRow}>
          {(["single", "repeat"] as const).map(m => (
            <button
              key={m}
              style={{ ...s.modeBtn, ...(mode === m ? s.modeBtnActive : {}) }}
              onClick={() => setMode(m)}
            >
              {m === "single" ? "📅 Single date" : "🔁 Repeat pattern"}
            </button>
          ))}
        </div>

        {mode === "single" ? (
          <div style={s.section}>
            <div style={s.label}>Copy to date</div>
            <input type="date" value={targetDate} min={addDay(sessionDate)}
              onChange={e => setTargetDate(e.target.value)} style={s.input} />
          </div>
        ) : (
          <>
            {/* Pattern */}
            <div style={s.section}>
              <div style={s.label}>Repeat pattern</div>
              <div style={s.patternGrid}>
                {PATTERNS.map(p => (
                  <button
                    key={p.value}
                    style={{ ...s.patternBtn, ...(pattern === p.value ? s.patternBtnActive : {}) }}
                    onClick={() => setPattern(p.value)}
                  >
                    <div style={s.patternLabel}>{p.label}</div>
                    <div style={s.patternDesc}>{p.desc}</div>
                  </button>
                ))}
              </div>

              {/* Custom day picker */}
              {pattern === "custom" && (
                <div style={s.dayPicker}>
                  {DAY_LABELS.map((day, i) => (
                    <button
                      key={i}
                      style={{ ...s.dayBtn, ...(customDays.includes(i) ? s.dayBtnActive : {}) }}
                      onClick={() => setCustomDays(prev =>
                        prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Duration */}
            <div style={s.section}>
              <div style={s.label}>Duration</div>
              <div style={s.modeRow}>
                {(["weeks", "range"] as const).map(d => (
                  <button
                    key={d}
                    style={{ ...s.modeBtn, ...(durationType === d ? s.modeBtnActive : {}) }}
                    onClick={() => setDurationType(d)}
                  >
                    {d === "weeks" ? "Next X weeks" : "Date range"}
                  </button>
                ))}
              </div>

              {durationType === "weeks" ? (
                <div style={s.weeksRow}>
                  {WEEK_OPTIONS.map(w => (
                    <button
                      key={w}
                      style={{ ...s.weekBtn, ...(weeks === w ? s.weekBtnActive : {}) }}
                      onClick={() => setWeeks(w)}
                    >
                      {w}w
                    </button>
                  ))}
                </div>
              ) : (
                <div style={s.rangeRow}>
                  <div style={{ flex: 1 }}>
                    <div style={s.label}>From</div>
                    <input type="date" value={rangeStart}
                      onChange={e => setRangeStart(e.target.value)} style={s.input} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={s.label}>To</div>
                    <input type="date" value={rangeEnd}
                      onChange={e => setRangeEnd(e.target.value)} style={s.input} />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Preview */}
        {previewDates.length > 0 && (
          <div style={s.preview}>
            <div style={s.previewTitle}>
              {previewDates.length} session{previewDates.length !== 1 ? "s" : ""} will be created
              {previewDates.length === 20 ? " (showing first 20)" : ""}
            </div>
            <div style={s.dateList}>
              {previewDates.map(d => (
                <div key={d} style={s.dateChip}>{formatDate(d)}</div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={s.actions}>
          <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...s.copyBtn, opacity: !previewDates.length || copying ? 0.5 : 1 }}
            disabled={!previewDates.length || copying}
            onClick={handleCopy}
          >
            {copying ? "Copying…" : `Copy ${previewDates.length || ""} session${previewDates.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" as const, display: "flex", flexDirection: "column" as const, gap: 16 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 18, fontWeight: 700, color: "var(--text)" },
  subtitle: { fontSize: 13, color: "var(--mute)", marginTop: 2 },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer", padding: 4 },
  error: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  modeRow: { display: "flex", gap: 8 },
  modeBtn: { flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  modeBtnActive: { background: "var(--accent-dim)", border: "1px solid var(--accent)", color: "var(--accent)" },
  section: { display: "flex", flexDirection: "column" as const, gap: 8 },
  label: { fontSize: 12, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const },
  input: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14, width: "100%" },
  patternGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 },
  patternBtn: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", cursor: "pointer", textAlign: "left" as const },
  patternBtnActive: { background: "var(--accent-dim)", borderColor: "var(--accent)" },
  patternLabel: { fontSize: 12, fontWeight: 700, color: "var(--text)" },
  patternDesc: { fontSize: 10, color: "var(--mute)", marginTop: 2 },
  dayPicker: { display: "flex", gap: 6 },
  dayBtn: { flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, padding: "6px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  dayBtnActive: { background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" },
  weeksRow: { display: "flex", gap: 6 },
  weekBtn: { flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, padding: "8px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  weekBtnActive: { background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" },
  rangeRow: { display: "flex", gap: 10 },
  preview: { background: "var(--ink)", borderRadius: 10, padding: 12 },
  previewTitle: { fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 8 },
  dateList: { display: "flex", flexWrap: "wrap" as const, gap: 6 },
  dateChip: { fontSize: 11, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, padding: "3px 8px" },
  actions: { display: "flex", gap: 10 },
  cancelBtn: { flex: 1, background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 10, padding: "11px 0", fontSize: 14, cursor: "pointer" },
  copyBtn: { flex: 2, background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" },
};
