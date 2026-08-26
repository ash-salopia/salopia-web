// Shared report metric/component selection - originally defined inline in
// ReportRangeModal.tsx (the single-athlete report modal), extracted so the
// bulk Reporting tab can reuse the identical selection shape and UI instead
// of duplicating it. ReportRangeModal re-exports these for backward compat.

import { METRIC_ORDER, type MetricKey } from "@/lib/cardio-metrics";
import type { SquadComparisonMetric } from "@/lib/squad-comparison";

export interface ReportOptions {
  // Metrics - at least one required to generate.
  ttl: boolean; // Total Training Load (tonnage)
  e1rm: boolean; // Estimated 1RM (strength)
  // Per-metric display components - apply to whichever metric(s) above are ticked.
  loadProgression: boolean; // progression table: first/latest/delta/% change per exercise
  highlights: boolean; // top 3 progressed / 3 to review, ranked independently per metric
  sparkline: boolean; // mini-trend per row
  radar: boolean; // Week 1 vs latest snapshot, normalised to % of baseline
  lineChart: boolean; // per-exercise value-over-time chart
  aiSummary: boolean; // AI overview + recurring-notes-themes paragraphs
  coachContext: string; // free-text context fed to the AI summary only (e.g. "returning from hamstring injury") - never shown on the report itself
  athleteNotes: boolean; // raw athlete notes list
  sessionRpe: boolean; // post-session RPE (1-10) graph + range average
  sessionRpeShowAll: boolean; // 0082 — also list every individual session's RPE, not just the graph/average
  powerSpeedTrend: boolean; // per-exercise time/distance trend for power & speed sessions
  barSpeedTrend: boolean; // per-exercise bar speed (m/s) trend, for strength exercises with track_velocity on
  // 0077 — split from one combined "cardioMetricsTrend" so Hyrox and
  // Cardio can be picked independently (Hyrox can be disabled per
  // athlete/org, so its report option needs to be omittable without
  // also losing Cardio).
  cardioMetricsTrend: boolean; // distance/HR/pace/etc trend for cardio sessions with tracked_metrics on
  hyroxMetricsTrend: boolean; // distance/HR/pace/etc trend for hyrox sessions with tracked_metrics on
  // 0083 — which specific metric graphs to actually draw once the trend
  // toggle above is on. Defaults to every metric (nothing excluded yet),
  // so ticking "Cardio/Hyrox metric trends" shows everything until a
  // coach deliberately unticks one they don't want.
  cardioMetricKeys: MetricKey[];
  hyroxMetricKeys: MetricKey[];
  // 0086 — the plain "date + session name" list, independent of whether
  // the metric trend charts are shown. Previously piggybacked on
  // cardioMetricsTrend/hyroxMetricsTrend, so ticking the charts always
  // dragged the raw list along with them - split out so a coach who
  // wants the charts but not a redundant list (or vice versa) can pick
  // either independently. Off by default, unlike the trend charts.
  cardioSessionsList: boolean;
  hyroxSessionsList: boolean;
  trainingLoadTrend: boolean; // 0078 — sRPE (RPE × duration) weekly training load, hyrox+cardio combined
  trainingLoadShowAll: boolean; // 0086 — also list every individual session's training load, not just the graph/total (mirrors sessionRpeShowAll)
  sessionCompletion: boolean; // 0080 — sessions logged + % of prescribed sessions completed, per session type
  // 0075 — "where does this athlete sit relative to their own squad" on
  // their own report (rank/average for TTL and Completion, average-only
  // for Training Load/Session RPE - see lib/squad-comparison.ts for why).
  // Single-athlete flow only - not offered on the bulk Reporting tab,
  // which has no one squad to resolve against.
  squadComparison: boolean;
  squadComparisonGroupId: string | null; // which of the athlete's group(s) to compare against - auto-picked if they're only in one
  squadComparisonMetrics: SquadComparisonMetric[];
  // e1RM-only options - only meaningful (and only enabled in the UI) when e1rm is ticked.
  bodyweightRelative: boolean; // show e1RM ÷ bodyweight instead of raw kg
  exerciseLimit: number; // cap on exercises shown in radar/line chart
  lowConfidenceCap: number; // rep count above which an e1RM estimate is flagged low-confidence
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  ttl: true,
  e1rm: false,
  loadProgression: true,
  highlights: true,
  sparkline: false,
  radar: false,
  lineChart: false,
  aiSummary: true,
  coachContext: "",
  athleteNotes: false,
  sessionRpe: true,
  sessionRpeShowAll: true, // preserves existing behaviour (full per-session list) until a coach opts into the narrower view
  powerSpeedTrend: false,
  barSpeedTrend: false,
  cardioMetricsTrend: false,
  hyroxMetricsTrend: false,
  cardioMetricKeys: [...METRIC_ORDER],
  hyroxMetricKeys: [...METRIC_ORDER],
  cardioSessionsList: false,
  hyroxSessionsList: false,
  trainingLoadTrend: false,
  trainingLoadShowAll: true, // preserves existing behaviour (full per-session list) until a coach opts into the narrower view
  sessionCompletion: false,
  squadComparison: false,
  squadComparisonGroupId: null,
  squadComparisonMetrics: ["ttl", "completion"],
  bodyweightRelative: false,
  exerciseLimit: 8,
  lowConfidenceCap: 12,
};

