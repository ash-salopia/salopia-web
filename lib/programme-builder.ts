// Programme builder (0132) - pure helpers for the week x Mon-Sun grid,
// copying sessions/weeks, and progression rules. No Supabase here; the
// page turns these plans into inserts/updates.
//
// Grid maths: day_offset = week * 7 + day, week 0-based, day 0 = Monday.

import type { PrescribedExercise, ProgrammeSession, TemplateDef } from "@/types";
import { toPrescription } from "@/lib/prescription";
import { percentFor, type RepScheme } from "@/lib/rep-charts";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const weekOf = (offset: number) => Math.floor(Math.max(0, offset) / 7);
export const dayOf = (offset: number) => ((offset % 7) + 7) % 7;
export const offsetFor = (week: number, day: number) => week * 7 + day;

// Template defs store days as JS getDay() values (0 = Sun .. 6 = Sat);
// the grid's columns start on Monday.
export const jsDayToGridDay = (d: number) => (d + 6) % 7;

/** Weeks to show: the programme's set length, or enough to hold every session. */
export function programmeWeekCount(weeks: number | null | undefined, sessions: { day_offset: number }[]): number {
  const needed = sessions.length ? weekOf(Math.max(...sessions.map((s) => s.day_offset))) + 1 : 1;
  return Math.max(weeks ?? 0, needed, 1);
}

// The fields a programme session row is built from (no id / programme_id).
export type SessionDraft = Omit<ProgrammeSession, "id" | "programme_id">;

/** A full copy of a session, with fresh exercise ids, at a new day. */
export function copySessionDraft(s: ProgrammeSession | SessionDraft, dayOffset: number, sortOrder: number): SessionDraft {
  return {
    name: s.name,
    type: s.type,
    exercises: (s.exercises ?? []).map((e) => toPrescription(e as unknown as Record<string, unknown>)),
    hyrox_type: s.hyrox_type ?? null,
    hyrox_config: s.hyrox_config ? structuredClone(s.hyrox_config) : null,
    cardio_type: s.cardio_type ?? null,
    cardio_config: s.cardio_config ? structuredClone(s.cardio_config) : null,
    recovery_category: s.recovery_category ?? null,
    recovery_format: s.recovery_format ?? null,
    recovery_config: s.recovery_config ? structuredClone(s.recovery_config) : ({} as ProgrammeSession["recovery_config"]),
    notes: s.notes ?? "",
    sort_order: sortOrder,
    day_offset: dayOffset,
  };
}

export function draftFromTemplateDef(def: TemplateDef, dayOffset: number, sortOrder: number): SessionDraft {
  return copySessionDraft(
    {
      name: def.name,
      type: def.type,
      exercises: def.exercises ?? [],
      hyrox_type: def.hyrox_type ?? null,
      hyrox_config: def.hyrox_config ?? null,
      cardio_type: def.cardio_type ?? null,
      cardio_config: def.cardio_config ?? null,
      recovery_category: def.recovery_category ?? null,
      recovery_format: def.recovery_format ?? null,
      recovery_config: def.recovery_config ?? ({} as ProgrammeSession["recovery_config"]),
      notes: def.notes ?? "",
      sort_order: 0,
      day_offset: 0,
    },
    dayOffset,
    sortOrder
  );
}

export function blankSessionDraft(dayOffset: number, sortOrder: number, name = "New session"): SessionDraft {
  return {
    name,
    type: "strength",
    exercises: [],
    hyrox_type: null,
    hyrox_config: null,
    cardio_type: null,
    cardio_config: null,
    recovery_category: null,
    recovery_format: null,
    recovery_config: {} as ProgrammeSession["recovery_config"],
    notes: "",
    sort_order: sortOrder,
    day_offset: dayOffset,
  };
}

// Sort key that keeps sessions in a day in the order they were added.
export const sortOrderFor = (dayOffset: number, indexInDay: number) => dayOffset * 100 + indexInDay;

/**
 * Copy sessions to other weeks and/or days. With no days given each copy
 * keeps its own weekday; with days, every session is copied onto each of
 * them (e.g. Monday's strength onto Wed, Fri and Sun). A copy that would
 * land exactly where its original already is gets skipped, so the source
 * week can be ticked as a target. Copies never overwrite.
 */
