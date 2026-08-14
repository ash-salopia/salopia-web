// Shared report metric/component selection - originally defined inline in
// ReportRangeModal.tsx (the single-athlete report modal), extracted so the
// bulk Reporting tab can reuse the identical selection shape and UI instead
// of duplicating it. ReportRangeModal re-exports these for backward compat.

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
  sessionRpe: boolean; // post-session RPE (1-10) list + range average
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
  bodyweightRelative: false,
  exerciseLimit: 8,
  lowConfidenceCap: 12,
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

export const SCOPE_FIELDS: { key: keyof ReportOptions; label: string; hint: string }[] = [
  { key: "athleteNotes", label: "Athlete notes", hint: "Raw list of the athlete's own session/exercise notes" },
  { key: "sessionRpe", label: "Session RPE", hint: "Perceived exertion (1-10) logged after each session, plus range average" },
];
