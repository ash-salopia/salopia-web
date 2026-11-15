// Reps -> %1RM charts for programming (programme builder "Modify
// prescription" and the session editor's "match the load" prompt).
//
// A coach picks how reps map to %1RM: one of the 1RM formulas the app
// already uses (Settings -> 1RM formula), a classic multi-set strength
// chart (1 = 96%, 2 = 93%, 3 = 90% ... 3% per rep), or their own chart.
// The choice and any custom chart are remembered in org settings.

import { percentForReps, type OneRMFormula } from "@/lib/one-rm";

export const CHART_REPS = 12; // charts cover 1-12 reps; beyond that extrapolates

export type RepSchemeKey = "multiset" | "lander" | "epley" | "brzycki" | "oconner" | "lombardi" | "custom";

export interface RepScheme {
  key: RepSchemeKey;
  chart?: number[]; // custom: chart[i] = %1RM for i + 1 reps
}

const MULTISET = Array.from({ length: CHART_REPS }, (_, i) => 96 - 3 * i); // 96, 93, 90 ... 63

export const REP_SCHEMES: { key: RepSchemeKey; label: string }[] = [
  { key: "multiset", label: "Multi-set strength (1 = 96%, 2 = 93%, 3 = 90% … −3% per rep)" },
  { key: "lander", label: "Lander formula" },
  { key: "epley", label: "Epley formula" },
  { key: "brzycki", label: "Brzycki formula" },
  { key: "oconner", label: "O'Conner formula" },
  { key: "lombardi", label: "Lombardi formula" },
  { key: "custom", label: "My own chart" },
];

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The full 1-12 rep chart for a scheme, e.g. to show or edit it. */
export function chartFor(scheme: RepScheme): number[] {
  if (scheme.key === "multiset") return [...MULTISET];
  if (scheme.key === "custom") {
    const c = scheme.chart ?? [];
    return Array.from({ length: CHART_REPS }, (_, i) => (Number.isFinite(c[i]) && c[i] > 0 ? c[i] : MULTISET[i]));
  }
  return Array.from({ length: CHART_REPS }, (_, i) => round1(percentForReps(i + 1, scheme.key as OneRMFormula)));
}

/** %1RM for N reps under a scheme. Past 12 reps a chart carries on at its last step. */
export function percentFor(reps: number, scheme: RepScheme): number {
  const n = Math.max(1, reps);
  if (scheme.key !== "multiset" && scheme.key !== "custom") return percentForReps(n, scheme.key as OneRMFormula);
  const chart = chartFor(scheme);
  if (n <= chart.length) return chart[n - 1];
  const step = chart[chart.length - 1] - chart[chart.length - 2];
  return Math.max(30, chart[chart.length - 1] + step * (n - chart.length));
}

/**
 * The scheme to start with: the coach's last choice, else the multi-set
 * chart. Not the 1RM formula - formulas give a single all-out rep max
 * (3RM ~ 93%), too heavy to repeat for 3-5 working sets; the multi-set
 * chart sits ~1-2 reps in reserve below it. Formulas stay the right tool
 * for estimating an athlete's 1RM from what they logged.
 */
export function defaultScheme(saved: { rep_scheme?: RepSchemeKey | null; rep_chart?: number[] | null } | null): RepScheme {
  return { key: saved?.rep_scheme ?? "multiset", chart: saved?.rep_chart ?? undefined };
}