export function planCopyToWeeks(
  sessions: ProgrammeSession[],
  targetWeeks: number[],
  existing: ProgrammeSession[],
  toDays: number[] = []
): SessionDraft[] {
  const perDay = new Map<number, number>();
  for (const s of existing) perDay.set(s.day_offset, (perDay.get(s.day_offset) ?? 0) + 1);
  const out: SessionDraft[] = [];
  for (const w of targetWeeks) {
    for (const s of [...sessions].sort((a, b) => a.day_offset - b.day_offset || a.sort_order - b.sort_order)) {
      for (const day of toDays.length ? toDays : [dayOf(s.day_offset)]) {
        const off = offsetFor(w, day);
        if (off === s.day_offset) continue;
        const idx = perDay.get(off) ?? 0;
        perDay.set(off, idx + 1);
        out.push(copySessionDraft(s, off, sortOrderFor(off, idx)));
      }
    }
  }
  return out;
}

// ── Progression rules ───────────────────────────────────────────────────────
// Tick sessions in the grid, tick exercises by name, then apply a rule.
// The earliest ticked week is the starting point; every later ticked
// session gets base + step x (number of steps reached by that week).

export type ProgressionField = "sets" | "reps" | "load" | "percent" | "rpe" | "rir";

export const PROGRESSION_FIELDS: { key: ProgressionField; label: string; unit: string; step: number }[] = [
  { key: "load", label: "Load (kg)", unit: "kg", step: 2.5 },
  { key: "percent", label: "%1RM", unit: "%", step: 2.5 },
  { key: "reps", label: "Reps", unit: "reps", step: 1 },
  { key: "sets", label: "Sets", unit: "sets", step: 1 },
  { key: "rpe", label: "RPE", unit: "", step: 0.5 },
  { key: "rir", label: "RIR", unit: "", step: 1 },
];

export interface ProgressionRule {
  field: ProgressionField;
  change: number; // per step, e.g. +2.5 or -1
  everyWeeks: number; // 1 = every week, 2 = every other week
  // Deload: every Nth week (counted from the first ticked week) is eased
  // off in the way the coach picks (see DELOAD_KINDS), on top of that
  // week's progressed prescription. No kind = load / %1RM -10%.
  deloadEvery?: number | null;
  deload?: Deload;
  // Reps rules only: keep the same effort as the reps change by moving the
  // %1RM (or kg) along the coach's 1RM formula - e.g. 3 reps @ 90% -> 4
  // reps @ ~87%. Kg for a %1RM prescription is worked out per athlete
  // when the programme is loaded, from their own 1RM.
  matchLoad?: boolean;
  scheme?: RepScheme; // reps -> %1RM chart (formula, multi-set chart or the coach's own)
}

// ── Deloads ────────────────────────────────────────────────────────────────
export type DeloadKind = "load" | "volume" | "sets" | "reps" | "loadSets" | "effort";

export interface Deload {
  kind: DeloadKind;
  amount: number; // % for load / volume / loadSets, a count for the rest
}

export const DELOAD_KINDS: { key: DeloadKind; label: string; amounts: number[]; unit: string; fallback: number; hint: string }[] = [
  { key: "load", label: "Reduce load / %1RM by", amounts: [5, 10, 15, 20, 25, 30], unit: "%", fallback: 10, hint: "Same sets and reps, lighter." },
  { key: "volume", label: "Reduce volume by", amounts: [25, 33, 40, 50], unit: "%", fallback: 40, hint: "Fewer sets (rounded, at least 1), same load." },
  { key: "sets", label: "Reduce sets by", amounts: [1, 2, 3], unit: "sets", fallback: 1, hint: "Same reps and load." },
  { key: "reps", label: "Reduce reps by", amounts: [1, 2, 3, 4], unit: "reps", fallback: 2, hint: "Same sets and load - more reps in reserve." },
  { key: "loadSets", label: "Reduce load / %1RM and 1 set by", amounts: [5, 10, 15, 20], unit: "%", fallback: 10, hint: "The classic deload: lighter and less volume." },
  { key: "effort", label: "Ease effort (RPE -, RIR +) by", amounts: [1, 2], unit: "", fallback: 1, hint: "For exercises prescribed by RPE or RIR." },
];

export const DEFAULT_DELOAD: Deload = { kind: "load", amount: 10 };

