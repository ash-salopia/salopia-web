// Programme methods for the builder's "Modify prescription" (0132): whole
// periodisation schemes applied to the ticked exercises across the ticked
// weeks in one go - 5/3/1, block periodisation, daily undulating (DUP)
// and double progression. Each one writes sets, reps and per-set %1RM
// (or kg for double progression on a kg exercise); each athlete's kg
// comes from their own 1RM when the programme is loaded.
//
// Weeks are counted from the earliest ticked week ("week 1 of the
// method"), so a method can start part way through a programme. Pure -
// no Supabase.

import type { PrescribedExercise, ProgrammeSession } from "@/types";
import { describeDose, isTimedReps, weekOf } from "@/lib/programme-builder";

export type MethodKey = "531" | "block" | "dup" | "double";

export interface MethodOptions {
  // 5/3/1
  trainingMax: number; // % of 1RM the percentages are taken from (90 = Wendler's default)
  raisePerCycle: number; // training max + this % of 1RM after each cycle
  deloadWeek: boolean; // 4th week deload (else 3-week cycles)
  supplemental: "none" | "fsl" | "bbb";
  // Block / DUP
  weeklyIncrease: number; // %1RM added each week (within a block, or across DUP weeks)
  taper: boolean; // block: last week is a taper (fewer sets, same intensity)
  // Double progression
  repLow: number;
  repHigh: number;
  repStep: number;
  loadJump: number; // %1RM, or kg for kg exercises
}

export const DEFAULT_METHOD_OPTIONS: MethodOptions = {
  trainingMax: 90,
  raisePerCycle: 2.5,
  deloadWeek: true,
  supplemental: "none",
  weeklyIncrease: 2.5,
  taper: true,
  repLow: 8,
  repHigh: 12,
  repStep: 1,
  loadJump: 2.5,
};

export const METHODS: { key: MethodKey; label: string; blurb: string }[] = [
  {
    key: "531",
    label: "5/3/1 (Wendler)",
    blurb:
      "4-week waves from a training max: week 1 5/5/5+ at 65/75/85%, week 2 3/3/3+ at 70/80/90%, week 3 5/3/1+ at 75/85/95%, week 4 deload 5/5/5 at 40/50/60%. The last set is AMRAP (+). The training max rises after each cycle.",
  },
  {
    key: "block",
    label: "Block periodisation",
    blurb:
      "Three blocks across the ticked weeks: accumulation (4 x 8 from 67.5%), intensification (4 x 5 from 77.5%) and realisation (3 x 3 from 85%), rising each week within a block (up to 75 / 85 / 92.5%). Optional taper in the final week.",
  },
  {
    key: "dup",
    label: "Daily undulating (DUP)",
    blurb:
      "Each training day in a week has its own focus: hypertrophy (4 x 10 from 67.5%), strength (5 x 5 from 80%) and power (5 x 3 from 75%, move fast). With two days a week: hypertrophy then strength. Builds for 3 weeks then a lighter week, each wave a step higher.",
  },
  {
    key: "double",
    label: "Double progression",
    blurb:
      "Reps climb each week through a range (e.g. 8 to 12); when the top is reached the load goes up and the reps drop back to the bottom.",
  },
];

const round = (n: number, step = 0.5) => Math.round(n / step) * step;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

// Ticked weeks in order, so "week 1 of the method" is the earliest ticked one.
function weekIndexer(sessions: ProgrammeSession[]) {
  const weeks = Array.from(new Set(sessions.map((s) => weekOf(s.day_offset)))).sort((a, b) => a - b);
  return { count: weeks.length, indexOf: (s: ProgrammeSession) => weeks.indexOf(weekOf(s.day_offset)) };
}

/** Block lengths for N weeks: accumulation ~40%, intensification ~35%, realisation the rest. */
export function blockSplit(weeks: number): [number, number, number] {
  if (weeks <= 1) return [0, 0, Math.max(weeks, 0)];
  if (weeks === 2) return [1, 0, 1];
  const acc = Math.max(1, Math.round(weeks * 0.4));
  const int = Math.max(1, Math.round(weeks * 0.35));
  return [acc, int, Math.max(1, weeks - acc - int)];
}

