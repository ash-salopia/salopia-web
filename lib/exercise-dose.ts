// Short prescription text for an exercise, e.g. "4×6 @ 80%", "3×45s",
// "3×8 @ 60kg". Shared by the coach week view and the athlete app's
// workout preview.

/** A bare number in the time field means seconds: "45" -> "45s". */
export function timeLabel(time: string): string {
  const t = time.trim();
  return /^\d+(\.\d+)?$/.test(t) ? `${t}s` : t;
}

export function exerciseDose(ex: { sets?: number; reps?: string; time?: string; target_load?: string; use_percent_1rm?: boolean; set_percents?: string[] }): string {
  const work = ((ex.reps ?? "").trim() || timeLabel(ex.time ?? ""));
  let out = ex.sets ? (work ? `${ex.sets}×${work}` : `${ex.sets} sets`) : work;
  const pct = ex.use_percent_1rm ? (ex.set_percents ?? []).filter(Boolean) : [];
  if (pct.length) out += ` @ ${pct[0]}${/%$/.test(pct[0]) ? "" : "%"}${pct.length > 1 && pct.some((p) => p !== pct[0]) ? "+" : ""}`;
  else if ((ex.target_load ?? "").trim()) out += ` @ ${ex.target_load!.trim()}`;
  return out;
}