const trimSets = (ex: PrescribedExercise, sets: number) => resizeSets(ex, sets);

function lighten(ex: PrescribedExercise, pct: number): Partial<PrescribedExercise> {
  const f = 1 - pct / 100;
  if (ex.use_percent_1rm && ex.set_percents?.length) return { set_percents: ex.set_percents.map((p) => (num(p) === null ? p : fmt(round(num(p)! * f, 0.5)))) };
  if (ex.percent_1rm != null && !ex.set_percents?.length) return { percent_1rm: round(ex.percent_1rm * f, 0.5) };
  const kg = mapLoad(ex.target_load, (v) => v * f);
  return kg === null ? {} : { target_load: kg };
}

/** What a deload week does to one exercise (already progressed for that week). */
export function deloadExercise(ex: PrescribedExercise, d: Deload): Partial<PrescribedExercise> {
  const sets = ex.sets && ex.sets > 0 ? ex.sets : 3;
  switch (d.kind) {
    case "load": return lighten(ex, d.amount);
    case "volume": return trimSets(ex, Math.max(1, Math.round(sets * (1 - d.amount / 100))));
    case "sets": return trimSets(ex, Math.max(1, sets - d.amount));
    case "reps": return ex.reps ? { reps: shiftReps(ex.reps, -d.amount) } : {};
    case "loadSets": {
      const lighter = { ...ex, ...lighten(ex, d.amount) };
      return { ...lighten(ex, d.amount), ...trimSets(lighter, Math.max(1, sets - 1)) };
    }
    case "effort": {
      const out: Partial<PrescribedExercise> = {};
      if (ex.rpe != null) out.rpe = Math.max(1, ex.rpe - d.amount);
      if (ex.use_rir && ex.set_rir?.length) out.set_rir = ex.set_rir.map((r) => (num(r) === null ? r : fmt(Math.min(6, num(r)! + d.amount))));
      return out;
    }
  }
}

/** "4 x 5 @ 84%", "3 x 8 @ 60kg", "3 x 10 RPE 7" - for previews. */
export function describeDose(ex: PrescribedExercise): string {
  const load = ex.use_percent_1rm && ex.set_percents?.length ? ` @ ${pctList(ex.set_percents)}%`
    : ex.percent_1rm != null && ex.use_percent_1rm ? ` @ ${ex.percent_1rm}%`
    : ex.target_load ? ` @ ${ex.target_load}kg` : "";
  const effort = ex.rpe != null ? ` RPE ${ex.rpe}` : ex.use_rir && ex.set_rir?.length ? ` RIR ${ex.set_rir.join("/")}` : "";
  return `${ex.sets ?? "-"} x ${ex.reps || "-"}${load}${effort}`;
}

// Reps per set from a prescription: "10,8,6" -> [10,8,6]; "8-10" -> the
// top of the range (the harder end) for every set; "5" -> 5 each.
export function repsPerSet(reps: string, sets: number): number[] {
  reps = reps.replace(/^\s*\d+\s*[x×]\s*/i, ""); // "4x6" -> "6"
  const parts = reps.split(/[,/]/).map((p) => p.trim()).filter(Boolean);
  const top = (p: string) => Math.max(...(p.match(/\d+/g) ?? ["0"]).map(Number));
  if (parts.length > 1) return Array.from({ length: Math.max(sets, parts.length) }, (_, i) => top(parts[Math.min(i, parts.length - 1)]));
  return Array.from({ length: Math.max(1, sets) }, () => top(reps));
}

/**
 * The %1RM (or kg) an exercise should have at `newReps` to keep the same
 * effort as it has now - e.g. 3 reps @ 90% -> 4 reps @ 87.5%. Empty when
 * there's no load to move (no %1RM and no kg, or reps unreadable).
 */
export function matchLoadToReps(ex: PrescribedExercise, newReps: string, scheme: RepScheme = { key: "multiset" }): Partial<PrescribedExercise> {
  if (!ex.reps || !newReps || isTimedReps(ex.reps)) return {};
  const sets = ex.sets ?? 3;
  const from = repsPerSet(ex.reps, sets);
  const to = repsPerSet(newReps, sets);
  if (!from.some(Boolean) || !to.some(Boolean)) return {};
  if (ex.use_percent_1rm && ex.set_percents?.length) {
    return {
      set_percents: ex.set_percents.map((p, i) => {
        const v = num(p);
        return v === null ? p : fmt(round(scaleForReps(v, from[i] ?? from[0], to[i] ?? to[0], scheme), 0.5));
      }),
    };
  }
  if (!ex.use_percent_1rm && num(ex.target_load) !== null) {
    return { target_load: fmt(round(scaleForReps(num(ex.target_load)!, from[0], to[0], scheme), 0.5)) };
  }
  return {};
}

