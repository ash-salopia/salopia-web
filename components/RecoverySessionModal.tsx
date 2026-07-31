"use client";

import { useState } from "react";
import { createRecoverySession } from "@/lib/data/recovery";
import { todayISO } from "@/lib/date-utils";
import RecoveryQuickForm from "@/components/recovery/RecoveryQuickForm";
import RecoveryBlockBuilder from "@/components/recovery/RecoveryBlockBuilder";
import { RECOVERY_CATEGORIES } from "@/lib/recovery-constants";
import type { RecoveryBlock, RecoveryCategory, RecoveryConfig, RecoveryFormat, Session } from "@/types";

type Step = "format" | "quick" | "guided" | "checklist" | "preset";

// Checklist/Preset land in later phases of this feature — shown
// disabled with a "Coming soon" tag rather than hidden, so the full
// shape of the feature is visible even mid-build.
const FORMAT_CARDS: { key: Step; title: string; desc: string; enabled: boolean }[] = [
  { key: "quick", title: "Quick Prescription", desc: "A few fields — instructions, duration, intensity. Built for speed.", enabled: true },
  { key: "guided", title: "Guided Recovery Routine", desc: "A block-based routine — instructions, mobility drills, timed activities, checklists, media.", enabled: true },
  { key: "checklist", title: "Recovery Checklist", desc: "Tappable behaviours — hydration, walking, mobility, nutrition, sleep targets.", enabled: false },
  { key: "preset", title: "Saved Preset", desc: "Start from a preset your org has saved before.", enabled: false },
];

export default function RecoverySessionModal({
  athleteId,
  athleteName,
  defaultDate,
  onCreated,
  onClose,
}: {
  athleteId: string;
  athleteName: string;
  defaultDate?: string;
  onCreated: (sessions: Session[]) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("format");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<RecoveryCategory | null>(null);
  const [config, setConfig] = useState<RecoveryConfig>({});
  const [blocks, setBlocks] = useState<RecoveryBlock[]>([]);
  const [date, setDate] = useState(defaultDate ?? todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const patchConfig = (patch: Partial<RecoveryConfig>) => setConfig((prev) => ({ ...prev, ...patch }));

  const format: RecoveryFormat | null = step === "quick" ? "quick" : step === "guided" ? "guided" : step === "checklist" ? "checklist" : null;

  const handleSave = async () => {
    if (!name.trim()) { setError("Give the session a title"); return; }
    if (!format) return;
    setSaving(true);
    setError("");
    try {
      const finalConfig = format === "guided" ? { ...config, blocks } : config;
      const sessions = await createRecoverySession({
        athleteIds: [athleteId],
        date,
        name: name.trim(),
        category,
        format,
        config: finalConfig,
      });
      onCreated(sessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create session");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.headerRow}>
          <div style={s.title}>New Recovery session{athleteName ? ` — ${athleteName}` : ""}</div>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>

        {step === "format" && (
          <div style={s.cardGrid}>
            {FORMAT_CARDS.map((c) => (
              <button
                key={c.key}
                disabled={!c.enabled}
                style={{ ...s.formatCard, ...(c.enabled ? {} : s.formatCardDisabled) }}
                onClick={() => c.enabled && setStep(c.key)}
              >
                <div style={s.formatTitleRow}>
                  <span style={s.formatTitle}>{c.title}</span>
                  {!c.enabled && <span style={s.comingSoon}>Coming soon</span>}
                </div>
                <div style={s.formatDesc}>{c.desc}</div>
              </button>
            ))}
          </div>
        )}

        {step === "quick" && (
          <>
            <RecoveryQuickForm
              name={name} onNameChange={setName}
              category={category} onCategoryChange={setCategory}
              config={config} onConfigChange={patchConfig}
            />
            <div>
              <label style={s.label}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={s.input} />
            </div>
            {error && <div style={s.error}>{error}</div>}
            <div style={s.btnRow}>
              <button style={s.ghostBtn} onClick={() => setStep("format")}>← Back</button>
              <button disabled={saving} style={{ ...s.primaryBtn, opacity: saving ? 0.6 : 1 }} onClick={handleSave}>
                {saving ? "Creating…" : "Create session"}
              </button>
            </div>
          </>
        )}

        {step === "guided" && (
          <>
            <div>
              <label style={s.label}>Session title</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Post-match recovery routine" style={s.input} />
            </div>
            <div>
              <label style={s.label}>Recovery category</label>
              <select value={category ?? ""} onChange={(e) => setCategory((e.target.value || null) as RecoveryCategory | null)} style={s.input}>
                <option value="">— Select —</option>
                {RECOVERY_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <RecoveryBlockBuilder blocks={blocks} onChange={setBlocks} />
            <div>
              <label style={s.label}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={s.input} />
            </div>
            {error && <div style={s.error}>{error}</div>}
            <div style={s.btnRow}>
              <button style={s.ghostBtn} onClick={() => setStep("format")}>← Back</button>
              <button disabled={saving} style={{ ...s.primaryBtn, opacity: saving ? 0.6 : 1 }} onClick={handleSave}>
                {saving ? "Creating…" : "Create session"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 19, fontWeight: 700, color: "var(--text)" },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 22, cursor: "pointer", lineHeight: 1 },
  cardGrid: { display: "flex", flexDirection: "column", gap: 10 },
  formatCard: {
    textAlign: "left" as const, background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 12,
    padding: "14px 16px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4,
  },
  formatCardDisabled: { opacity: 0.5, cursor: "not-allowed" },
  formatTitleRow: { display: "flex", alignItems: "center", gap: 8 },
  formatTitle: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  comingSoon: { fontSize: 10, fontWeight: 700, color: "var(--mute)", background: "var(--panel2)", borderRadius: 5, padding: "2px 6px", textTransform: "uppercase" as const, letterSpacing: "0.03em" },
  formatDesc: { fontSize: 12, color: "var(--mute)", lineHeight: 1.4 },
  label: { display: "block", fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 5 },
  input: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" as const },
  error: { fontSize: 13, color: "#FF6B6B" },
  btnRow: { display: "flex", justifyContent: "space-between", gap: 10 },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  primaryBtn: { background: "#2DD4BF", color: "#062a26", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
};
