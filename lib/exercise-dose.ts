// Short prescription text for an exercise, e.g. "4×6 @ 80%", "3×45s",
// "3×8 @ 60kg". Shared by the coach week view and the athlete app's
// workout preview.

/** A bare number in the time field means seconds: "45" -> "45s". */
export function timeLabel(time: string): string {
  const t = time.trim();
  return /^\d+(\.\d+)?$/.test(t) ? `${t}s` : t;
}

/**
 * The reps for one set: a per-set list ("10,8,6", 5/3/1's "5,3,1+") gives
 * that set's own entry (the last one for any extra sets); anything else is
 * the same for every set.
 */
export function repsForSet(reps: string | undefined, setIndex: number): string {
  const r = (reps ?? "").trim();
  if (!r.includes(",")) return r;
  const parts = r.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[Math.min(setIndex, parts.length - 1)] : r;
}

/** Holds, planks, carries and hangs are prescribed by time; everything else by reps. */
export const looksTimed = (name: string) => /\b(plank|hold|iso|isometric|wall sit|carry|hang|bridge hold|l-sit|hollow)\b/i.test(name);

/** "60" -> "60kg"; anything with its own wording ("BW+10", "60kg", "RPE 8") as typed. */
export const loadLabel = (load: string) => (/^\d+(\.\d+)?$/.test(load.trim()) ? `${load.trim()}kg` : load.trim());

type DoseInput = { sets?: number; reps?: string; time?: string; target_load?: string; use_percent_1rm?: boolean; set_percents?: string[] };

/**
 * Per-set schemes (pyramids, 5/3/1, top set + back-offs) as runs of
 * identical sets: "5 @ 65% · 5 @ 75% · 5+ @ 85% · 5×5 @ 65%". null when
 * every set is the same (the plain "4×6 @ 80%" form reads better then).
 */
export function setGroups(ex: DoseInput): string | null {
  const sets = ex.sets && ex.sets > 0 ? ex.sets : 0;
  const pct = ex.use_percent_1rm ? ex.set_percents ?? [] : [];
  const perSetReps = (ex.reps ?? "").includes(",");
  const pctVaries = pct.filter(Boolean).length > 1 && new Set(pct.filter(Boolean)).size > 1;
  if (!sets || (!perSetReps && !pctVaries)) return null;
  const runs: { n: number; reps: string; pct: string }[] = [];
  for (let i = 0; i < sets; i++) {
    const reps = repsForSet(ex.reps, i);
    const p = (pct[i] ?? pct[pct.length - 1] ?? "").replace(/%$/, "");
    const last = runs[runs.length - 1];
    if (last && last.reps === reps && last.pct === p) last.n += 1;
    else runs.push({ n: 1, reps, pct: p });
  }
  const out = runs.map((r) => `${r.n > 1 ? `${r.n}×` : ""}${r.reps || "-"}${r.pct ? ` @ ${r.pct}%` : ""}`).join(" · ");
  const kg = (ex.target_load ?? "").trim();
  return !pct.length && kg ? `${out} @ ${loadLabel(kg)}` : out;
}

export function exerciseDose(ex: DoseInput): string {
  const grouped = setGroups(ex);
  if (grouped) return grouped;
  const work = ((ex.reps ?? "").trim() || timeLabel(ex.time ?? ""));
  let out = ex.sets ? (work ? `${ex.sets}×${work}` : `${ex.sets} sets`) : work;
  const pct = ex.use_percent_1rm ? (ex.set_percents ?? []).filter(Boolean) : [];
  if (pct.length) out += ` @ ${pct[0]}${/%$/.test(pct[0]) ? "" : "%"}${pct.length > 1 && pct.some((p) => p !== pct[0]) ? "+" : ""}`;
  else if ((ex.target_load ?? "").trim()) out += ` @ ${loadLabel(ex.target_load!)}`;
  return out;
}

// Sets/reps the coach didn't say (the parsers return sets null and reps/
// time "" for those): the library entry's own defaults first, else 3 x
// 8-12 (3 x 30s for holds/carries, 3 x 3 for power/speed) - never 0 x 0.
export function defaultDose(
  e: { name: string; sets: number | null; reps: string; time: string },
  lib: { sets?: string | null; reps?: string | null; time?: string | null } | undefined,
  sessionType?: string
): { sets: number; reps: string; time: string } {
  const libSets = parseInt(String(lib?.sets ?? ""), 10);
  const sets = e.sets && e.sets > 0 ? e.sets : libSets > 0 ? libSets : 3;
  const reps = (e.reps ?? "").trim();
  const time = (e.time ?? "").trim();
  if (reps || time) return { sets, reps, time };
  if (lib?.time?.trim()) return { sets, reps: "", time: lib.time.trim() };
  if (lib?.reps?.trim()) return { sets, reps: lib.reps.trim(), time: "" };
  if (looksTimed(e.name)) return { sets, reps: "", time: "30s" };
  return { sets, reps: sessionType === "power_speed" ? "3" : "8-12", time: "" };
}
