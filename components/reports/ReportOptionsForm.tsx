"use client";

// Metric/component selection form - extracted from ReportRangeModal.tsx so
// the bulk Reporting tab can reuse the identical checkbox UI instead of
// duplicating it. disableCharts hides sparkline/radar/line-chart (not
// supported in the bulk PDF export - only on the single-athlete on-screen
// report), showing a note instead of just silently omitting them.
//
// Session-type buttons (Strength/Power-Speed/Cardio/Hyrox) narrow which
// option groups show below, rather than every one of the ~20 fields being
// visible flatly at once (0077). Hyrox's button can be hidden entirely
// (hyroxEnabled=false) since Hyrox can be turned off per athlete/org -
// there's no point offering a report option for data that can't exist.

import { useEffect, useState } from "react";
import {
  METRIC_FIELDS, COMPONENT_FIELDS, SCOPE_FIELDS, FIELD_SESSION_TYPES, SESSION_TYPE_META,
  DEFAULT_REPORT_OPTIONS, type ReportOptions, type ReportSessionType,
} from "@/lib/report-options";
import { METRIC_ORDER, METRIC_META } from "@/lib/cardio-metrics";
import { getAthleteGroups, type Group } from "@/lib/data/groups";
import type { SquadComparisonMetric } from "@/lib/squad-comparison";

const SESSION_TYPE_ORDER: ReportSessionType[] = ["strength", "power_speed", "cardio", "hyrox"];

const SQUAD_COMPARISON_METRICS: { key: SquadComparisonMetric; label: string }[] = [
  { key: "ttl", label: "Total Training Load" },
  { key: "completion", label: "Session Completion" },
  { key: "trainingLoad", label: "Training Load (sRPE)" },
  { key: "sessionRpe", label: "Session RPE" },
];

