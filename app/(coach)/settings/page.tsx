"use client";

import { useState, useEffect } from "react";
import { getOrgSettings, updateOrgSettings } from "@/lib/data/settings";
import { FORMULAS, type OneRMFormula, type WeightUnit } from "@/lib/one-rm";
import { CHECKIN_CONDITIONS, CHECKIN_RULE_OPTIONS, DEFAULT_CHECKIN_RULES, type CheckInAction, type CheckInRules } from "@/lib/checkin";
import type { OrgSettings } from "@/lib/data/settings";

export default function SettingsPage() {
  const [settings, setSettings] = useState<OrgSettings>({
    one_rm_formula: "lander",
    weight_unit: "kg",
    checkin_enabled: true,
    checkin_rules: DEFAULT_CHECKIN_RULES,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getOrgSettings()
      .then(setSettings)
      .catch(() => setError("Could not load settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateOrgSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={s.loading}>Loading…</div>;

  const selectedFormula = FORMULAS.find((f) => f.id === settings.one_rm_formula);

  return (
    <div style={s.page}>
      <h1 style={s.title}>Settings</h1>
      <p style={s.subtitle}>
        These preferences apply across your whole organisation — all coaches and athletes.
      </p>

      {error && <div style={s.errorBox}>{error}</div>}

      {/* ── Calculations ── */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Calculations</div>

        <div style={s.card}>
          <div style={s.cardLabel}>1RM estimation formula</div>
          <div style={s.cardDesc}>
            Used to estimate an athlete's one-rep max from their training logs.
            All formulas are valid for sets of 1–10 reps; accuracy varies by athlete and training style.
          </div>

          <div style={s.formulaGrid}>
            {FORMULAS.map((f) => {
              const isSelected = settings.one_rm_formula === f.id;
              return (
                <button
                  key={f.id}
                  style={{ ...s.formulaCard, ...(isSelected ? s.formulaCardSelected : {}) }}
                  onClick={() => setSettings((prev) => ({ ...prev, one_rm_formula: f.id as OneRMFormula }))}
                >
                  <div style={s.formulaHeader}>
                    <span style={s.formulaName}>{f.name}</span>
                    {isSelected && <span style={s.formulaCheck}>✓</span>}
                  </div>
                  <div style={s.formulaFormula}>{f.formula}</div>
                  <div style={s.formulaDesc}>{f.description}</div>
                </button>
              );
            })}
          </div>

          {selectedFormula && (
            <div style={s.formulaNote}>
              <strong>{selectedFormula.name}</strong> is currently selected.{" "}
              {selectedFormula.description}
            </div>
          )}
        </div>
      </div>

      {/* ── Units ── */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Units</div>

        <div style={s.card}>
          <div style={s.cardLabel}>Weight unit</div>
          <div style={s.cardDesc}>
            Applies to all weight displays across the app — session logs, goals, PBs, and exports.
            Data is always stored in kg internally; this is a display preference only.
          </div>
          <div style={s.unitToggle}>
            {(["kg", "lbs"] as WeightUnit[]).map((u) => (
              <button
                key={u}
                style={{ ...s.unitBtn, ...(settings.weight_unit === u ? s.unitBtnActive : {}) }}
                onClick={() => setSettings((prev) => ({ ...prev, weight_unit: u }))}
              >
                <div style={s.unitLabel}>{u}</div>
                <div style={s.unitSub}>
                  {u === "kg" ? "Kilograms — standard in most sports" : "Pounds — common in US powerlifting"}
                </div>
              </button>
            ))}
          </div>

          {settings.weight_unit === "lbs" && (
            <div style={s.conversionNote}>
              Example: 100kg = 220.5lbs · 150kg = 330.7lbs · 200kg = 440.9lbs
            </div>
          )}
        </div>
      </div>

      {/* ── Check-in ── */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Check-in</div>

        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={s.cardLabel}>Enable session check-in</div>
              <div style={s.cardDesc}>
                Before each session, athletes answer 4 quick questions and receive readiness recommendations.
                Turn this off to hide the check-in button from all sessions.
              </div>
            </div>
            <button
              style={{
                ...s.toggleSwitch,
                background: settings.checkin_enabled ? "var(--accent)" : "var(--panel2)",
              }}
              onClick={() => setSettings((prev) => ({ ...prev, checkin_enabled: !prev.checkin_enabled }))}
            >
              <div style={{
                ...s.toggleThumb,
                transform: settings.checkin_enabled ? "translateX(20px)" : "translateX(0)",
              }} />
            </button>
          </div>

          {settings.checkin_enabled && (
            <>
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 4 }}>
                <div style={s.cardLabel}>Recommendations per condition</div>
                <div style={s.cardDesc}>
                  When an athlete flags one of these conditions, what should the app recommend?
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {CHECKIN_CONDITIONS.map((condition) => (
                  <div key={condition.key} style={s.ruleRow}>
                    <div style={{ flex: 1 }}>
                      <div style={s.ruleLabel}>{condition.label}</div>
                      <div style={s.ruleDesc}>{condition.description}</div>
                    </div>
                    <select
                      value={settings.checkin_rules[condition.key]}
                      onChange={(e) => setSettings((prev) => ({
                        ...prev,
                        checkin_rules: {
                          ...prev.checkin_rules,
                          [condition.key]: e.target.value as CheckInAction,
                        },
                      }))}
                      style={s.ruleSelect}
                    >
                      {CHECKIN_RULE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Save ── */}
      <div style={s.saveRow}>
        {saved && <span style={s.savedMsg}>✓ Settings saved</span>}
        <button
          style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 680 },
  loading: { fontSize: 14, color: "var(--mute)", padding: 24 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: "0 0 4px" },
  subtitle: { fontSize: 13, color: "var(--mute)", margin: "0 0 28px" },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16 },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 14 },
  cardLabel: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  cardDesc: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5 },
  // Formula cards
  formulaGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 },
  formulaCard: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", textAlign: "left" as const, cursor: "pointer", display: "flex", flexDirection: "column", gap: 6 },
  formulaCardSelected: { background: "var(--accent-dim)", borderColor: "var(--accent)" },
  formulaHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  formulaName: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  formulaCheck: { fontSize: 14, color: "var(--accent)", fontWeight: 700 },
  formulaFormula: { fontSize: 11, fontFamily: "monospace", color: "var(--accent)", background: "var(--panel)", borderRadius: 4, padding: "3px 6px", display: "inline-block" },
  formulaDesc: { fontSize: 11, color: "var(--mute)", lineHeight: 1.4 },
  formulaNote: { fontSize: 12, color: "var(--mute)", background: "var(--ink)", borderRadius: 8, padding: "8px 12px", lineHeight: 1.5 },
  // Unit toggle
  unitToggle: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  unitBtn: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", textAlign: "left" as const, cursor: "pointer" },
  unitBtnActive: { background: "var(--accent-dim)", borderColor: "var(--accent)" },
  unitLabel: { fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 4 },
  unitSub: { fontSize: 12, color: "var(--mute)" },
  conversionNote: { fontSize: 12, color: "var(--mute)", fontStyle: "italic", background: "var(--ink)", borderRadius: 8, padding: "8px 12px" },
  // Save
  saveRow: { display: "flex", alignItems: "center", gap: 14, justifyContent: "flex-end" },
  savedMsg: { fontSize: 13, color: "var(--good)", fontWeight: 600 },
  saveBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  toggleSwitch: { width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative" as const, flexShrink: 0, transition: "background 0.2s" },
  toggleThumb: { position: "absolute" as const, top: 3, left: 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "transform 0.2s" },
  ruleRow: { display: "flex", alignItems: "center", gap: 16, background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" },
  ruleLabel: { fontSize: 14, fontWeight: 600, color: "var(--text)" },
  ruleDesc: { fontSize: 11, color: "var(--mute)", marginTop: 2 },
  ruleSelect: { background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 13, flexShrink: 0, minWidth: 160 },
};
