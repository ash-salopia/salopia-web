"use client";

import { useMemo, useState } from "react";
import {
  DAYS, DELOAD_KINDS, PROGRESSION_FIELDS, PYRAMIDS, applyProgression, applyPyramid, jsDayToGridDay, pctList, percentsFromReps, weekOf,
  type DeloadKind, type ProgressionField, type ProgressionRule,
} from "@/lib/programme-builder";
import { REP_SCHEMES, chartFor, type RepScheme, type RepSchemeKey } from "@/lib/rep-charts";
import { DEFAULT_METHOD_OPTIONS, METHODS, applyMethod, blockSplit, type MethodKey, type MethodOptions } from "@/lib/programme-methods";
import type { ProgrammeSession, Template, TemplateDef } from "@/types";

// The programme builder's three bulk tools (0132): add a template on
// chosen days across chosen weeks, copy sessions/a week to other weeks,
// and progression rules / pyramids across ticked sessions.

// ── Shared bits ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={m.overlay} onClick={onClose}>
      <div style={{ ...m.modal, maxWidth: wide ? 640 : 460 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div style={m.titleRow}>
          <div style={m.title}>{title}</div>
          <button style={m.close} onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button type="button" title={title} onClick={onClick} style={{ ...m.chip, ...(on ? m.chipOn : null) }}>
      {children}
    </button>
  );
}

function WeekPicker({ weeks, value, onChange, exclude }: { weeks: number; value: Set<number>; onChange: (next: Set<number>) => void; exclude?: Set<number> }) {
  const all = Array.from({ length: weeks }, (_, i) => i).filter((w) => !exclude?.has(w));
  const toggle = (w: number) => {
    const next = new Set(value);
    if (next.has(w)) next.delete(w);
    else next.add(w);
    onChange(next);
  };
  return (
    <>
      <div style={m.chips}>
        {all.map((w) => (
          <Chip key={w} on={value.has(w)} onClick={() => toggle(w)}>W{w + 1}</Chip>
        ))}
      </div>
      <div style={{ ...m.chips, marginTop: 6 }}>
        <button type="button" style={m.link} onClick={() => onChange(new Set(all))}>All</button>
        <button type="button" style={m.link} onClick={() => onChange(new Set(all.filter((_, i) => i % 2 === 0)))}>Every other</button>
        <button type="button" style={m.link} onClick={() => onChange(new Set())}>None</button>
      </div>
    </>
  );
}

// ── Add from template ───────────────────────────────────────────────────────

export interface AddPlan {
  def: TemplateDef;
  week: number;
  day: number;
}