const WENDLER = [
  { reps: [5, 5, 5], pct: [65, 75, 85] },
  { reps: [3, 3, 3], pct: [70, 80, 90] },
  { reps: [5, 3, 1], pct: [75, 85, 95] },
];
const WENDLER_DELOAD = { reps: [5, 5, 5], pct: [40, 50, 60] };

type Rx = { sets: number; reps: string; percents: number[] };

function rx531(weekIdx: number, o: MethodOptions): Rx & { label: string } {
  const len = o.deloadWeek ? 4 : 3;
  const cycle = Math.floor(weekIdx / len);
  const w = weekIdx % len;
  const tm = (o.trainingMax + cycle * o.raisePerCycle) / 100;
  const deload = w === 3;
  const scheme = deload ? WENDLER_DELOAD : WENDLER[w];
  const pct = scheme.pct.map((p) => round(p * tm));
  const reps = scheme.reps.map(String);
  if (!deload) reps[2] += "+"; // AMRAP last set
  let extra: { reps: string[]; pct: number[] } = { reps: [], pct: [] };
  if (!deload && o.supplemental === "fsl") extra = { reps: Array(5).fill("5"), pct: Array(5).fill(pct[0]) };
  if (!deload && o.supplemental === "bbb") extra = { reps: Array(5).fill("10"), pct: Array(5).fill(round(50 * tm)) };
  const allReps = [...reps, ...extra.reps];
  return {
    sets: allReps.length,
    reps: allReps.join(","),
    percents: [...pct, ...extra.pct],
    label: deload ? `cycle ${cycle + 1} deload` : `cycle ${cycle + 1} week ${w + 1}`,
  };
}

function rxBlock(weekIdx: number, total: number, o: MethodOptions): Rx & { label: string } {
  const [acc, int] = blockSplit(total);
  const phases = [
    // cap: the most a block's reps can carry for repeat sets (multi-set chart, ~1-2 in reserve)
    { name: "accumulation", sets: 4, reps: 8, start: 67.5, cap: 75, len: acc, from: 0 },
    { name: "intensification", sets: 4, reps: 5, start: 77.5, cap: 85, len: int, from: acc },
    { name: "realisation", sets: 3, reps: 3, start: 85, cap: 92.5, len: total - acc - int, from: acc + int },
  ];
  const p = phases.find((ph) => weekIdx >= ph.from && weekIdx < ph.from + ph.len) ?? phases[2];
  const taper = o.taper && total >= 4 && weekIdx === total - 1;
  const step = weekIdx - p.from - (taper ? 1 : 0); // taper week holds the previous week's intensity
  const pct = Math.min(p.cap, round(p.start + Math.max(0, step) * o.weeklyIncrease));
  const sets = taper ? Math.max(1, Math.round(p.sets * 0.6)) : p.sets;
  return { sets, reps: String(p.reps), percents: Array(sets).fill(pct), label: taper ? "taper" : p.name };
}

const DUP_DAYS = [
  { name: "hypertrophy", sets: 4, reps: 10, pct: 67.5, cap: 75 },
  { name: "strength", sets: 5, reps: 5, pct: 80, cap: 87.5 },
  { name: "power", sets: 5, reps: 3, pct: 75, cap: 82.5 },
];

// Waves of 3 build weeks + a lighter 4th (when deloadWeek is on); each
// wave starts one step above the last, so 8 weeks of strength days run
// 80, 82.5, 85, deload, 82.5, 85, 87.5, deload - never a 5x5 at 95%+.
function rxDup(weekIdx: number, dayIdx: number, o: MethodOptions): Rx & { label: string } {
  const d = DUP_DAYS[dayIdx % DUP_DAYS.length];
  const len = o.deloadWeek ? 4 : 3;
  const wave = Math.floor(weekIdx / len);
  const w = weekIdx % len;
  const deload = o.deloadWeek && w === 3;
  const build = Math.min(d.cap, round(d.pct + (wave + Math.min(w, 2)) * o.weeklyIncrease));
  const pct = deload ? round(Math.min(d.cap, d.pct + wave * o.weeklyIncrease) * 0.9) : build;
  const sets = deload ? Math.max(2, d.sets - 2) : d.sets;
  return { sets, reps: String(d.reps), percents: Array(sets).fill(pct), label: deload ? `${d.name} · deload` : d.name };
}

