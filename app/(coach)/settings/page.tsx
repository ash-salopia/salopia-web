"use client";
import BrandingSettings from "@/components/BrandingSettings";

import { useState, useEffect } from "react";
import { getOrgSettings, updateOrgSettings, DEFAULT_SETTINGS } from "@/lib/data/settings";
import { FORMULAS, type OneRMFormula, type WeightUnit } from "@/lib/one-rm";
import { CHECKIN_CONDITIONS, CHECKIN_RULE_OPTIONS, DEFAULT_CHECKIN_RULES, type CheckInAction, type CheckInRules } from "@/lib/checkin";
import type { OrgSettings } from "@/lib/data/settings";

export default function SettingsPage() {
  const [settings, setSettings] = useState<OrgSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [orgTier, setOrgTier] = useState<"standard"|"premium">("standard");
  const [orgBranding, setOrgBranding] = useState({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getOrgSettings()
      .then(async (s) => {
        setSettings(s);
        const { createClient } = await import("@/lib/supabase-browser");
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: coach } = await supabase.from("coaches").select("organisation_id").eq("id", user.id).single();
          if (coach) {
            const { data: org } = await supabase.from("organisations").select("id, tier, branding").eq("id", coach.organisation_id).single();
            if (org) {
              setOrgId(org.id);
              setOrgTier(org.tier ?? "standard");
              setOrgBranding(org.branding ?? {});
            }
          }
        }
      })
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

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {CHECKIN_CONDITIONS.map((condition) => {
                  const action = settings.checkin_rules[condition.key] as CheckInAction;
                  const optMeta = CHECKIN_RULE_OPTIONS.find(o => o.value === action);
                  return (
                    <div key={condition.key} style={s.ruleBlock}>
                      <div style={s.ruleHeader}>
                        <div>
                          <div style={s.ruleLabel}>{condition.label}</div>
                          <div style={s.ruleDesc}>{condition.description}</div>
                        </div>
                        <select
                          value={action}
                          onChange={(e) => setSettings((prev) => ({
                            ...prev,
                            checkin_rules: { ...prev.checkin_rules, [condition.key]: e.target.value as CheckInAction },
                          }))}
                          style={s.ruleSelect}
                        >
                          {CHECKIN_RULE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Description of selected action */}
                      {optMeta?.description && (
                        <div style={s.actionDesc}>{optMeta.description}</div>
                      )}

                      {/* Custom text input */}
                      {action === "custom" && (
                        <textarea
                          value={(settings.checkin_rules as any)[condition.customKey] ?? ""}
                          onChange={e => setSettings(prev => ({
                            ...prev,
                            checkin_rules: { ...prev.checkin_rules, [condition.customKey]: e.target.value },
                          }))}
                          placeholder="Write your custom recommendation for athletes..."
                          rows={2}
                          style={s.customTextarea}
                        />
                      )}

                      {/* Secondary action for high soreness */}
                      {condition.key === "high_soreness" && (
                        <div style={s.secondaryRow}>
                          <div style={s.ruleDesc}>Also recommend:</div>
                          <select
                            value={settings.checkin_rules.high_soreness_also ?? ""}
                            onChange={e => setSettings(prev => ({
                              ...prev,
                              checkin_rules: { ...prev.checkin_rules, high_soreness_also: e.target.value as any },
                            }))}
                            style={{ ...s.ruleSelect, flex: "unset", width: 220 }}
                          >
                            <option value="">Nothing additional</option>
                            <option value="skip_sore_muscles">Skip sore muscle exercises</option>
                            <option value="postpone">Postpone to later in week</option>
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Extra custom rules */}
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 4 }}>
                <div style={s.cardLabel}>Additional custom suggestions</div>
                <div style={s.cardDesc}>
                  These appear for all athletes on every check-in, regardless of scores.
                  Use for team-wide reminders or coaching points.
                </div>
                {(settings.checkin_rules.extra_rules ?? []).map((rule, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                    <input
                      value={rule.text}
                      onChange={e => {
                        const extra_rules = [...(settings.checkin_rules.extra_rules ?? [])];
                        extra_rules[i] = { ...extra_rules[i], text: e.target.value };
                        setSettings(prev => ({ ...prev, checkin_rules: { ...prev.checkin_rules, extra_rules } }));
                      }}
                      placeholder="Custom suggestion text..."
                      style={{ ...s.ruleSelect, flex: 1 }}
                    />
                    <button
                      style={s.removeBtn}
                      onClick={() => {
                        const extra_rules = (settings.checkin_rules.extra_rules ?? []).filter((_, j) => j !== i);
                        setSettings(prev => ({ ...prev, checkin_rules: { ...prev.checkin_rules, extra_rules } }));
                      }}
                    >✕</button>
                  </div>
                ))}
                <button
                  style={s.addRuleBtn}
                  onClick={() => {
                    const extra_rules = [...(settings.checkin_rules.extra_rules ?? []), { label: "", text: "" }];
                    setSettings(prev => ({ ...prev, checkin_rules: { ...prev.checkin_rules, extra_rules } }));
                  }}
                >
                  + Add custom suggestion
                </button>
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
      <BrandingSettings
        orgId={orgId}
        orgName=""
        tier={orgTier}
        branding={orgBranding}
        onSaved={setOrgBranding}
      />
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
  ruleBlock: { background: "var(--panel2)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column" as const, gap: 8 },
  ruleHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  actionDesc: { fontSize: 11, color: "var(--accent)", fontStyle: "italic" as const },
  secondaryRow: { display: "flex", alignItems: "center", gap: 10 },
  customTextarea: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 12, resize: "vertical" as const, fontFamily: "inherit" },
  removeBtn: { background: "transparent", border: "1px solid var(--line)", color: "#FF6B6B", borderRadius: 6, padding: "6px 8px", fontSize: 12, cursor: "pointer", flexShrink: 0 },
  addRuleBtn: { background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer", width: "100%", marginTop: 4 },
  ruleRow: { display: "flex", alignItems: "center", gap: 16, background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" },
  ruleLabel: { fontSize: 14, fontWeight: 600, color: "var(--text)" },
  ruleDesc: { fontSize: 11, color: "var(--mute)", marginTop: 2 },
  ruleSelect: { background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 13, flexShrink: 0, minWidth: 160 },
};