// 0077 — which session type a field belongs to, so the options form can
// show/hide whole groups behind the Strength/Power-Speed/Cardio/Hyrox
// buttons. Fields with no sessionType (aiSummary, athleteNotes,
// sessionRpe, coachContext) apply across every session type and are
// always shown, not gated behind any one button.
export type ReportSessionType = "strength" | "power_speed" | "cardio" | "hyrox";

export const SESSION_TYPE_META: Record<ReportSessionType, { label: string }> = {
  strength: { label: "Strength" },
  power_speed: { label: "Power/Speed" },
  cardio: { label: "Cardio" },
  hyrox: { label: "Hyrox" },
};

// Every boolean field on ReportOptions that's scoped to one or more session
// types, keyed for lookup by the options form - not just METRIC/COMPONENT/
// SCOPE fields below, since e1RM's own sub-options (bodyweightRelative etc.)
// need the same gating and don't otherwise carry a label/hint. Arrays are
// OR'd - a field shows as soon as any one of its types is active (e.g. bar
// speed applies to velocity-tracked strength exercises AND Power/Speed
// sessions; training load applies to both Cardio and Hyrox).
export const FIELD_SESSION_TYPES: Partial<Record<keyof ReportOptions, ReportSessionType[]>> = {
  ttl: ["strength"],
  e1rm: ["strength"],
  loadProgression: ["strength"],
  highlights: ["strength"],
  sparkline: ["strength"],
  radar: ["strength"],
  lineChart: ["strength"],
  bodyweightRelative: ["strength"],
  exerciseLimit: ["strength"],
  lowConfidenceCap: ["strength"],
  barSpeedTrend: ["strength", "power_speed"],
  powerSpeedTrend: ["power_speed"],
  cardioMetricsTrend: ["cardio"],
  hyroxMetricsTrend: ["hyrox"],
  cardioSessionsList: ["cardio"],
  hyroxSessionsList: ["hyrox"],
  trainingLoadTrend: ["cardio", "hyrox"],
};

export const METRIC_FIELDS: { key: "ttl" | "e1rm"; label: string; hint: string }[] = [
  { key: "ttl", label: "Total Training Load (TTL)", hint: "Total tonnage - sets × reps × weight" },
  { key: "e1rm", label: "Estimated 1RM (e1RM)", hint: "Strength progression, independent of volume" },
];

export const COMPONENT_FIELDS: { key: keyof ReportOptions; label: string; hint: string }[] = [
  { key: "aiSummary", label: "AI summary", hint: "Short AI overview + recurring themes from notes, at the top" },
  { key: "highlights", label: "Highlights", hint: "Top 3 progressed exercises, 3 to review - per metric selected" },
  { key: "loadProgression", label: "Progression table", hint: "First / latest / Δ / % change per exercise" },
  { key: "sparkline", label: "Sparklines", hint: "Small mini-trend chart per exercise row" },
  { key: "radar", label: "Radar snapshot", hint: "Week 1 vs latest, normalised across exercises" },
  { key: "lineChart", label: "Line chart over time", hint: "Per-exercise trend, plotted by week" },
];

// athleteNotes/sessionRpe aren't here - they're universal (not gated
// behind any session-type button) and rendered in their own "General"
// section by ReportOptionsForm.
export const SCOPE_FIELDS: { key: keyof ReportOptions; label: string; hint: string }[] = [
  { key: "powerSpeedTrend", label: "Power/Speed trend charts", hint: "Per-exercise time/distance progress from power & speed sessions" },
  { key: "barSpeedTrend", label: "Bar speed trend charts", hint: "Per-exercise velocity (m/s) progress, for exercises tracking bar speed" },
  { key: "cardioMetricsTrend", label: "Cardio metric trends", hint: "Distance, HR, pace and other tracked metrics from cardio sessions" },
  { key: "hyroxMetricsTrend", label: "Hyrox metric trends", hint: "Distance, HR, pace and other tracked metrics from hyrox sessions" },
  { key: "cardioSessionsList", label: "Cardio session list", hint: "Plain date + session name list, separate from the metric trend charts" },
  { key: "hyroxSessionsList", label: "Hyrox session list", hint: "Plain date + session name list, separate from the metric trend charts" },
  { key: "trainingLoadTrend", label: "Training load (sRPE)", hint: "Weekly RPE × session length, for Hyrox/Cardio sessions with a clear duration" },
];

// 0081 — every boolean field that actually adds content to the report,
// so "can I generate this?" isn't hardcoded to ttl/e1rm (strength-only)
// like it originally was - that blocked generating a Cardio/Hyrox-only
// report entirely, since neither ever ticks a strength metric.
// bodyweightRelative is deliberately excluded - it's a display modifier
// for e1RM, not content on its own.
const CONTENT_FIELD_KEYS: (keyof ReportOptions)[] = [
  "ttl", "e1rm", "aiSummary", "athleteNotes", "sessionRpe",
  "powerSpeedTrend", "barSpeedTrend", "cardioMetricsTrend", "hyroxMetricsTrend",
  "cardioSessionsList", "hyroxSessionsList", "trainingLoadTrend", "sessionCompletion",
];

export function hasAnyContentSelected(options: ReportOptions): boolean {
  return CONTENT_FIELD_KEYS.some((k) => options[k] === true);
}