// Scale an intensity to new reps: value x %(newReps) / %(oldReps).
export function scaleForReps(value: number, fromReps: number, toReps: number, scheme: RepScheme = { key: "multiset" }): number {
  if (!fromReps || !toReps || fromReps === toReps) return value;
  return (value * percentFor(toReps, scheme)) / percentFor(fromReps, scheme);
}

/**
 * Set an exercise's per-set %1RM straight from its reps on the chosen
 * chart (e.g. multi-set: 3 reps -> 90%, 5 -> 84%), plus an optional
 * adjustment (e.g. -5 for a lighter week). Turns %1RM on.
 */
export function percentsFromReps(ex: PrescribedExercise, scheme: RepScheme, adjust = 0): Partial<PrescribedExercise> | null {
  if (!ex.reps || isTimedReps(ex.reps)) return null;
  const sets = ex.sets && ex.sets > 0 ? ex.sets : 3;
  const reps = repsPerSet(ex.reps, sets);
  if (!reps.some(Boolean)) return null;
  return {
    use_percent_1rm: true,
    use_rir: false,
    set_percents: Array.from({ length: sets }, (_, i) => fmt(round(Math.max(0, percentFor(reps[i] ?? reps[0], scheme) + adjust), 0.5))),
  };
}

const num = (s: unknown): number | null => {
  const n = parseFloat(String(s ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const round = (n: number, step: number) => {
  const r = Math.round(n / step) * step;
  return Number.isInteger(step) ? Math.round(r) : Math.round(r * 100) / 100;
};
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

// "8-10" -> shift both ends; "10,8,6" -> shift each; "8" -> shift.
// "5x5" / "3 x 8" (sets typed into reps) -> only the reps side moves.
function shiftReps(reps: string, delta: number): string {
  const shift = (t: string) => t.replace(/\d+(\.\d+)?/g, (m) => String(Math.max(1, Math.round(parseFloat(m) + delta))));
  const x = reps.match(/^(\s*\d+\s*[x×]\s*)(.*)$/i);
  return x ? x[1] + shift(x[2]) : shift(reps);
}

// Timed work ("30s", "2 min") isn't reps - no %1RM chart applies to it.
export const isTimedReps = (reps: string) => /\d\s*(s|sec|secs|seconds|min|mins|minutes)\b/i.test(reps);

// A kg prescription as text: "60" / "60kg" is a plain number; "BW+10" or
// "40-50" keep their wording and only the numbers move. null = no number.
function mapLoad(text: string | undefined, f: (kg: number) => number): string | null {
  const t = String(text ?? "").trim();
  if (!/\d/.test(t)) return null;
  const tidy = (n: number) => fmt(Math.max(0, round(n, 0.5)));
  if (/^\d+(\.\d+)?\s*(kg)?$/i.test(t)) return tidy(f(parseFloat(t)));
  return t.replace(/\d+(\.\d+)?/g, (m) => tidy(f(parseFloat(m))));
}

// Change the set count, keeping per-set %1RM / RIR lists in step: extra
// sets repeat the last set's value, dropped sets lose theirs.
export function resizeSets(ex: PrescribedExercise, sets: number): Partial<PrescribedExercise> {
  const fit = (list: string[] | undefined) =>
    !list?.length || list.length === sets ? null : list.length > sets ? list.slice(0, sets) : [...list, ...Array(sets - list.length).fill(list[list.length - 1])];
  const pcts = fit(ex.set_percents);
  const rir = fit(ex.set_rir);
  return { sets, ...(pcts ? { set_percents: pcts } : {}), ...(rir ? { set_rir: rir } : {}) };
}

// What a rule does to one exercise, given how many steps to apply.
// Returns null when the exercise has nothing to change for this field.
// Deload weeks are handled separately (deloadExercise).
export function progressExercise(base: PrescribedExercise, rule: ProgressionRule, steps: number): Partial<PrescribedExercise> | null {
  const delta = rule.change * steps;
  switch (rule.field) {
    case "sets": {
      const b = base.sets ?? 3;
      return resizeSets(base, Math.max(1, Math.round(b + delta)));
    }
    case "reps": {
      if (!base.reps) return null;
      const reps = shiftReps(base.reps, delta);
      if (!rule.matchLoad) return { reps };
      const matched = matchLoadToReps(base, reps, rule.scheme);
      if (Object.keys(matched).length) return { reps, ...matched };
      // No %1RM or kg to move yet: set %1RM straight from the chart, so
      // reps and %1RM change in one go. Not for bodyweight / tick-only work.
      if (base.is_bodyweight || base.completion_only || isTimedReps(base.reps)) return { reps };
      return { reps, ...(percentsFromReps({ ...base, reps }, rule.scheme ?? { key: "multiset" }) ?? {}) };
    }
    case "load": {
      if (base.use_percent_1rm && base.set_percents?.length) return null; // loads come from %1RM
      const v = mapLoad(base.target_load, (kg) => kg + delta);
      return v === null ? null : { target_load: v };
    }
    case "percent": {
      // Only exercises prescribed by %1RM - a kg exercise with an old,
      // switched-off % list is left as kg.
      const list = base.use_percent_1rm && base.set_percents?.length ? base.set_percents : null;
      if (!list && (base.percent_1rm == null || base.set_percents?.length)) return null;
      const shift = (p: number) => Math.min(120, Math.max(0, round(p + delta, 0.5)));
      if (list) return { use_percent_1rm: true, set_percents: list.map((p) => (num(p) === null ? p : fmt(shift(num(p)!)))) };
      return { percent_1rm: shift(base.percent_1rm!) };
    }
    case "rpe": {
      if (base.rpe == null) return null;
      return { rpe: Math.min(10, Math.max(1, round(base.rpe + delta, 0.5))) };
    }
    case "rir": {
      const list = base.use_rir && base.set_rir?.length ? base.set_rir : null;
      if (!list) return null;
      return { use_rir: true, set_rir: list.map((r) => (num(r) === null ? r : fmt(Math.min(6, Math.max(0, Math.round(num(r)! + delta)))))) };
    }
  }
}

export interface ProgressionPreviewRow {
  sessionId: string;
  week: number;
  exercise: string;
  before: string;
  after: string;
}

// "84/84/84%" -> "84%"; a varied scheme stays "75/80/85%".
export const pctList = (list: string[]) => (new Set(list).size === 1 ? list[0] : list.join("/"));

export function describeField(ex: PrescribedExercise, field: ProgressionField): string {
  switch (field) {
    case "sets": return `${ex.sets ?? "-"} sets`;
    case "reps": {
      if (!ex.reps) return "-";
      const pct = ex.use_percent_1rm && ex.set_percents?.length ? ` @ ${pctList(ex.set_percents)}%` : ex.target_load ? ` @ ${ex.target_load}kg` : "";
      return `${ex.reps} reps${pct}`;
    }
    case "load": return ex.target_load ? `${ex.target_load}kg` : "-";
    case "percent": return ex.set_percents?.length ? `${pctList(ex.set_percents)}%` : ex.percent_1rm != null ? `${ex.percent_1rm}%` : "-";
    case "rpe": return ex.rpe != null ? `RPE ${ex.rpe}` : "-";
    case "rir": return ex.set_rir?.length ? `RIR ${ex.set_rir.join("/")}` : "-";
  }
}

/**
 * Apply a rule to the ticked sessions, for the ticked exercise names.
 * The baseline for each exercise is its prescription in the earliest
 * ticked week it appears in (per weekday, so Monday's squat progresses
 * from Monday's and Thursday's from Thursday's).
 */
export function applyProgression(
  sessions: ProgrammeSession[],
  exerciseNames: string[],
  rule: ProgressionRule
): { updated: ProgrammeSession[]; preview: ProgressionPreviewRow[] } {
  const names = new Set(exerciseNames.map((n) => n.trim().toLowerCase()));
  const ordered = [...sessions].sort((a, b) => a.day_offset - b.day_offset);
  const startWeek = ordered.length ? weekOf(ordered[0].day_offset) : 0;
  // Baseline per (weekday, session, exercise). The same session name twice
  // in a day (AM / PM) and the same exercise twice in a session (a top set
  // then back-off sets) are told apart by their order, so each row
  // progresses from its own week-1 values.
  const sessionNth = new Map<string, number>();
  {
    const seen = new Map<string, number>();
    for (const s of [...ordered].sort((a, b) => a.day_offset - b.day_offset || a.sort_order - b.sort_order)) {
      const k = `${s.day_offset}|${s.name.trim().toLowerCase()}`;
      const n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      sessionNth.set(s.id, n);
    }
  }
  const exKeys = (s: ProgrammeSession) => {
    const seen = new Map<string, number>();
    return (s.exercises ?? []).map((ex) => {
      const nm = ex.name.trim().toLowerCase();
      const n = seen.get(nm) ?? 0;
      seen.set(nm, n + 1);
      return `${dayOf(s.day_offset)}|${s.name.trim().toLowerCase()}#${sessionNth.get(s.id) ?? 0}|${nm}#${n}`;
    });
  };
  const base = new Map<string, PrescribedExercise>();
  for (const s of ordered) {
    const keys = exKeys(s);
    (s.exercises ?? []).forEach((ex, i) => {
      if (names.has(ex.name.trim().toLowerCase()) && !base.has(keys[i])) base.set(keys[i], ex);
    });
  }
  const preview: ProgressionPreviewRow[] = [];
  const updated = ordered.map((s) => {
    const week = weekOf(s.day_offset);
    const sinceStart = week - startWeek;
    const steps = Math.floor(sinceStart / Math.max(1, rule.everyWeeks));
    const deload = !!rule.deloadEvery && rule.deloadEvery > 1 && (sinceStart + 1) % rule.deloadEvery === 0;
    let changed = false;
    const keys = exKeys(s);
    const exercises = (s.exercises ?? []).map((ex, i) => {
      if (!names.has(ex.name.trim().toLowerCase())) return ex;
      const b = base.get(keys[i]) ?? ex;
      const patch = progressExercise(b, rule, steps);
      if (!patch && !deload) return ex;
      let next = { ...ex, ...(patch ?? {}) };
      if (deload) next = { ...next, ...deloadExercise(next, rule.deload ?? DEFAULT_DELOAD) };
      // Deload weeks can change any field, so show the whole dose there.
      const before = deload ? describeDose(ex) : describeField(ex, rule.field);
      const after = deload ? describeDose(next) : describeField(next, rule.field);
      if (before !== after || sinceStart === 0) {
        preview.push({ sessionId: s.id, week, exercise: ex.name, before, after: after + (deload ? " (deload)" : "") });
      }
      if (JSON.stringify(next) !== JSON.stringify(ex)) changed = true;
      return next;
    });
    return changed ? { ...s, exercises } : s;
  });
  return { updated, preview };
}

// ── Pyramids / waves ────────────────────────────────────────────────────────
// Per-set %1RM schemes for the ticked exercises (the app's per-set
// prescription is %1RM; reps are written as a per-set list, e.g. "10,8,6,4").

export interface PyramidPreset {
  key: string;
  label: string;
  percents: number[];
  reps: number[];
}

export const PYRAMIDS: PyramidPreset[] = [
  { key: "ascending", label: "Ascending pyramid (12-10-8-6)", percents: [65, 70, 75, 80], reps: [12, 10, 8, 6] },
  { key: "strength", label: "Strength pyramid (8-6-4-2)", percents: [75, 80, 85, 90], reps: [8, 6, 4, 2] },
  { key: "full", label: "Full pyramid (10-8-6-8-10)", percents: [65, 72.5, 80, 72.5, 65], reps: [10, 8, 6, 8, 10] },
  { key: "wave", label: "Wave (3-2-1 x2)", percents: [80, 85, 90, 82.5, 87.5, 92.5], reps: [3, 2, 1, 3, 2, 1] },
  { key: "reverse", label: "Reverse pyramid (4-6-8)", percents: [85, 80, 75], reps: [4, 6, 8] },
];

export function applyPyramid(ex: PrescribedExercise, p: PyramidPreset): PrescribedExercise {
  return {
    ...ex,
    sets: p.percents.length,
    reps: p.reps.join(","),
    use_percent_1rm: true,
    use_rir: false,
    set_percents: p.percents.map(fmt),
    set_rir: [],
  };
}