export function AddTemplateModal({
  templates,
  weeks,
  at,
  onClose,
  onAdd,
  onBlank,
}: {
  templates: Template[];
  weeks: number;
  at: { week: number; day: number } | null; // opened from a grid cell
  onClose: () => void;
  onAdd: (plan: AddPlan[]) => void;
  onBlank: (week: number, day: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [days, setDays] = useState<Record<string, Set<number>>>({});
  const [fromWeek, setFromWeek] = useState(at?.week ?? 0);
  const [toWeek, setToWeek] = useState(at ? at.week : weeks - 1);
  const [every, setEvery] = useState(1);

  const pick = (t: Template) => {
    setTemplate(t);
    const defs = t.defs ?? [];
    const init: Record<string, Set<number>> = {};
    defs.forEach((d, i) => {
      // One session dropped on a cell goes on that day; otherwise use the
      // template's own days, else spread Mon / Wed / Fri...
      if (at && defs.length === 1) init[d.id] = new Set([at.day]);
      else if (d.days?.length) init[d.id] = new Set(d.days.map(jsDayToGridDay));
      else init[d.id] = new Set([(at?.day ?? 0) + i * 2 <= 6 ? (at?.day ?? 0) + i * 2 : i % 7]);
    });
    setDays(init);
  };

  const weekList = useMemo(() => {
    const out: number[] = [];
    for (let w = fromWeek; w <= Math.max(fromWeek, toWeek); w += Math.max(1, every)) out.push(w);
    return out;
  }, [fromWeek, toWeek, every]);

  const plan: AddPlan[] = template
    ? (template.defs ?? []).flatMap((def) => weekList.flatMap((week) => Array.from(days[def.id] ?? []).sort().map((day) => ({ def, week, day }))))
    : [];

  const filtered = templates.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()));
  const weekOptions = Array.from({ length: weeks }, (_, i) => i);

  return (
    <Modal title={template ? `Add "${template.name}"` : "Add sessions"} onClose={onClose} wide={!!template}>
      {!template ? (
        <>
          {at && (
            <button style={{ ...m.option, marginBottom: 8 }} onClick={() => onBlank(at.week, at.day)}>
              + Blank session on {DAYS[at.day]}, week {at.week + 1}
              <span style={m.meta}>build it from scratch</span>
            </button>
          )}
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates…" style={m.input} />
          <div style={m.list}>
            {!templates.length && <div style={m.empty}>No templates yet - build one in the Template Library, or add a blank session.</div>}
            {templates.length > 0 && !filtered.length && <div style={m.empty}>No templates match.</div>}
            {filtered.map((t) => (
              <button key={t.id} style={m.option} onClick={() => pick(t)}>
                {t.name}
                <span style={m.meta}>{(t.defs ?? []).length} session{(t.defs ?? []).length === 1 ? "" : "s"}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={m.label}>Which days</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {(template.defs ?? []).map((def) => (
              <div key={def.id} style={m.defRow}>
                <div style={m.defName}>{def.name}</div>
                <div style={m.chips}>
                  {DAYS.map((d, i) => (
                    <Chip
                      key={d}
                      on={days[def.id]?.has(i) ?? false}
                      onClick={() =>
                        setDays((prev) => {
                          const next = new Set(prev[def.id] ?? []);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return { ...prev, [def.id]: next };
                        })
                      }
                    >
                      {d}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={m.label}>Which weeks</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <span style={m.small}>Week</span>
            <select style={m.select} value={fromWeek} onChange={(e) => { const v = Number(e.target.value); setFromWeek(v); if (toWeek < v) setToWeek(v); }}>
              {weekOptions.map((w) => <option key={w} value={w}>{w + 1}</option>)}
            </select>
            <span style={m.small}>to</span>
            <select style={m.select} value={toWeek} onChange={(e) => setToWeek(Number(e.target.value))}>
              {weekOptions.filter((w) => w >= fromWeek).map((w) => <option key={w} value={w}>{w + 1}</option>)}
            </select>
            <select style={m.select} value={every} onChange={(e) => setEvery(Number(e.target.value))}>
              <option value={1}>every week</option>
              <option value={2}>every 2 weeks</option>
              <option value={3}>every 3 weeks</option>
              <option value={4}>every 4 weeks</option>
            </select>
          </div>
          <div style={m.footer}>
            <button style={m.ghost} onClick={() => setTemplate(null)}>← Back</button>
            <button style={{ ...m.primary, opacity: plan.length ? 1 : 0.5 }} disabled={!plan.length} onClick={() => onAdd(plan)}>
              Add {plan.length} session{plan.length === 1 ? "" : "s"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Copy to weeks ───────────────────────────────────────────────────────────

export function CopyModal({
  title,
  weeks,
  sourceWeeks,
  allowDay,
  onClose,
  onCopy,
}: {
  title: string;
  weeks: number;
  sourceWeeks: Set<number>;
  allowDay: boolean;
  onClose: () => void;
  onCopy: (targetWeeks: number[], toDays: number[], extendTo: number | null) => void;
}) {
  const later = Array.from({ length: weeks }, (_, i) => i).filter((w) => w > Math.max(...Array.from(sourceWeeks)));
  // Copying sessions (not a whole week) usually starts with other days in
  // the same week, so that week is ticked too - a copy never lands on top
  // of its own original.
  const [targets, setTargets] = useState<Set<number>>(new Set(allowDay ? [...Array.from(sourceWeeks), ...later] : later));
  const [toDays, setToDays] = useState<Set<number>>(new Set());
  const [extra, setExtra] = useState(0);
  const total = weeks + extra;
  const extraWeeks = Array.from({ length: extra }, (_, i) => weeks + i);
  const chosen = [...Array.from(targets), ...extraWeeks].sort((a, b) => a - b);
  return (
    <Modal title={title} onClose={onClose}>
      <div style={m.label}>Copy to</div>
      <WeekPicker weeks={weeks} value={targets} onChange={setTargets} />
      {sourceWeeks.size > 1 && (
        <div style={{ ...m.small, marginTop: 6 }}>
          Weeks {Array.from(sourceWeeks).sort((a, b) => a - b).map((w) => w + 1).join(", ")} repeat in order - e.g. an A/B fortnight stays A/B.
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
        <span style={m.small}>Also add</span>
        <select style={m.select} value={extra} onChange={(e) => setExtra(Number(e.target.value))}>
          {[0, 1, 2, 3, 4, 6, 8, 12].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span style={m.small}>new week{extra === 1 ? "" : "s"} at the end{extra ? ` (weeks ${weeks + 1}-${total})` : ""}</span>
      </div>
      {allowDay && (
        <>
          <div style={m.label}>Days</div>
          <div style={{ ...m.chips, marginBottom: 4 }}>
            <Chip on={toDays.size === 0} onClick={() => setToDays(new Set())}>Same day</Chip>
            {DAYS.map((d, i) => (
              <Chip
                key={d}
                on={toDays.has(i)}
                onClick={() =>
                  setToDays((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
              >
                {d}
              </Chip>
            ))}
          </div>
          <div style={{ ...m.small, marginBottom: 12 }}>Pick several days to copy onto each of them, e.g. Wed, Fri and Sun.</div>
        </>
      )}
      <div style={m.footer}>
        <button style={m.ghost} onClick={onClose}>Cancel</button>
        <button style={{ ...m.primary, opacity: chosen.length ? 1 : 0.5 }} disabled={!chosen.length} onClick={() => onCopy(chosen, Array.from(toDays).sort(), extra ? total : null)}>
          Copy{toDays.size ? ` to ${Array.from(toDays).sort().map((d) => DAYS[d]).join(", ")}` : ""} in {chosen.length} week{chosen.length === 1 ? "" : "s"}
        </button>
      </div>
    </Modal>
  );
}

// ── Modify prescription (progressions, %1RM from reps, pyramids) ────────────

export function ModifyModal({
  sessions,
  initialScheme,
  onSaveScheme,
  onClose,
  onApply,
}: {
  sessions: ProgrammeSession[];
  initialScheme: RepScheme; // reps -> %1RM chart: last used, else the org's 1RM formula
  onSaveScheme: (scheme: RepScheme) => void; // remembered for next time
  onClose: () => void;
  onApply: (updated: ProgrammeSession[]) => void;
}) {
  const strength = sessions.filter((s) => s.type === "strength");
  const names = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of strength) for (const ex of s.exercises ?? []) {
      const k = ex.name.trim().toLowerCase();
      if (k && !seen.has(k)) seen.set(k, ex.name.trim());
    }
    return Array.from(seen.values());
  }, [strength]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"progress" | "fromReps" | "pyramid" | "method">("progress");
  const [method, setMethod] = useState<MethodKey>("531");
  const [mo, setMo] = useState<MethodOptions>(DEFAULT_METHOD_OPTIONS);
  const setOpt = <K extends keyof MethodOptions>(k: K, v: MethodOptions[K]) => setMo((prev) => ({ ...prev, [k]: v }));
  const [field, setField] = useState<ProgressionField>("load");
  const [change, setChange] = useState("2.5");
  const [every, setEvery] = useState(1);
  const [deload, setDeload] = useState(0);
  const [deloadKind, setDeloadKind] = useState<DeloadKind>("load");
  const [deloadAmount, setDeloadAmount] = useState(10);
  const deloadDef = DELOAD_KINDS.find((d) => d.key === deloadKind)!;
  const [pyramid, setPyramid] = useState(PYRAMIDS[0].key);
  const [matchLoad, setMatchLoad] = useState(true);
  const [adjust, setAdjust] = useState("0");
  const [scheme, setScheme] = useState<RepScheme>(initialScheme);
  const [chartDraft, setChartDraft] = useState<string[]>(() => chartFor(initialScheme).map(String));
  const [chartSaved, setChartSaved] = useState(false);

  const weeksSpanned = new Set(strength.map((s) => weekOf(s.day_offset))).size;
  const rule: ProgressionRule = { field, change: parseFloat(change) || 0, everyWeeks: every, deloadEvery: deload || null, deload: { kind: deloadKind, amount: deloadAmount }, matchLoad: field === "reps" && matchLoad, scheme };
  const usesChart = mode === "fromReps" || (mode === "progress" && field === "reps" && matchLoad);

  const pickScheme = (key: RepSchemeKey) => {
    const next: RepScheme = key === "custom" ? { key, chart: scheme.key === "custom" ? scheme.chart : chartFor(scheme) } : { key };
    setScheme(next);
    setChartDraft(chartFor(next).map(String));
    setChartSaved(false);
  };
  const editChart = (i: number, v: string) => {
    const draft = [...chartDraft];
    draft[i] = v.replace(/[^0-9.]/g, "");
    setChartDraft(draft);
    setScheme({ key: "custom", chart: draft.map((x) => parseFloat(x)) });
    setChartSaved(false);
  };

  const result = useMemo(() => {
    const chosen = names.filter((n) => ticked.has(n));
    const empty = { updated: [] as ProgrammeSession[], preview: [] as { week: number; exercise: string; before: string; after: string; note?: string }[] };
    if (!chosen.length) return empty;
    if (mode === "progress") return applyProgression(strength, chosen, rule);
    if (mode === "method") return applyMethod(strength, chosen, method, mo);
    const set = new Set(chosen.map((n) => n.toLowerCase()));
    const p = PYRAMIDS.find((x) => x.key === pyramid)!;
    const preview: { week: number; exercise: string; before: string; after: string }[] = [];
    const updated = strength.map((s) => {
      let changed = false;
      const exercises = (s.exercises ?? []).map((ex) => {
        if (!set.has(ex.name.trim().toLowerCase())) return ex;
        const next = mode === "pyramid" ? applyPyramid(ex, p) : (() => { const patch = percentsFromReps(ex, scheme, parseFloat(adjust) || 0); return patch ? { ...ex, ...patch } : ex; })();
        if (next === ex) return ex;
        changed = true;
        preview.push({
          week: weekOf(s.day_offset),
          exercise: ex.name,
          before: `${ex.sets} x ${ex.reps}${ex.use_percent_1rm && ex.set_percents?.length ? ` @ ${pctList(ex.set_percents)}%` : ex.target_load ? ` @ ${ex.target_load}` : ""}`,
          after: `${next.sets} x ${next.reps} @ ${pctList(next.set_percents ?? [])}%`,
        });
        return next;
      });
      return changed ? { ...s, exercises } : s;
    });
    return { updated, preview };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, ticked, mode, method, mo, field, change, every, deload, deloadKind, deloadAmount, pyramid, strength, matchLoad, scheme, adjust]);

  const changedSessions = result.updated.filter((u) => {
    const orig = strength.find((s) => s.id === u.id);
    return orig && JSON.stringify(orig.exercises) !== JSON.stringify(u.exercises);
  });
  const unit = PROGRESSION_FIELDS.find((f) => f.key === field)!;

  return (
    <Modal title="Modify prescription" onClose={onClose} wide>
      <div style={m.small}>
        Sets, reps, load and %1RM for the ticked sessions - {strength.length} strength session{strength.length === 1 ? "" : "s"} across {weeksSpanned} week
        {weeksSpanned === 1 ? "" : "s"}. The earliest week is the starting point.
      </div>
      <div style={{ ...m.label, marginTop: 12 }}>Exercises</div>
      {!names.length ? (
        <div style={m.empty}>No strength exercises in the ticked sessions.</div>
      ) : (
        <div style={m.chips}>
          {names.map((n) => (
            <Chip key={n} on={ticked.has(n)} onClick={() => setTicked((prev) => { const next = new Set(prev); if (next.has(n)) next.delete(n); else next.add(n); return next; })}>{n}</Chip>
          ))}
          <button type="button" style={m.link} onClick={() => setTicked(new Set(names))}>All</button>
        </div>
      )}

      <div style={{ ...m.chips, margin: "14px 0 10px" }}>
        <Chip on={mode === "progress"} onClick={() => setMode("progress")}>Change week to week</Chip>
        <Chip on={mode === "fromReps"} onClick={() => setMode("fromReps")}>Set %1RM from reps</Chip>
        <Chip on={mode === "pyramid"} onClick={() => setMode("pyramid")}>Pyramid / top set / wave</Chip>
        <Chip on={mode === "method"} onClick={() => setMode("method")}>Programme method</Chip>
      </div>

      {mode === "method" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <select style={{ ...m.select, width: "100%" }} value={method} onChange={(e) => setMethod(e.target.value as MethodKey)} aria-label="Programme method">
            {METHODS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
          <div style={m.small}>{METHODS.find((x) => x.key === method)!.blurb}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
            {method === "531" && (
              <>
                <span style={m.small}>Training max</span>
                <select style={m.select} value={mo.trainingMax} onChange={(e) => setOpt("trainingMax", Number(e.target.value))} aria-label="Training max">
                  {[85, 90, 95, 100].map((v) => <option key={v} value={v}>{v}% of 1RM</option>)}
                </select>
                <span style={m.small}>then</span>
                <select style={m.select} value={mo.raisePerCycle} onChange={(e) => setOpt("raisePerCycle", Number(e.target.value))} aria-label="Raise per cycle">
                  {[0, 2.5, 5].map((v) => <option key={v} value={v}>{v ? `+${v}% each cycle` : "same each cycle"}</option>)}
                </select>
                <select style={m.select} value={mo.deloadWeek ? "y" : "n"} onChange={(e) => setOpt("deloadWeek", e.target.value === "y")} aria-label="Deload week">
                  <option value="y">4-week cycles (week 4 deload)</option>
                  <option value="n">3-week cycles (no deload)</option>
                </select>
                <select style={m.select} value={mo.supplemental} onChange={(e) => setOpt("supplemental", e.target.value as MethodOptions["supplemental"])} aria-label="Supplemental sets">
                  <option value="none">Main sets only</option>
                  <option value="fsl">+ First Set Last 5 x 5</option>
                  <option value="bbb">+ Boring But Big 5 x 10 @ 50%</option>
                </select>
              </>
            )}
            {(method === "block" || method === "dup") && (
              <>
                <span style={m.small}>%1RM</span>
                <select style={m.select} value={mo.weeklyIncrease} onChange={(e) => setOpt("weeklyIncrease", Number(e.target.value))} aria-label="Weekly increase">
                  {[0, 1, 2.5, 5].map((v) => <option key={v} value={v}>{v ? `+${v}% each week` : "same each week"}</option>)}
                </select>
              </>
            )}
            {method === "block" && (
              <>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={mo.taper} onChange={(e) => setOpt("taper", e.target.checked)} style={{ accentColor: "var(--accent)" }} />
                  Taper the final week
                </label>
                <span style={m.small}>
                  {(() => {
                    const [a, b, c] = blockSplit(weeksSpanned);
                    return `${weeksSpanned} weeks: ${a} accumulation · ${b} intensification · ${c} realisation`;
                  })()}
                </span>
              </>
            )}
            {method === "double" && (
              <>
                <span style={m.small}>Reps</span>
                <select style={m.select} value={`${mo.repLow}-${mo.repHigh}`} onChange={(e) => { const [lo, hi] = e.target.value.split("-").map(Number); setMo((p) => ({ ...p, repLow: lo, repHigh: hi })); }} aria-label="Rep range">
                  {["3-5", "4-6", "5-8", "6-8", "6-10", "8-10", "8-12", "10-12", "10-15", "12-15", "15-20"].map((r) => <option key={r} value={r}>{r.replace("-", " to ")}</option>)}
                </select>
                <select style={m.select} value={mo.repStep} onChange={(e) => setOpt("repStep", Number(e.target.value))} aria-label="Reps per week">
                  <option value={1}>+1 rep a week</option>
                  <option value={2}>+2 reps a week</option>
                </select>
                <span style={m.small}>then load</span>
                <select style={m.select} value={mo.loadJump} onChange={(e) => setOpt("loadJump", Number(e.target.value))} aria-label="Load jump">
                  {[1, 2.5, 5, 10].map((v) => <option key={v} value={v}>+{v} (% or kg)</option>)}
                </select>
              </>
            )}
          </div>
          <div style={m.small}>
            Starts from the earliest ticked week. Uses %1RM - each athlete&apos;s kg comes from their own 1RM when the programme is loaded
            {method === "double" ? " (kg exercises go up in kg)" : ""}. Bodyweight, tick-only and timed exercises are left alone.
          </div>
        </div>
      )}

      {mode === "progress" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select style={m.select} value={field} onChange={(e) => { const f = e.target.value as ProgressionField; setField(f); setChange(String(PROGRESSION_FIELDS.find((x) => x.key === f)!.step)); }}>
            {PROGRESSION_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <input style={{ ...m.select, width: 80 }} inputMode="decimal" value={change} onChange={(e) => setChange(e.target.value.replace(/[^0-9.\-]/g, ""))} aria-label="Change per step" />
          <span style={m.small}>{unit.unit}</span>
          <select style={m.select} value={every} onChange={(e) => setEvery(Number(e.target.value))}>
            <option value={1}>every week</option>
            <option value={2}>every 2 weeks</option>
            <option value={3}>every 3 weeks</option>
            <option value={4}>every 4 weeks</option>
          </select>
          <select style={m.select} value={deload} onChange={(e) => setDeload(Number(e.target.value))}>
            <option value={0}>no deload</option>
            {[3, 4, 5, 6].map((n) => <option key={n} value={n}>deload every {n}th week</option>)}
          </select>
          {deload > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", width: "100%" }}>
              <span style={m.small}>Deload week:</span>
              <select
                style={m.select}
                value={deloadKind}
                onChange={(e) => {
                  const k = DELOAD_KINDS.find((d) => d.key === e.target.value)!;
                  setDeloadKind(k.key);
                  setDeloadAmount(k.fallback);
                }}
                aria-label="Deload type"
              >
                {DELOAD_KINDS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
              <select style={m.select} value={deloadAmount} onChange={(e) => setDeloadAmount(Number(e.target.value))} aria-label="Deload amount">
                {deloadDef.amounts.map((a) => <option key={a} value={a}>{a}{deloadDef.unit === "%" ? "%" : deloadDef.unit ? ` ${a === 1 ? deloadDef.unit.replace(/s$/, "") : deloadDef.unit}` : ""}</option>)}
              </select>
              <span style={m.small}>{deloadDef.hint}</span>
            </div>
          )}
          <div style={{ ...m.small, width: "100%" }}>Use a minus number to reduce, e.g. -1 rep every 2 weeks.{deload > 0 ? " The deload is applied on top of that week's progression." : ""}</div>
          {field === "reps" && (
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, width: "100%", cursor: "pointer", marginTop: 4 }}>
              <input type="checkbox" checked={matchLoad} onChange={(e) => setMatchLoad(e.target.checked)} style={{ accentColor: "var(--accent)", marginTop: 2 }} />
              <span>Adjust the %1RM (or kg) to match the reps, using the chart below - exercises without a %1RM yet get one from the chart. Each athlete&apos;s kg is worked out from their own 1RM when the programme is loaded.</span>
            </label>
          )}
        </div>
      )}

      {mode === "fromReps" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13 }}>Each set&apos;s %1RM comes from its reps on the chart below, adjusted by</span>
          <input style={{ ...m.select, width: 64 }} inputMode="decimal" value={adjust} onChange={(e) => setAdjust(e.target.value.replace(/[^0-9.\-]/g, ""))} aria-label="Adjust %" />
          <span style={m.small}>% (e.g. -5 for a lighter week)</span>
        </div>
      )}

      {mode === "pyramid" && (
        <select style={{ ...m.select, width: "100%" }} value={pyramid} onChange={(e) => setPyramid(e.target.value)}>
          {PYRAMIDS.map((p) => <option key={p.key} value={p.key}>{p.label} - {p.percents.join("/")}%</option>)}
        </select>
      )}

      {usesChart && (
        <div style={m.chartBox}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={m.label}>Reps → %1RM chart</span>
            <select style={{ ...m.select, flex: 1, minWidth: 220 }} value={scheme.key} onChange={(e) => pickScheme(e.target.value as RepSchemeKey)}>
              {REP_SCHEMES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          <div style={m.chartGrid}>
            {chartFor(scheme).map((v, i) => (
              <div key={i} style={m.chartCell}>
                <div style={m.chartReps}>{i + 1}</div>
                {scheme.key === "custom" ? (
                  <input style={m.chartInput} inputMode="decimal" value={chartDraft[i] ?? ""} onChange={(e) => editChart(i, e.target.value)} aria-label={`%1RM for ${i + 1} reps`} />
                ) : (
                  <div style={m.chartVal}>{Math.round(v * 10) / 10}%</div>
                )}
              </div>
            ))}
          </div>
          {scheme.key === "custom" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <button type="button" style={m.ghost} onClick={() => { onSaveScheme(scheme); setChartSaved(true); }}>Save as my chart</button>
              {chartSaved && <span style={m.small}>Saved - it&apos;ll be here next time.</span>}
            </div>
          ) : (
            <div style={{ ...m.small, marginTop: 6 }}>Pick &quot;My own chart&quot; to type in your own percentages.</div>
          )}
        </div>
      )}

      {result.preview.length > 0 && (
        <div style={m.preview}>
          {result.preview.slice(0, 40).map((r, i) => (
            <div key={i} style={m.previewRow}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                <span style={{ width: 34, color: "var(--mute)", fontWeight: 700 }}>W{r.week + 1}</span>
                <span style={{ fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.exercise}</span>
                {"note" in r && r.note ? <span style={m.note}>{String(r.note)}</span> : null}
              </div>
              <div style={{ paddingLeft: 42, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline" }}>
                <span style={{ color: "var(--mute)" }}>{r.before}</span>
                <span>→</span>
                <span style={{ fontWeight: 700 }}>{r.after}</span>
              </div>
            </div>
          ))}
          {result.preview.length > 40 && <div style={m.small}>…and {result.preview.length - 40} more</div>}
        </div>
      )}
      {ticked.size > 0 && mode === "progress" && !changedSessions.length && (
        <div style={{ ...m.small, marginTop: 10 }}>
          Nothing to change - the ticked exercises need a {unit.label.toLowerCase()} in the first week to progress from
          {field === "percent" ? " (turn on %1RM on the exercise, or use Set %1RM from reps)" : field === "rir" ? " (turn on RIR on the exercise)" : ""}.
        </div>
      )}

      <div style={m.footer}>
        <button style={m.ghost} onClick={onClose}>Cancel</button>
        <button
          style={{ ...m.primary, opacity: changedSessions.length ? 1 : 0.5 }}
          disabled={!changedSessions.length}
          onClick={() => {
            if (usesChart) onSaveScheme(scheme);
            onApply(changedSessions);
          }}
        >
          Apply to {changedSessions.length} session{changedSessions.length === 1 ? "" : "s"}
        </button>
      </div>
    </Modal>
  );
}

const m: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxHeight: "90vh", overflowY: "auto", color: "var(--text)" },
  titleRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700 },
  close: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 16, cursor: "pointer" },
  label: { fontSize: 11, fontWeight: 800, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 },
  small: { fontSize: 12, color: "var(--mute)", lineHeight: 1.45 },
  input: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14, marginBottom: 8, boxSizing: "border-box" },
  select: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 13 },
  list: { display: "flex", flexDirection: "column", gap: 2, maxHeight: 300, overflowY: "auto" },
  option: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--ink)", color: "var(--text)", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  meta: { fontSize: 11, color: "var(--mute)", fontWeight: 400 },
  empty: { color: "var(--mute)", fontSize: 13, padding: "8px 0" },
  chips: { display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" },
  chip: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 7, padding: "5px 9px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  chipOn: { background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" },
  link: { background: "none", border: "none", color: "var(--accent)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "4px 6px" },
  defRow: { display: "flex", flexDirection: "column", gap: 5, background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px" },
  defName: { fontSize: 13, fontWeight: 700 },
  footer: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 },
  ghost: { background: "transparent", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 9, padding: "9px 14px", fontSize: 13, cursor: "pointer" },
  primary: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer" },
  preview: { marginTop: 12, background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "6px 10px", maxHeight: 300, overflowY: "auto" },
  chartBox: { marginTop: 12, background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: 10 },
  chartGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))", gap: 4, marginTop: 8 },
  chartCell: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 7, padding: "4px 2px" },
  chartReps: { fontSize: 10, fontWeight: 800, color: "var(--mute)" },
  chartVal: { fontSize: 12, fontWeight: 700 },
  chartInput: { width: "100%", boxSizing: "border-box", textAlign: "center", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 5, padding: "3px 2px", fontSize: 12 },
  previewRow: { display: "flex", flexDirection: "column", gap: 2, fontSize: 12, padding: "5px 0", borderBottom: "1px solid var(--line)" },
  note: { fontSize: 10, fontWeight: 800, color: "var(--accent)", background: "var(--accent-dim)", borderRadius: 5, padding: "2px 6px", textTransform: "uppercase", letterSpacing: "0.04em" },
};