// Double progression: where the reps sit in week N, and how many load jumps so far.
export function doubleStep(weekIdx: number, o: MethodOptions): { reps: number; jumps: number } {
  const lo = Math.max(1, Math.min(o.repLow, o.repHigh));
  const hi = Math.max(lo, o.repHigh);
  const stepsPerRun = Math.max(1, Math.ceil((hi - lo) / Math.max(1, o.repStep)) + 1);
  const run = Math.floor(weekIdx / stepsPerRun);
  const pos = weekIdx % stepsPerRun;
  return { reps: Math.min(hi, lo + pos * Math.max(1, o.repStep)), jumps: run };
}

const skip = (ex: PrescribedExercise) => ex.is_bodyweight || ex.completion_only || (ex.reps ? isTimedReps(ex.reps) : false);

export interface MethodPreviewRow {
  week: number;
  exercise: string;
  before: string;
  after: string;
  note?: string;
}

/**
 * Apply a method to the ticked exercise names across the ticked sessions.
 * Returns every session (changed ones replaced) plus a preview.
 */
export function applyMethod(
  sessions: ProgrammeSession[],
  exerciseNames: string[],
  method: MethodKey,
  opts: Partial<MethodOptions> = {}
): { updated: ProgrammeSession[]; preview: MethodPreviewRow[] } {
  const o = { ...DEFAULT_METHOD_OPTIONS, ...opts };
  const names = new Set(exerciseNames.map((n) => n.trim().toLowerCase()));
  const ordered = [...sessions].sort((a, b) => a.day_offset - b.day_offset || a.sort_order - b.sort_order);
  const { count, indexOf } = weekIndexer(ordered);
  const preview: MethodPreviewRow[] = [];

  // DUP / double progression need the exercise's own week-1 dose and which
  // training day of the week this is for that exercise.
  const firstSeen = new Map<string, PrescribedExercise>();
  const dayCount = new Map<string, number>();

  const updated = ordered.map((s) => {
    const wi = indexOf(s);
    let changed = false;
    const exercises = (s.exercises ?? []).map((ex) => {
      const nm = ex.name.trim().toLowerCase();
      if (!names.has(nm) || skip(ex)) return ex;
      const dk = `${wi}|${nm}`;
      const dayIdx = dayCount.get(dk) ?? 0;
      dayCount.set(dk, dayIdx + 1);
      // Week-1 dose per training day, so Monday's and Thursday's progress separately.
      const fk = `${dayIdx}|${nm}`;
      if (!firstSeen.has(fk)) firstSeen.set(fk, ex);

      let next: PrescribedExercise;
      let note = "";
      if (method === "double") {
        const base = firstSeen.get(fk)!;
        const { reps, jumps } = doubleStep(wi, o);
        const usesPct = base.use_percent_1rm && !!base.set_percents?.length;
        const kg = parseFloat(String(base.target_load ?? ""));
        if (usesPct) {
          next = {
            ...ex,
            reps: String(reps),
            set_percents: (base.set_percents ?? []).map((p) => {
              const v = parseFloat(p);
              return Number.isFinite(v) ? fmt(Math.min(100, round(v + jumps * o.loadJump))) : p;
            }),
          };
        } else if (Number.isFinite(kg) && /^\s*\d+(\.\d+)?\s*(kg)?\s*$/i.test(String(base.target_load))) {
          next = { ...ex, reps: String(reps), target_load: fmt(round(kg + jumps * o.loadJump)) };
        } else {
          next = { ...ex, reps: String(reps) };
        }
        note = jumps ? `load +${fmt(jumps * o.loadJump)}${usesPct ? "%" : "kg"}` : "";
      } else {
        const r = method === "531" ? rx531(wi, o) : method === "block" ? rxBlock(wi, count, o) : rxDup(wi, dayIdx, o);
        next = {
          ...ex,
          sets: r.sets,
          reps: r.reps,
          use_percent_1rm: true,
          use_rir: false,
          set_rir: [],
          set_percents: r.percents.map(fmt),
        };
        note = r.label;
      }
      const before = describeDose(ex);
      const after = describeDose(next);
      preview.push({ week: weekOf(s.day_offset), exercise: ex.name, before, after, note });
      if (JSON.stringify(next) !== JSON.stringify(ex)) changed = true;
      return next;
    });
    return changed ? { ...s, exercises } : s;
  });
  return { updated, preview };
}