export default function ReportOptionsForm({
  options,
  onChange,
  disableCharts = false,
  hyroxEnabled = true,
  athleteId,
  squadComparisonEnabled = false,
  loadMonitoringEnabled = false,
}: {
  options: ReportOptions;
  onChange: (next: ReportOptions) => void;
  disableCharts?: boolean;
  hyroxEnabled?: boolean;
  loadMonitoringEnabled?: boolean;
  // 0075 — "Compare to squad" is only offered when there's one clear
  // athlete to resolve a squad for (the single-athlete report flow) -
  // absent on the bulk Reporting tab's multi-athlete form.
  athleteId?: string;
  squadComparisonEnabled?: boolean;
}) {
  const hasMetric = options.ttl || options.e1rm;
  const set = <K extends keyof ReportOptions>(key: K, value: ReportOptions[K]) =>
    onChange({ ...options, [key]: value });

  const CHART_KEYS = new Set(["sparkline", "radar", "lineChart"]);

  const availableTypes = SESSION_TYPE_ORDER.filter((t) => t !== "hyrox" || hyroxEnabled);

  // Which type sections start open - any type with an already-ticked
  // field (editing an existing preset shouldn't hide options that are
  // already on), so this only needs to track what the coach toggles
  // explicitly from here.
  const [activeTypes, setActiveTypes] = useState<Set<ReportSessionType>>(() => {
    const initial = new Set<ReportSessionType>();
    for (const t of availableTypes) {
      const fieldsForType = (Object.keys(FIELD_SESSION_TYPES) as (keyof ReportOptions)[]).filter((k) => FIELD_SESSION_TYPES[k]?.includes(t));
      if (fieldsForType.some((k) => options[k])) initial.add(t);
    }
    return initial;
  });

  const toggleType = (t: ReportSessionType) => {
    const next = new Set(activeTypes);
    if (next.has(t)) {
      next.delete(t);
      // Closing a type clears its fields OFF rather than just hiding
      // them - otherwise a report could silently include a section the
      // coach can no longer see ticked anywhere. Bug: this previously
      // reset to DEFAULT_REPORT_OPTIONS, not off - several strength
      // fields (ttl, loadProgression, highlights) default to true, so
      // unticking Strength was turning them back ON instead of off
      // (0080). Numeric fields (exerciseLimit etc.) still fall back to
      // their default since "off" isn't meaningful for a number and
      // they're hidden either way. A field can belong to more than one
      // type (e.g. bar speed = strength OR power/speed) - only reset it
      // once NONE of its types remain active in `next`, so closing
      // Strength while Power/Speed stays open doesn't wipe bar speed.
      const fieldsForType = (Object.keys(FIELD_SESSION_TYPES) as (keyof ReportOptions)[]).filter(
        (k) => FIELD_SESSION_TYPES[k]?.includes(t) && !FIELD_SESSION_TYPES[k]?.some((ft) => next.has(ft))
      );
      const patch: Partial<ReportOptions> = {};
      for (const k of fieldsForType) {
        const def = DEFAULT_REPORT_OPTIONS[k];
        (patch as any)[k] = typeof def === "boolean" ? false : def;
      }
      onChange({ ...options, ...patch });
    } else {
      next.add(t);
    }
    setActiveTypes(next);
  };

  const showField = (key: keyof ReportOptions) => {
    const types = FIELD_SESSION_TYPES[key];
    return types == null || types.some((t) => activeTypes.has(t)); // no type = universal, always shown
  };

  // 0075 — the athlete's own squad(s), fetched once for the "Compare to
  // squad" option below. Nothing to compare against with zero groups, so
  // that option simply doesn't render in that case.
  const [squadGroups, setSquadGroups] = useState<Group[]>([]);
  useEffect(() => {
    if (!athleteId || !squadComparisonEnabled) return;
    getAthleteGroups(athleteId).then((groups) => {
      setSquadGroups(groups);
      if (groups.length === 1 && !options.squadComparisonGroupId) {
        onChange({ ...options, squadComparisonGroupId: groups[0].id });
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId, squadComparisonEnabled]);

  const visibleMetricFields = METRIC_FIELDS.filter((f) => showField(f.key));
  const visibleComponentFields = COMPONENT_FIELDS.filter((f) => showField(f.key));
  const visibleScopeFields = SCOPE_FIELDS.filter((f) => showField(f.key));

  return (
    <>
      <div style={s.sectionLabel}>Session types</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {availableTypes.map((t) => {
          const on = activeTypes.has(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              style={{
                background: on ? "var(--accent-dim)" : "var(--ink)",
                border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`,
                color: on ? "var(--accent)" : "var(--mute)",
                borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >
              {SESSION_TYPE_META[t].label}
            </button>
          );
        })}
      </div>
      {activeTypes.size === 0 && (
        <div style={{ ...s.warnText, marginBottom: 16 }}>Pick at least one session type above to see its report options.</div>
      )}

      {activeTypes.size > 0 && (
        <div style={{ marginBottom: 16 }}>
          <label style={s.checkOption}>
            <input
              type="checkbox"
              checked={options.sessionCompletion}
              onChange={(e) => set("sessionCompletion", e.target.checked)}
              style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
            />
            <span>
              <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>Sessions logged & completion</span>
              <span style={{ fontSize: 11, color: "var(--mute)" }}>
                How many sessions were logged, and what % of assigned sessions the athlete actually did — per session type
              </span>
            </span>
          </label>
        </div>
      )}

      {visibleMetricFields.length > 0 && (
        <>
          <div style={s.sectionLabel}>Metrics to include</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
            {visibleMetricFields.map((f) => (
              <label key={f.key} style={s.checkOption}>
                <input
                  type="checkbox"
                  checked={options[f.key]}
                  onChange={(e) => set(f.key, e.target.checked)}
                  style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
                />
                <span>
                  <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>{f.label}</span>
                  <span style={{ fontSize: 11, color: "var(--mute)" }}>{f.hint}</span>
                </span>
              </label>
            ))}
            {!hasMetric && activeTypes.has("strength") && <div style={s.warnText}>Select at least one metric to generate a report.</div>}
          </div>
        </>
      )}

      {visibleComponentFields.length > 0 && (
        <>
          <div style={s.sectionLabel}>Display components</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
            {visibleComponentFields.map((f) => {
              const isChart = CHART_KEYS.has(f.key as string);
              const disabled = disableCharts && isChart;
              return (
                <label key={f.key} style={{ ...s.checkOption, opacity: disabled ? 0.45 : 1 }}>
                  <input
                    type="checkbox"
                    checked={disabled ? false : (options[f.key] as boolean)}
                    disabled={disabled}
                    onChange={(e) => set(f.key as keyof ReportOptions, e.target.checked as any)}
                    style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
                  />
                  <span>
                    <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>{f.label}</span>
                    <span style={{ fontSize: 11, color: "var(--mute)" }}>
                      {disabled ? "Not available in PDF exports - view online for charts" : f.hint}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}

      {options.aiSummary && (
        <>
          <div style={s.sectionLabel}>Context for AI summary</div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...s.fieldLabel, marginBottom: 6 }}>
              Anything the AI should factor in - e.g. &quot;returning from hamstring injury&quot;, so a jump in leg
              e1RM reads as recovery, not just progress
            </div>
            <textarea
              value={options.coachContext}
              onChange={(e) => set("coachContext", e.target.value.slice(0, 500))}
              placeholder="Optional - e.g. returning from injury, competition taper, illness…"
              maxLength={500}
              style={{ ...s.input, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
        </>
      )}

      {activeTypes.has("strength") && (
        <>
          <div style={{ ...s.sectionLabel, opacity: options.e1rm ? 1 : 0.5 }}>e1RM options</div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 16,
              opacity: options.e1rm ? 1 : 0.5,
              pointerEvents: options.e1rm ? "auto" : "none",
            }}
          >
            <label style={s.checkOption}>
              <input
                type="checkbox"
                checked={options.bodyweightRelative}
                disabled={!options.e1rm}
                onChange={(e) => set("bodyweightRelative", e.target.checked)}
                style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
              />
              <span>
                <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>Bodyweight-relative</span>
                <span style={{ fontSize: 11, color: "var(--mute)" }}>Show e1RM ÷ bodyweight instead of raw kg</span>
              </span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={s.fieldLabel}>Exercise limit (radar/chart)</div>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={options.exerciseLimit}
                  disabled={!options.e1rm}
                  onChange={(e) => set("exerciseLimit", parseInt(e.target.value) || 1)}
                  style={s.input}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={s.fieldLabel}>Low-confidence rep cap</div>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={options.lowConfidenceCap}
                  disabled={!options.e1rm}
                  onChange={(e) => set("lowConfidenceCap", parseInt(e.target.value) || 1)}
                  style={s.input}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {visibleScopeFields.length > 0 && (
        <>
          <div style={s.sectionLabel}>Scope</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
            {visibleScopeFields.map((f) => {
              // Cardio/Hyrox metric trends each carry their own nested
              // metric-key checklist, all ticked by default - once the
              // parent toggle is on, every graph it would draw shows up
              // here so a coach can untick individual ones (0083).
              const metricKeyField: "cardioMetricKeys" | "hyroxMetricKeys" | null =
                f.key === "cardioMetricsTrend" ? "cardioMetricKeys" : f.key === "hyroxMetricsTrend" ? "hyroxMetricKeys" : null;
              return (
                <div key={f.key}>
                  <label style={s.checkOption}>
                    <input
                      type="checkbox"
                      checked={options[f.key] as boolean}
                      onChange={(e) => set(f.key as keyof ReportOptions, e.target.checked as any)}
                      style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
                    />
                    <span>
                      <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>{f.label}</span>
                      <span style={{ fontSize: 11, color: "var(--mute)" }}>{f.hint}</span>
                    </span>
                  </label>
                  {metricKeyField && options[f.key] && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 26, marginTop: 2, marginBottom: 6 }}>
                      {METRIC_ORDER.map((key) => {
                        const selected = options[metricKeyField].includes(key);
                        return (
                          <button
                            type="button"
                            key={key}
                            onClick={() =>
                              set(
                                metricKeyField,
                                selected ? options[metricKeyField].filter((k) => k !== key) : [...options[metricKeyField], key]
                              )
                            }
                            style={{
                              background: selected ? "var(--accent-dim)" : "var(--ink)",
                              border: `1px solid ${selected ? "var(--accent)" : "var(--line)"}`,
                              color: selected ? "var(--accent)" : "var(--mute)",
                              borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                            }}
                          >
                            {METRIC_META[key].label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {/* 0086 — mirrors sessionRpeShowAll: off shows just the graph/total, on also lists every individual session */}
                  {f.key === "trainingLoadTrend" && options.trainingLoadTrend && (
                    <label style={{ ...s.checkOption, paddingLeft: 26 }}>
                      <input
                        type="checkbox"
                        checked={options.trainingLoadShowAll}
                        onChange={(e) => set("trainingLoadShowAll", e.target.checked)}
                        style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
                      />
                      <span>
                        <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>List every session</span>
                        <span style={{ fontSize: 11, color: "var(--mute)" }}>
                          Off shows just the graph and weekly totals - on also lists each session&apos;s individual load
                        </span>
                      </span>
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={s.sectionLabel}>General</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
        <label style={s.checkOption}>
          <input
            type="checkbox"
            checked={options.athleteNotes}
            onChange={(e) => set("athleteNotes", e.target.checked)}
            style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
          />
          <span>
            <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>Athlete notes</span>
            <span style={{ fontSize: 11, color: "var(--mute)" }}>Raw list of the athlete's own session/exercise notes</span>
          </span>
        </label>
        <label style={s.checkOption}>
          <input
            type="checkbox"
            checked={options.sessionRpe}
            onChange={(e) => set("sessionRpe", e.target.checked)}
            style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
          />
          <span>
            <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>Session RPE</span>
            <span style={{ fontSize: 11, color: "var(--mute)" }}>Perceived exertion (1-10) logged after each session, plus range average</span>
          </span>
        </label>
        {loadMonitoringEnabled && (
          <label style={s.checkOption}>
            <input
              type="checkbox"
              checked={options.loadMonitoring}
              onChange={(e) => set("loadMonitoring", e.target.checked)}
              style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
            />
            <span>
              <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>Training load &amp; ACWR</span>
              <span style={{ fontSize: 11, color: "var(--mute)" }}>Weekly load, acute:chronic ratio, monotony &amp; strain, availability</span>
            </span>
          </label>
        )}
        {options.sessionRpe && (
          <label style={{ ...s.checkOption, paddingLeft: 26 }}>
            <input
              type="checkbox"
              checked={options.sessionRpeShowAll}
              onChange={(e) => set("sessionRpeShowAll", e.target.checked)}
              style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
            />
            <span>
              <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>List every session</span>
              <span style={{ fontSize: 11, color: "var(--mute)" }}>
                Off shows just the graph and range average - on also lists each session&apos;s individual RPE
              </span>
            </span>
          </label>
        )}

        {squadGroups.length > 0 && (
          <>
            <label style={s.checkOption}>
              <input
                type="checkbox"
                checked={options.squadComparison}
                onChange={(e) => set("squadComparison", e.target.checked)}
                style={{ accentColor: "var(--accent)", marginTop: 2, flexShrink: 0 }}
              />
              <span>
                <span style={{ fontWeight: 600, color: "var(--text)", display: "block" }}>Compare to squad</span>
                <span style={{ fontSize: 11, color: "var(--mute)" }}>
                  Shows where this athlete sits relative to their own squad for whichever metrics you tick below
                </span>
              </span>
            </label>
            {options.squadComparison && (
              <div style={{ paddingLeft: 26, display: "flex", flexDirection: "column", gap: 8, marginBottom: 6 }}>
                {squadGroups.length > 1 && (
                  <select
                    value={options.squadComparisonGroupId ?? ""}
                    onChange={(e) => set("squadComparisonGroupId", e.target.value || null)}
                    style={s.input}
                  >
                    <option value="">- Select a squad -</option>
                    {squadGroups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {SQUAD_COMPARISON_METRICS.map(({ key, label }) => {
                    const selected = options.squadComparisonMetrics.includes(key);
                    return (
                      <button
                        type="button"
                        key={key}
                        onClick={() =>
                          set(
                            "squadComparisonMetrics",
                            selected
                              ? options.squadComparisonMetrics.filter((k) => k !== key)
                              : [...options.squadComparisonMetrics, key]
                          )
                        }
                        style={{
                          background: selected ? "var(--accent-dim)" : "var(--ink)",
                          border: `1px solid ${selected ? "var(--accent)" : "var(--line)"}`,
                          color: selected ? "var(--accent)" : "var(--mute)",
                          borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  fieldLabel: { fontSize: 11, color: "var(--mute)", marginBottom: 4 },
  warnText: { fontSize: 11, color: "#ff7d7d", padding: "4px 2px" },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 },
  checkOption: { display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 2px", cursor: "pointer" },
  input: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
  },
};
