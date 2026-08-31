"use client";
import BillingSettings from "@/components/BillingSettings";
import BrandingSettings from "@/components/BrandingSettings";
import CoachProfileSettings from "@/components/CoachProfileSettings";
import TeamSettings from "@/components/TeamSettings";
import CollapsibleSection from "@/components/CollapsibleSection";
import PushNotificationToggle from "@/components/PushNotificationToggle";

import { useState, useEffect, useRef } from "react";
import { getOrgSettings, updateOrgSettings, DEFAULT_SETTINGS } from "@/lib/data/settings";
import { FORMULAS, type OneRMFormula, type WeightUnit } from "@/lib/one-rm";
import { CHECKIN_CONDITIONS, CHECKIN_RULE_OPTIONS, DEFAULT_CHECKIN_RULES, type CheckInAction, type CheckInRules } from "@/lib/checkin";
import type { OrgSettings, OneRMSource } from "@/lib/data/settings";

const AUTOSAVE_DEBOUNCE_MS = 600;

export default function SettingsPage() {
  const [settings, setSettings] = useState<OrgSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState("");
  const [orgTier, setOrgTier] = useState<"standard"|"premium">("standard");
  const [orgBranding, setOrgBranding] = useState({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  // Skips the auto-save effect's very first run after the initial load
  // settles - otherwise loading fresh data into `settings` would itself
  // trigger a pointless "save" of the unchanged data straight back.
  const skipNextAutosave = useRef(true);
  const [coachId, setCoachId] = useState("");
  const [coachName, setCoachName] = useState("");
  const [coachAvatarUrl, setCoachAvatarUrl] = useState<string | null>(null);
  const [coachRole, setCoachRole] = useState<"owner" | "coach">("owner");
  const [coachSeatLimit, setCoachSeatLimit] = useState<number | null>(null);

  useEffect(() => {
    getOrgSettings()
      .then(async (s) => {
        setSettings(s);
        const { createClient } = await import("@/lib/supabase-browser");
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: coach } = await supabase.from("coaches").select("organisation_id, name, avatar_url, role").eq("id", user.id).single();
          if (coach) {
            setCoachId(user.id);
            setCoachName(coach.name ?? "");
            setCoachAvatarUrl(coach.avatar_url ?? null);
            setCoachRole(coach.role === "owner" ? "owner" : "coach");
            const { data: org } = await supabase.from("organisations").select("id, tier, branding, coach_seat_limit").eq("id", coach.organisation_id).single();
            if (org) {
              setOrgId(org.id);
              setOrgTier(org.tier ?? "standard");
              setOrgBranding(org.branding ?? {});
              setCoachSeatLimit(org.coach_seat_limit ?? null);
            }
          }
        }
      })
      .catch(() => setError("Could not load settings"))
      .finally(() => setLoading(false));
  }, []);

  // Auto-save: debounced so a run of toggle clicks or keystrokes settles
  // into one write, not one per change. `loading` gates it off until the
  // initial load has settled (see skipNextAutosave above for the run
  // right after that).
  useEffect(() => {
    if (loading) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    // Non-owner coaches can't change these (0060_owner_only_org_settings.sql
    // restricts the organisations row to the owner) - the fieldset below
    // already stops them from editing, but skip firing a save at all
    // rather than let a stray update slip through and hit an RLS error.
    if (coachRole !== "owner") return;
    setSaveStatus("saving");
    const timer = setTimeout(async () => {
      setError("");
      try {
        await updateOrgSettings(settings);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save settings");
        setSaveStatus("idle");
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, loading, coachRole]);

  if (loading) return <div style={s.loading}>Loading…</div>;

  const selectedFormula = FORMULAS.find((f) => f.id === settings.one_rm_formula);

  return (
    <div style={s.page}>
      <div style={s.titleRow}>
        <div>
          <h1 style={s.title}>Settings</h1>
          <p style={s.subtitle}>
            These preferences apply across your whole organisation - all coaches and athletes.
          </p>
        </div>
        {saveStatus !== "idle" && (
          <span style={s.saveStatus}>
            {saveStatus === "saving" ? "Saving…" : "✓ Saved"}
          </span>
        )}
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {coachId && (
        <CoachProfileSettings
          coachId={coachId}
          coachName={coachName}
          avatarUrl={coachAvatarUrl}
          onUpdated={setCoachAvatarUrl}
        />
      )}

      <PushNotificationToggle mode="coach" />

      {coachRole !== "owner" && (
        <div style={s.ownerNote}>
          Only the organisation owner can change these org-wide settings — you can view them below, but changes won't save.
        </div>
      )}

      <fieldset disabled={coachRole !== "owner"} style={s.fieldset}>

      {/* ── Calculations ── */}
      <CollapsibleSection title="Calculations">
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

        <div style={{ ...s.card, marginTop: 10 }}>
          <div style={s.cardLabel}>1RM source for %1RM targets</div>
          <div style={s.cardDesc}>
            When you prescribe an exercise as a percentage of 1RM, this decides which 1RM the
            athlete&apos;s kg target is calculated from.
          </div>
          <div style={s.unitToggle}>
            {([
              { value: "rolling", label: "Rolling", sub: "Estimated automatically from each athlete's training logs" },
              { value: "fixed",   label: "Fixed",   sub: "Values you set per exercise on the athlete's profile (falls back to rolling if unset)" },
            ] as { value: OneRMSource; label: string; sub: string }[]).map((opt) => (
              <button
                key={opt.value}
                style={{ ...s.unitBtn, ...(settings.one_rm_source === opt.value ? s.unitBtnActive : {}) }}
                onClick={() => setSettings((prev) => ({ ...prev, one_rm_source: opt.value }))}
              >
                <div style={s.unitLabel}>{opt.label}</div>
                <div style={s.unitSub}>{opt.sub}</div>
              </button>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Units ── */}
      <CollapsibleSection title="Units">
        <div style={s.card}>
          <div style={s.cardLabel}>Weight unit</div>
          <div style={s.cardDesc}>
            Applies to all weight displays across the app - session logs, goals, PBs, and exports.
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
                  {u === "kg" ? "Kilograms - standard in most sports" : "Pounds - common in US powerlifting"}
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
      </CollapsibleSection>

      {/* ── Session Types ── */}
      <CollapsibleSection title="Session Types">
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={s.cardLabel}>Enable Hybrid sessions</div>
              <div style={s.cardDesc}>
                Show the Hybrid session type when creating sessions for athletes.
                Turn this off if your coaching business doesn&apos;t programme Hybrid training.
              </div>
            </div>
            <button
              style={{
                ...s.toggleSwitch,
                background: settings.hyrox_enabled ? "var(--accent)" : "var(--panel2)",
              }}
              onClick={() => setSettings((prev) => ({ ...prev, hyrox_enabled: !prev.hyrox_enabled }))}
            >
              <div style={{
                ...s.toggleThumb,
                transform: settings.hyrox_enabled ? "translateX(20px)" : "translateX(0)",
              }} />
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Personal Bests ── */}
      <CollapsibleSection title="Personal Bests">
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={s.cardLabel}>Enable Personal Bests</div>
              <div style={s.cardDesc}>
                Detect and celebrate PBs across your organisation - the PB feed, celebration popup, and
                per-athlete PB history. Turn this off if PB tracking isn&apos;t something you want to run.
                Can also be switched off for one athlete at a time from their profile.
              </div>
            </div>
            <button
              style={{
                ...s.toggleSwitch,
                background: settings.pb_enabled ? "var(--accent)" : "var(--panel2)",
              }}
              onClick={() => setSettings((prev) => ({ ...prev, pb_enabled: !prev.pb_enabled }))}
            >
              <div style={{
                ...s.toggleThumb,
                transform: settings.pb_enabled ? "translateX(20px)" : "translateX(0)",
              }} />
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Challenges ── */}
      <CollapsibleSection title="Challenges">
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={s.cardLabel}>Enable Challenges</div>
              <div style={s.cardDesc}>
                Gym challenges you set up (e.g. "furthest on the SkiErg in 30 seconds") with squad
                leaderboards, launchable from Live Group or the Challenges page. Turn this off if it's
                not something you want to run. Can also be switched off for one athlete at a time from
                their profile.
              </div>
            </div>
            <button
              style={{
                ...s.toggleSwitch,
                background: settings.challenges_enabled ? "var(--accent)" : "var(--panel2)",
              }}
              onClick={() => setSettings((prev) => ({ ...prev, challenges_enabled: !prev.challenges_enabled }))}
            >
              <div style={{
                ...s.toggleThumb,
                transform: settings.challenges_enabled ? "translateX(20px)" : "translateX(0)",
              }} />
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Squad comparison ── */}
      <CollapsibleSection title="Squad Comparison">
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={s.cardLabel}>Enable squad comparison in reports</div>
              <div style={s.cardDesc}>
                Lets a coach tick "Compare to squad" on an individual athlete's Training Load Report to
                show their rank/average against their own squad (Total Training Load, Session Completion,
                Training Load, and Session RPE). Turn this off if you don't want that comparison offered.
                Can also be switched off for one athlete at a time from their profile.
              </div>
            </div>
            <button
              style={{
                ...s.toggleSwitch,
                background: settings.squad_comparison_enabled ? "var(--accent)" : "var(--panel2)",
              }}
              onClick={() => setSettings((prev) => ({ ...prev, squad_comparison_enabled: !prev.squad_comparison_enabled }))}
            >
              <div style={{
                ...s.toggleThumb,
                transform: settings.squad_comparison_enabled ? "translateX(20px)" : "translateX(0)",
              }} />
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Check-in ── */}
      <CollapsibleSection title="Check-in">
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
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={s.cardLabel}>Lock programme until check-in completed</div>
                  <div style={s.cardDesc}>
                    Athletes must complete today's check-in before they can log sets on today's programmed session.
                    Session Library workouts and past/future sessions are never locked.
                  </div>
                </div>
                <button
                  style={{
                    ...s.toggleSwitch,
                    background: settings.lock_until_checkin ? "var(--accent)" : "var(--panel2)",
                  }}
                  onClick={() => setSettings((prev) => ({ ...prev, lock_until_checkin: !prev.lock_until_checkin }))}
                >
                  <div style={{
                    ...s.toggleThumb,
                    transform: settings.lock_until_checkin ? "translateX(20px)" : "translateX(0)",
                  }} />
                </button>
              </div>

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
      </CollapsibleSection>

      {/* ── Reports ── */}
      <CollapsibleSection title="Reports">
        <div style={s.card}>
          <div style={s.cardLabel}>Report reminder frequency</div>
          <div style={s.cardDesc}>
            How often you want to be reminded to produce a report for each athlete.
            Athletes with no report in this period will appear on your dashboard.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" as const }}>
            {([
              { value: 4,         label: "4 weeks" },
              { value: 8,         label: "8 weeks" },
              { value: 12,        label: "12 weeks" },
              { value: "monthly", label: "Monthly" },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                style={{
                  ...s.chipBtn,
                  ...(settings.report_frequency_weeks === opt.value ? s.chipBtnActive : {}),
                }}
                onClick={() => setSettings((prev) => ({ ...prev, report_frequency_weeks: opt.value }))}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Recovery alerts ── */}
      <CollapsibleSection title="Recovery alerts">
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={s.cardLabel}>Flag poor recovery on the dashboard</div>
              <div style={s.cardDesc}>
                When an athlete submits end-of-session feedback with a low recovery score,
                they&apos;ll appear on your dashboard once they&apos;ve logged enough of them in the last 7 days.
              </div>
            </div>
            <button
              style={{ ...s.toggleSwitch, background: settings.recovery_alert_enabled ? "var(--accent)" : "var(--panel2)" }}
              onClick={() => setSettings((prev) => ({ ...prev, recovery_alert_enabled: !prev.recovery_alert_enabled }))}
            >
              <div style={{ ...s.toggleThumb, transform: settings.recovery_alert_enabled ? "translateX(20px)" : "translateX(0)" }} />
            </button>
          </div>

          {settings.recovery_alert_enabled && (
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 4 }}>
              <div style={s.cardLabel}>Flag after</div>
              <div style={s.cardDesc}>
                How many low recovery scores in the last 7 days it takes to flag an athlete.
                Set this to 1 to catch a single bad day and adjust tomorrow&apos;s training -                 or 2–3 if you&apos;d rather wait and look for a pattern before acting.
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {([
                  { value: 1, label: "1 low score" },
                  { value: 2, label: "2 low scores" },
                  { value: 3, label: "3 low scores" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    style={{
                      ...s.chipBtn,
                      ...(settings.recovery_alert_threshold === opt.value ? s.chipBtnActive : {}),
                    }}
                    onClick={() => setSettings((prev) => ({ ...prev, recovery_alert_threshold: opt.value }))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* ── Weekly Reflection ── */}
      <CollapsibleSection title="Weekly Reflection">
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={s.cardLabel}>Enable weekly reflections</div>
              <div style={s.cardDesc}>
                Athletes see a reflection prompt every Sunday on their calendar.
                They score the week on key metrics and write a short reflection.
              </div>
            </div>
            <button
              style={{ ...s.toggleSwitch, background: settings.reflection_enabled ? "var(--accent)" : "var(--panel2)" }}
              onClick={() => setSettings((prev) => ({ ...prev, reflection_enabled: !prev.reflection_enabled }))}
            >
              <div style={{ ...s.toggleThumb, transform: settings.reflection_enabled ? "translateX(20px)" : "translateX(0)" }} />
            </button>
          </div>
        </div>

        {settings.reflection_enabled && (
          <>
            {/* Score metrics */}
            <div style={s.card}>
              <div style={s.cardLabel}>Score metrics</div>
              <div style={s.cardDesc}>Athletes will rate each of these 1–5 every week. Drag ☰ to reorder.</div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 6, marginTop: 10 }}>
                {settings.reflection_metrics.map((metric, i) => (
                  <div
                    key={metric.key}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(i)); e.dataTransfer.effectAllowed = "move"; }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; (e.currentTarget as HTMLElement).style.outline = "1px solid var(--accent)"; }}
                    onDragLeave={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
                    onDrop={(e) => {
                      e.preventDefault();
                      (e.currentTarget as HTMLElement).style.outline = "none";
                      const from = parseInt(e.dataTransfer.getData("text/plain"));
                      const to = i;
                      if (from === to) return;
                      setSettings((prev) => {
                        const arr = [...prev.reflection_metrics];
                        const [moved] = arr.splice(from, 1);
                        arr.splice(to, 0, moved);
                        return { ...prev, reflection_metrics: arr };
                      });
                    }}
                    style={{ display: "flex", gap: 8, alignItems: "center", borderRadius: 6 }}
                  >
                    <span style={{ color: "var(--mute)", cursor: "grab", fontSize: 16, userSelect: "none", padding: "0 2px" }}>☰</span>
                    <input
                      style={{ ...s.metricInput, flex: 1 }}
                      value={metric.label}
                      onChange={(e) => setSettings((prev) => ({
                        ...prev,
                        reflection_metrics: prev.reflection_metrics.map((m, j) =>
                          j === i ? { ...m, label: e.target.value } : m
                        ),
                      }))}
                    />
                    <button
                      style={s.removeMetricBtn}
                      onClick={() => setSettings((prev) => ({
                        ...prev,
                        reflection_metrics: prev.reflection_metrics.filter((_, j) => j !== i),
                      }))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  style={s.addMetricBtn}
                  onClick={() => setSettings((prev) => ({
                    ...prev,
                    reflection_metrics: [
                      ...prev.reflection_metrics,
                      { key: `custom_${Date.now()}`, label: "" },
                    ],
                  }))}
                >
                  + Add metric
                </button>
              </div>
            </div>

            {/* Reflection prompts */}
            <div style={s.card}>
              <div style={s.cardLabel}>Reflection prompts</div>
              <div style={s.cardDesc}>The three questions athletes answer in free text.</div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, marginTop: 10 }}>
                {(["reflection_good_prompt", "reflection_better_prompt", "reflection_how_prompt"] as const).map((field, i) => (
                  <div key={field}>
                    <div style={{ fontSize: 11, color: ["#69DB7C", "#FFA94D", "var(--accent)"][i], fontWeight: 700, marginBottom: 4 }}>
                      {["↑ Good", "↗ Better", "→ How"][i]}
                    </div>
                    <input
                      style={s.metricInput}
                      value={settings[field]}
                      onChange={(e) => setSettings((prev) => ({ ...prev, [field]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Power/Speed Benchmarks">
        <div style={s.card}>
          <div style={s.cardLabel}>Benchmarks</div>
          <div style={s.cardDesc}>
            Shown on each athlete's Power/Speed dashboard. An exercise counts toward a benchmark when its logged
            name contains any of that benchmark's match phrases (comma-separated, case-insensitive) - e.g.
            "10m sprint, acceleration sprint" matches both "10m Sprint" and "Acceleration Sprint A1".
          </div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, marginTop: 10 }}>
            {settings.power_speed_benchmarks.map((b, i) => (
              <div key={b.key} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column" as const, gap: 6 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    style={{ ...s.metricInput, width: 40, flex: "0 0 auto", textAlign: "center" as const }}
                    value={b.icon}
                    placeholder="⚡"
                    onChange={(e) => setSettings((prev) => ({
                      ...prev,
                      power_speed_benchmarks: prev.power_speed_benchmarks.map((x, j) => j === i ? { ...x, icon: e.target.value } : x),
                    }))}
                  />
                  <input
                    style={{ ...s.metricInput, flex: 2 }}
                    value={b.label}
                    placeholder="Benchmark name, e.g. 10m Sprint"
                    onChange={(e) => setSettings((prev) => ({
                      ...prev,
                      power_speed_benchmarks: prev.power_speed_benchmarks.map((x, j) => j === i ? { ...x, label: e.target.value } : x),
                    }))}
                  />
                  <input
                    style={{ ...s.metricInput, flex: 1 }}
                    value={b.unit}
                    placeholder="Unit, e.g. s"
                    onChange={(e) => setSettings((prev) => ({
                      ...prev,
                      power_speed_benchmarks: prev.power_speed_benchmarks.map((x, j) => j === i ? { ...x, unit: e.target.value } : x),
                    }))}
                  />
                  <button
                    style={s.removeMetricBtn}
                    onClick={() => setSettings((prev) => ({
                      ...prev,
                      power_speed_benchmarks: prev.power_speed_benchmarks.filter((_, j) => j !== i),
                    }))}
                  >
                    ✕
                  </button>
                </div>
                <input
                  style={s.metricInput}
                  value={b.exerciseNames.join(", ")}
                  placeholder="Match phrases, comma-separated"
                  onChange={(e) => setSettings((prev) => ({
                    ...prev,
                    power_speed_benchmarks: prev.power_speed_benchmarks.map((x, j) =>
                      j === i ? { ...x, exerciseNames: e.target.value.split(",").map((n) => n.trim()).filter(Boolean) } : x
                    ),
                  }))}
                />
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--mute)" }}>
                    <input
                      type="checkbox"
                      checked={b.lowerIsBetter}
                      onChange={(e) => setSettings((prev) => ({
                        ...prev,
                        power_speed_benchmarks: prev.power_speed_benchmarks.map((x, j) => j === i ? { ...x, lowerIsBetter: e.target.checked } : x),
                      }))}
                      style={{ accentColor: "var(--accent)" }}
                    />
                    Lower is better
                  </label>
                  <input
                    style={{ ...s.metricInput, flex: 1 }}
                    type="number"
                    value={b.greenThreshold ?? ""}
                    placeholder="Green threshold"
                    onChange={(e) => setSettings((prev) => ({
                      ...prev,
                      power_speed_benchmarks: prev.power_speed_benchmarks.map((x, j) =>
                        j === i ? { ...x, greenThreshold: e.target.value === "" ? null : parseFloat(e.target.value) } : x
                      ),
                    }))}
                  />
                  <input
                    style={{ ...s.metricInput, flex: 1 }}
                    type="number"
                    value={b.amberThreshold ?? ""}
                    placeholder="Amber threshold"
                    onChange={(e) => setSettings((prev) => ({
                      ...prev,
                      power_speed_benchmarks: prev.power_speed_benchmarks.map((x, j) =>
                        j === i ? { ...x, amberThreshold: e.target.value === "" ? null : parseFloat(e.target.value) } : x
                      ),
                    }))}
                  />
                </div>
              </div>
            ))}
            <button
              style={s.addMetricBtn}
              onClick={() => setSettings((prev) => ({
                ...prev,
                power_speed_benchmarks: [
                  ...prev.power_speed_benchmarks,
                  { key: `custom_${Date.now()}`, label: "", unit: "", lowerIsBetter: true, exerciseNames: [], icon: "⚡", greenThreshold: null, amberThreshold: null },
                ],
              }))}
            >
              + Add benchmark
            </button>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Heart rate & MAS zones">
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={s.cardLabel}>Enable MAS &amp; heart-rate zones</div>
              <div style={s.cardDesc}>
                Adds the aerobic profile (Max HR, resting HR, MAS) to each athlete&apos;s page, a
                Z1&ndash;Z5 picker on Cardio/Hybrid sessions, and a zone table in the athlete app.
                Turn off if you don&apos;t prescribe by zone.
              </div>
            </div>
            <button
              style={{ ...s.toggleSwitch, background: settings.aerobic_zones_enabled ? "var(--accent)" : "var(--panel2)" }}
              onClick={() => setSettings((prev) => ({ ...prev, aerobic_zones_enabled: !prev.aerobic_zones_enabled }))}
            >
              <div style={{ ...s.toggleThumb, transform: settings.aerobic_zones_enabled ? "translateX(20px)" : "translateX(0)" }} />
            </button>
          </div>
        </div>

        {settings.aerobic_zones_enabled && (
        <div style={s.card}>
          <div style={s.cardLabel}>5-zone model</div>
          <div style={s.cardDesc}>
            Each athlete&apos;s Max HR and Maximal Aerobic Speed (set on their profile) turn these
            percentages into bpm and pace targets. Prescribe a zone on a Cardio or Hybrid session and
            the athlete sees their numbers. HR uses the heart-rate-reserve (Karvonen) method when the
            athlete has a resting HR, otherwise plain % of max HR.
          </div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginTop: 6 }}>
            <div style={{ display: "flex", gap: 6, fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.03em" }}>
              <span style={{ flex: 1 }}>Zone name</span>
              <span style={{ width: 66, textAlign: "center" as const }}>HR% lo</span>
              <span style={{ width: 66, textAlign: "center" as const }}>HR% hi</span>
              <span style={{ width: 66, textAlign: "center" as const }}>MAS% lo</span>
              <span style={{ width: 66, textAlign: "center" as const }}>MAS% hi</span>
            </div>
            {settings.zone_model.zones.map((z, i) => {
              const upd = (patch: Partial<typeof z>) => setSettings((prev) => ({
                ...prev,
                zone_model: { zones: prev.zone_model.zones.map((x, j) => j === i ? { ...x, ...patch } : x) },
              }));
              return (
                <div key={z.n} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", width: 24 }}>Z{z.n}</span>
                  <input style={{ ...s.metricInput, flex: 1 }} value={z.name}
                    onChange={(e) => upd({ name: e.target.value })} />
                  {(["hrLowPct", "hrHighPct", "masLowPct", "masHighPct"] as const).map((k) => (
                    <input key={k} type="number" style={{ ...s.metricInput, width: 66, flex: "none" }} value={z[k]}
                      onChange={(e) => upd({ [k]: e.target.value === "" ? 0 : parseFloat(e.target.value) } as Partial<typeof z>)} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Training load & rehab">
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={s.cardLabel}>Track additional training load &amp; rehab data</div>
              <div style={s.cardDesc}>
                For physios and multi-disciplinary teams: session load (RPE &times; duration), acute:chronic
                workload ratio (ACWR), load-spike and monotony flags, a daily wellness &amp; pain check-in,
                and a return-to-play status per athlete. Adds a &ldquo;Sport / Other&rdquo; session type for
                logging non-gym training. Leave off if you only do strength &amp; conditioning &mdash; nothing
                changes anywhere.
              </div>
            </div>
            <button
              style={{ ...s.toggleSwitch, background: settings.load_monitoring_enabled ? "var(--accent)" : "var(--panel2)" }}
              onClick={() => setSettings((prev) => ({ ...prev, load_monitoring_enabled: !prev.load_monitoring_enabled }))}
            >
              <div style={{ ...s.toggleThumb, transform: settings.load_monitoring_enabled ? "translateX(20px)" : "translateX(0)" }} />
            </button>
          </div>

          {settings.load_monitoring_enabled && (
            <>
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 4 }}>
                <div style={s.cardLabel}>Which elements to include</div>
                <div style={s.cardDesc}>Untick anything you don&apos;t want.</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 12, marginTop: 6 }}>
                {([
                  { key: "acwr", label: "Acute:chronic workload ratio (ACWR)", desc: "Compares the last 7 days of training load to the last 28. Below ~0.8 may mean detraining; above ~1.3–1.5 injury risk climbs." },
                  { key: "load_spike_alert", label: "Weekly load-spike alert", desc: "Flags an athlete whose week is well above their recent average." },
                  { key: "monotony_strain", label: "Monotony & strain", desc: "Foster's monotony (how samey the week was) and strain (weekly load × monotony)." },
                  { key: "rtp_status", label: "Return-to-play / availability status", desc: "A status per athlete (available / modified / rehab / return to play / unavailable) shown on the athletes list, dashboard and reports." },
                  { key: "daily_wellness", label: "Daily wellness questions", desc: "Adds fatigue and life-stress to the daily check-in — only for athletes whose availability isn't set to “Available”." },
                  { key: "pain_tracking", label: "Pain tracking", desc: "Adds a 0–10 pain score and body-area to the daily check-in — only for athletes whose availability isn't “Available”." },
                ] as const).map((el) => (
                  <label key={el.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={settings.load_monitoring[el.key]}
                      onChange={(e) => setSettings((prev) => ({
                        ...prev,
                        load_monitoring: { ...prev.load_monitoring, [el.key]: e.target.checked },
                      }))}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{el.label}</div>
                      <div style={s.cardDesc}>{el.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 14 }}>
                <div style={s.cardLabel}>Thresholds</div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, marginTop: 8 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--text)" }}>
                    Flag a weekly load spike above
                    <input type="number" style={{ ...s.metricInput, width: 72, flex: "none" }}
                      value={settings.load_spike_pct}
                      onChange={(e) => setSettings((prev) => ({ ...prev, load_spike_pct: e.target.value === "" ? 0 : parseFloat(e.target.value) }))} />
                    % of the 4-week average
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--text)" }}>
                    ACWR sweet spot
                    <input type="number" step={0.1} style={{ ...s.metricInput, width: 72, flex: "none" }}
                      value={settings.acwr_low}
                      onChange={(e) => setSettings((prev) => ({ ...prev, acwr_low: e.target.value === "" ? 0 : parseFloat(e.target.value) }))} />
                    to
                    <input type="number" step={0.1} style={{ ...s.metricInput, width: 72, flex: "none" }}
                      value={settings.acwr_high}
                      onChange={(e) => setSettings((prev) => ({ ...prev, acwr_high: e.target.value === "" ? 0 : parseFloat(e.target.value) }))} />
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
      </CollapsibleSection>

      </fieldset>

      {orgId && (
        <TeamSettings
          orgId={orgId}
          role={coachRole}
          coachSeatLimit={coachSeatLimit}
        />
      )}
      {orgId && <BillingSettings orgId={orgId} role={coachRole} />}
      <BrandingSettings
        orgId={orgId}
        orgName=""
        tier={orgTier}
        branding={orgBranding}
        onSaved={setOrgBranding}
        role={coachRole}
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
  ownerNote: { background: "var(--panel)", color: "var(--mute)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16 },
  fieldset: { border: "none", margin: 0, padding: 0 },
  chipBtn: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  chipBtnActive: { background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" },
  metricInput: { flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" },
  removeMetricBtn: { background: "transparent", border: "1px solid var(--line)", color: "#FF6B6B", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" },
  addMetricBtn: { background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 0", fontSize: 13, cursor: "pointer" },
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
  // Autosave status
  titleRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  saveStatus: { fontSize: 12, fontWeight: 600, color: "var(--mute)", flexShrink: 0, marginTop: 6 },
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
