import type { ReportOptions } from "@/lib/report-options";

// Request body for /api/training-report-ai - mirrors exactly which
// sections the coach ticked, so the AI only discusses those. Shared by
// the first draft (athlete page) and "Ask AI to change this" on the
// report itself.
export function reportAiBody(athleteId: string, rangeStart: string | null, rangeEnd: string | null, options: ReportOptions) {
  return {
    athleteId,
    rangeStart,
    rangeEnd,
    includeTtl: options.ttl,
    includeE1rm: options.e1rm,
    includeNotes: options.athleteNotes,
    includeRpe: options.sessionRpe,
    includeTrainingLoad: options.trainingLoadTrend,
    includeLoadMonitoring: options.loadMonitoring,
    includeCardio: options.cardioMetricsTrend,
    includeHyrox: options.hyroxMetricsTrend,
    includePowerSpeed: options.powerSpeedTrend,
    includeBarSpeed: options.barSpeedTrend,
    cardioMetricKeys: options.cardioMetricKeys,
    hyroxMetricKeys: options.hyroxMetricKeys,
    coachContext: options.coachContext,
  };
}
