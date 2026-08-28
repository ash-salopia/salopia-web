"use client";

/**
 * HyroxCardioBuilder — faithful port of the original salopia-programmes.jsx
 * Hyrox + Cardio session builder with full timer (audio beeps, pause/resume,
 * cycle rest, EMOM, interval, circuit, cycling, fixed, cardio types).
 *
 * Props:
 *   session        — the full Session object (hyrox_type, hyrox_config etc.)
 *   color          — accent colour for the session type
 *   library        — exercise library entries for autocomplete
 *   onTypeChange   — (hyroxType|null, cardioType|null) => void
 *   onConfigChange — (config: object) => void
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { Session, HyroxConfig, CardioConfig, LibraryEntry } from "@/types";
import {
  unlockAudio, stopKeepAlive, playCountdownBeep, playDing, playDoneBeep, setSoundMuted,
} from "@/lib/timer-audio";
import { MetricToggles, MetricBoxes, DistanceUnitPills } from "@/components/MetricBoxes";
import { DEFAULT_TRACKED_METRICS, resolveTrackedMetrics, resolveKeyMetrics, metricsForEquipment, type MetricKey, type MetricValues, type DistanceUnit } from "@/lib/cardio-metrics";
import { saveLibraryEntry } from "@/lib/data/library";
import LibraryEntryForm from "@/components/LibraryEntryForm";

// LibraryEntry.types is stored capitalised ("Hyrox", "Cardio" - see
// LibraryEntryForm's SESSION_TYPES), but every LibraryAutocomplete call
// site here passes lowercase filter tags ("hyrox", "cardio") - compare
// case-insensitively so the dropdown actually matches real entries.
const TYPE_LABEL: Record<string, string> = { hyrox: "Hyrox", cardio: "Cardio" };

// ── Type maps (ported from original) ─────────────────────────────────────────

const HYROX_TYPES: Record<string, { label: string; icon: string; desc: string }> = {
  fixed:    { label: "Fixed Workout",      icon: "🏁", desc: "A set sequence done once through. E.g. Run 800m → Lunges 50m → SkiErg 500m." },
  cycling:  { label: "Cycling Intervals",  icon: "🔥", desc: "Exercises cycle in order with work/rest. Repeat rounds, then cycle rest." },
  emom:     { label: "EMOM",              icon: "⏱",  desc: "Every Minute On the Minute. Set what happens each minute across X minutes." },
  interval: { label: "Intervals",         icon: "🔁",  desc: "Repeated work/rest cycles for one exercise. E.g. 6×500m SkiErg with 90s rest." },
  circuit:  { label: "Circuit / AMRAP",   icon: "🔄",  desc: "A set of exercises done for rounds or AMRAP in a time cap." },
};

const CARDIO_TYPES: Record<string, { label: string; icon: string; desc: string }> = {
  continuous:      { label: "Continuous / LSD",   icon: "🏃", desc: "One steady effort. E.g. 60 min easy run @ Z2 / 5:30/km." },
  threshold:       { label: "Threshold / Tempo",  icon: "🔥", desc: "Sustained effort at or near threshold. E.g. 2×20 min @ threshold." },
  cardioIntervals: { label: "Intervals / VO2max", icon: "⚡", desc: "Short hard efforts with recovery. E.g. 6×3 min @ 3:50/km, 2 min jog." },
  overUnder:       { label: "Over-Unders",         icon: "📈", desc: "Alternate below and above threshold. Builds lactate tolerance." },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function numOr(val: unknown, fallback: number): number {
  const n = parseInt(String(val), 10);
  return (val === "" || val == null || isNaN(n)) ? fallback : n;
}

function Field({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, ...(grow ? { flex: 1, minWidth: 100 } : {}) }}>
      <div style={s.fieldLabel}>{label}</div>
      {children}
    </div>
  );
}

// Coach preset for which unit a fresh distance box should start on
// (e.g. intervals default to metres, an LSD run defaults to km) - only
// shown once "distance" is actually tracked. The athlete/coach can
// still override it per box from there; this only sets what a
// not-yet-touched box shows automatically (0074).
function DistanceUnitPresetRow({ tracked, value, onChange }: {
  tracked: MetricKey[]; value: DistanceUnit; onChange: (next: DistanceUnit) => void;
}) {
  if (!tracked.includes("distance")) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: "#8593A0", fontWeight: 600 }}>Default distance unit:</span>
      <DistanceUnitPills value={value} onChange={onChange} />
    </div>
  );
}

// Shared "which metrics does this session track" row, plus a helper
// that gives every sub-type builder its tracked list with a sensible
// default (tick nothing by hand, still get useful boxes) the first
// time it renders.
function TrackedMetricsRow({ cfg, upd, subType, available, keyMetrics }: { cfg: any; upd: (p: any) => void; subType: string; available?: MetricKey[]; keyMetrics?: MetricKey[] }) {
  const tracked: MetricKey[] = cfg.tracked_metrics ?? DEFAULT_TRACKED_METRICS[subType] ?? [];
  useEffect(() => {
    if (!cfg.tracked_metrics) upd({ tracked_metrics: tracked });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <div style={s.dayLabelRow}>Session avg/total</div>
      <MetricToggles tracked={tracked} onChange={(next) => upd({ tracked_metrics: next })} available={available} keyMetrics={keyMetrics ?? cfg.key_metrics} />
      <DistanceUnitPresetRow tracked={tracked} value={cfg.default_distance_unit ?? "km"} onChange={(next) => upd({ default_distance_unit: next })} />
    </>
  );
}

// Per-exercise "which metrics does THIS exercise track" toggle + boxes -
// defaults from the picked library exercise (LibraryEntry.default_tracked_metrics),
// overridable per instance so a coach can e.g. untick distance on one
// exercise without touching the others in the same cycle/circuit (0070).
function ExerciseMetricsRow({ tracked, values, onTrackedChange, onValuesChange, available, keyMetrics, defaultDistanceUnit, onDefaultDistanceUnitChange }: {
  tracked: MetricKey[]; values: MetricValues;
  onTrackedChange: (next: MetricKey[]) => void; onValuesChange: (next: MetricValues) => void;
  available?: MetricKey[]; // restricts which metrics are selectable, e.g. by the exercise's equipment (0071)
  keyMetrics?: MetricKey[]; // shown by default before "More" - from LibraryEntry.default_key_metrics (0076)
  defaultDistanceUnit: DistanceUnit; onDefaultDistanceUnitChange: (next: DistanceUnit) => void;
}) {
  return (
    <div style={{ marginLeft: 32, marginBottom: 4 }}>
      <MetricToggles tracked={tracked} onChange={onTrackedChange} available={available} keyMetrics={keyMetrics} />
      <DistanceUnitPresetRow tracked={tracked} value={defaultDistanceUnit} onChange={onDefaultDistanceUnitChange} />
      <MetricBoxes tracked={tracked} values={values} onChange={onValuesChange} size="compact" defaultDistanceUnit={defaultDistanceUnit} />
    </div>
  );
}

// Toggle-only version for exercises that cycle through multiple rounds
// (Cycling, Circuit rounds mode) — which metrics to track is still
// per-exercise config set here, but the actual round-by-round values
// (Row round 1, Row round 2, ...) are entered where the workout is
// actually performed, in HyroxCardioLog (0071).
function ExerciseTrackToggle({ tracked, onTrackedChange, available, keyMetrics, defaultDistanceUnit, onDefaultDistanceUnitChange }: {
  tracked: MetricKey[]; onTrackedChange: (next: MetricKey[]) => void; available?: MetricKey[];
  keyMetrics?: MetricKey[]; // shown by default before "More" - from LibraryEntry.default_key_metrics (0076)
  defaultDistanceUnit: DistanceUnit; onDefaultDistanceUnitChange: (next: DistanceUnit) => void;
}) {
  return (
    <div style={{ marginLeft: 32, marginBottom: 4 }}>
      <MetricToggles tracked={tracked} onChange={onTrackedChange} available={available} keyMetrics={keyMetrics} />
      <DistanceUnitPresetRow tracked={tracked} value={defaultDistanceUnit} onChange={onDefaultDistanceUnitChange} />
    </div>
  );
}

// Round/Cycle recording-granularity checkboxes, one per Cycling session
// (applies to every exercise in it) - independent of which metrics are
// tracked, this decides whether a coach/athlete fills in one result per
// round, per cycle, both, or (if they leave both off) relies purely on
// the session-level "Session avg/total" box below (0071/0072).
function RecordLevelToggle({ levels, onChange }: {
  levels: ("round" | "cycle")[]; onChange: (next: ("round" | "cycle")[]) => void;
}) {
  const has = (l: "round" | "cycle") => levels.includes(l);
  const toggle = (l: "round" | "cycle") => onChange(has(l) ? levels.filter((x) => x !== l) : [...levels, l]);
  return (
    <div style={{ marginBottom: 10, display: "flex", gap: 12 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
        <input type="checkbox" checked={has("round")} onChange={() => toggle("round")} style={{ accentColor: "var(--accent)" }} />
        <span style={{ color: has("round") ? "var(--accent)" : "var(--mute)" }}>Record per round</span>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
        <input type="checkbox" checked={has("cycle")} onChange={() => toggle("cycle")} style={{ accentColor: "var(--accent)" }} />
        <span style={{ color: has("cycle") ? "var(--accent)" : "var(--mute)" }}>Record per cycle</span>
      </label>
    </div>
  );
}

function MiniInput({ value, onChange, placeholder, type = "text" }: {
  value: string | number; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      inputMode={type === "number" ? "numeric" : undefined}
      style={s.miniInput}
    />
  );
}

function LibraryAutocomplete({ value, onChange, library, types, placeholder }: {
  value: string; onChange: (v: string, entry?: LibraryEntry) => void;
  library: LibraryEntry[]; types: string[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState("");
  const timer = useRef<any>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const typesLower = types.map(t => t.toLowerCase());
  const filtered = library
    .filter(e => !typesLower.length || (e.types || []).some((t: string) => typesLower.includes(t.toLowerCase())))
    .filter(e => !value.trim() || e.name.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 8);
  const trimmed = value.trim();
  const hasExactMatch = trimmed && filtered.some(e => e.name.toLowerCase() === trimmed.toLowerCase());

  const handleAddToLibrary = async (entry: Partial<LibraryEntry> & { name: string }) => {
    setAddError("");
    try {
      const saved = await saveLibraryEntry(entry);
      setAddOpen(false);
      onChange(saved.name, saved);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not save to library");
    }
  };

  return (
    <div style={{ position: "relative", flex: 1 }}>
      <input
        value={value} placeholder={placeholder || "Exercise"}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { timer.current = setTimeout(() => setOpen(false), 150); }}
        style={{ ...s.miniInput, width: "100%" }}
      />
      {open && (filtered.length > 0 || (trimmed && !hasExactMatch)) && (
        <div style={s.acList}>
          {filtered.map((m, i) => (
            <button key={i} style={s.acItem} onMouseDown={e => { e.preventDefault(); onChange(m.name, m); setOpen(false); }}>
              {m.name}
            </button>
          ))}
          {trimmed && !hasExactMatch && (
            <button style={s.acAddItem} onMouseDown={e => { e.preventDefault(); setAddOpen(true); }}>
              + Add &quot;{trimmed}&quot; to library
            </button>
          )}
        </div>
      )}
      {addOpen && (
        <div style={s.overlay} onClick={() => setAddOpen(false)}>
          <div onClick={e => e.stopPropagation()}>
            {addError && <div style={s.addError}>{addError}</div>}
            <LibraryEntryForm
              entry={null}
              initialName={trimmed}
              initialTypes={typesLower.map(t => TYPE_LABEL[t]).filter(Boolean)}
              title={`Add "${trimmed}" to library`}
              onSave={handleAddToLibrary}
              onClose={() => setAddOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  session: Session;
  color: string;
  library: LibraryEntry[];
  onTypeChange: (hyroxType: string | null, cardioType: string | null) => void;
  onConfigChange: (config: object) => void;
}

export default function HyroxCardioBuilder({ session, color, library, onTypeChange, onConfigChange }: Props) {
  const isHyrox = session.type === "hyrox";
  const types = isHyrox ? HYROX_TYPES : CARDIO_TYPES;
  const currentType = isHyrox ? (session.hyrox_type || "") : ((session as any).cardio_type || "");
  const cfg: any = (isHyrox ? session.hyrox_config : session.cardio_config) || {};

  const upd = (patch: object) => onConfigChange({ ...cfg, ...patch });
  const setType = (t: string) => {
    // Re-clicking the already-selected type card is a no-op - it used to
    // unconditionally wipe onConfigChange({}), so a stray re-click (or a
    // coach just re-confirming their choice) silently discarded every
    // exercise/work/rest value already entered for this session.
    if (t === currentType) return;
    if (isHyrox) onTypeChange(t, null);
    else onTypeChange(null, t);
    onConfigChange({});
  };

  const bgColor = isHyrox ? "#1a2030" : "#1a2c38";
  const borderColor = color + "44";

  return (
    <div style={{ ...s.hyroxCfg, background: bgColor, borderColor }}>
      {/* Session type picker */}
      <div style={s.dayLabelRow}>Session type</div>
      <div style={s.hyroxTypeGrid}>
        {Object.entries(types).map(([key, { label, icon, desc }]) => {
          const on = currentType === key;
          return (
            <button key={key} onClick={() => setType(key)}
              style={{ ...s.hyroxTypeCard, ...(on ? { ...s.hyroxTypeCardOn, borderColor: color } : {}) }}>
              <span style={{ fontSize: 22 }}>{icon}</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{label}</span>
              {on && <span style={{ fontSize: 11, color, lineHeight: 1.3 }}>{desc}</span>}
            </button>
          );
        })}
      </div>

      {/* Inline timer - always mounted once a type is picked so it keeps
          running regardless of scroll position or collapse state (0073) */}
      {currentType && <HyroxTimer session={session} color={color} />}

      {/* Hyrox builders */}
      {isHyrox && currentType === "fixed"    && <HyroxFixed    cfg={cfg} upd={upd} library={library} />}
      {isHyrox && currentType === "cycling"  && <HyroxCycling  cfg={cfg} upd={upd} library={library} color={color} />}
      {isHyrox && currentType === "emom"     && <HyroxEMOM     cfg={cfg} upd={upd} library={library} />}
      {isHyrox && currentType === "interval" && <HyroxInterval cfg={cfg} upd={upd} library={library} />}
      {isHyrox && currentType === "circuit"  && <HyroxCircuit  cfg={cfg} upd={upd} library={library} />}

      {/* Cardio builders */}
      {!isHyrox && currentType === "continuous"      && <CardioContinuous  cfg={cfg} upd={upd} library={library} />}
      {!isHyrox && currentType === "threshold"       && <CardioThreshold   cfg={cfg} upd={upd} library={library} />}
      {!isHyrox && currentType === "cardioIntervals" && <CardioIntervals   cfg={cfg} upd={upd} library={library} />}
      {!isHyrox && currentType === "overUnder"       && <CardioOverUnder   cfg={cfg} upd={upd} library={library} />}
    </div>
  );
}

// ── Hyrox: Fixed ──────────────────────────────────────────────────────────────

function HyroxFixed({ cfg, upd, library }: { cfg: any; upd: (p: any) => void; library: LibraryEntry[] }) {
  const steps = cfg.steps || [{ exercise: "", target: "", metrics: {} }];
  useEffect(() => { if (!cfg.steps) upd({ steps }); }, []);
  const updSteps = (s: any[]) => upd({ steps: s });
  const updStep = (i: number, patch: any) => updSteps(steps.map((x: any, j: number) => j === i ? { ...x, ...patch } : x));

  return (
    <div style={{ marginTop: 12 }}>
      <div style={s.dayLabelRow}>Workout sequence</div>
      {steps.map((step: any, i: number) => {
        const tracked: MetricKey[] = step.tracked_metrics ?? DEFAULT_TRACKED_METRICS.fixed;
        const available = metricsForEquipment(step.equipment);
        return (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={s.hyroxStepRow}>
              <div style={s.hyroxStepNum}>{i + 1}</div>
              <LibraryAutocomplete value={step.exercise} library={library} types={["hyrox"]} placeholder="Exercise"
                onChange={(v, entry) => updStep(i, {
                  exercise: v,
                  equipment: entry ? (entry.equipment ?? undefined) : step.equipment,
                  default_distance_unit: entry ? (entry.default_distance_unit ?? undefined) : step.default_distance_unit,
                  tracked_metrics: entry
                    ? resolveTrackedMetrics(undefined, entry, DEFAULT_TRACKED_METRICS.fixed).filter((k) => metricsForEquipment(entry.equipment ?? undefined).includes(k))
                    : step.tracked_metrics,
                  key_metrics: entry ? resolveKeyMetrics(undefined, entry, []) : step.key_metrics,
                })} />
              <input value={step.target} placeholder="Target" onChange={e => updStep(i, { target: e.target.value })}
                style={{ ...s.miniInput, width: 90 }} />
              {steps.length > 1 && (
                <button style={s.iconBtn} onClick={() => updSteps(steps.filter((_: any, j: number) => j !== i))}>×</button>
              )}
            </div>
            <ExerciseMetricsRow
              tracked={tracked}
              values={step.metrics ?? {}}
              onTrackedChange={(next) => updStep(i, { tracked_metrics: next })}
              onValuesChange={(next) => updStep(i, { metrics: next })}
              available={available}
              keyMetrics={step.key_metrics}
              defaultDistanceUnit={step.default_distance_unit ?? "km"}
              onDefaultDistanceUnitChange={(next) => updStep(i, { default_distance_unit: next })}
            />
          </div>
        );
      })}
      <button style={s.addSetBtn} onClick={() => updSteps([...steps, { exercise: "", target: "", metrics: {} }])}>+ Step</button>
      <TrackedMetricsRow cfg={cfg} upd={upd} subType="fixed" />
      <MetricBoxes
        tracked={cfg.tracked_metrics ?? DEFAULT_TRACKED_METRICS.fixed}
        values={cfg.metrics ?? {}}
        onChange={(v) => upd({ metrics: v })}
        defaultDistanceUnit={cfg.default_distance_unit ?? "km"}
      />
    </div>
  );
}

// ── Hyrox: Cycling ────────────────────────────────────────────────────────────

function HyroxCycling({ cfg, upd, library, color }: { cfg: any; upd: (p: any) => void; library: LibraryEntry[]; color: string }) {
  const exercises = cfg.exercises || [{ exercise: "Row", reps: "" }, { exercise: "Wall Balls", reps: "" }, { exercise: "SkiErg", reps: "" }];
  const workSec = numOr(cfg.workSec, 40); const restSec = numOr(cfg.restSec, 20);
  const rounds = numOr(cfg.rounds, 2); const cycles = numOr(cfg.cycles, 3); const cyclRestSec = numOr(cfg.cyclRestSec, 120);
  const totalMin = Math.round((exercises.length * (workSec + restSec) * rounds * cycles + (cycles - 1) * cyclRestSec) / 60);

  useEffect(() => {
    const patch: any = {};
    if (!cfg.exercises) patch.exercises = exercises;
    if (cfg.workSec == null) patch.workSec = workSec;
    if (cfg.restSec == null) patch.restSec = restSec;
    if (cfg.rounds == null) patch.rounds = rounds;
    if (cfg.cycles == null) patch.cycles = cycles;
    if (cfg.cyclRestSec == null) patch.cyclRestSec = cyclRestSec;
    if (Object.keys(patch).length) upd(patch);
  }, []);

  const updEx = (s: any[]) => upd({ exercises: s });
  const updE = (i: number, p: any) => updEx(exercises.map((e: any, j: number) => j === i ? { ...e, ...p } : e));

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Field label="Work (s)"><input inputMode="numeric" value={cfg.workSec ?? 40} onChange={e => upd({ workSec: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Rest (s)"><input inputMode="numeric" value={cfg.restSec ?? 20} onChange={e => upd({ restSec: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Rounds"><input inputMode="numeric" value={cfg.rounds ?? 2} onChange={e => upd({ rounds: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Cycle rest (s)"><input inputMode="numeric" value={cfg.cyclRestSec ?? 120} onChange={e => upd({ cyclRestSec: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Cycles"><input inputMode="numeric" value={cfg.cycles ?? 3} onChange={e => upd({ cycles: e.target.value })} style={s.miniInput} /></Field>
      </div>
      <div style={s.dayLabelRow}>Exercises (cycle in order)</div>
      {exercises.map((ex: any, i: number) => {
        const tracked: MetricKey[] = ex.tracked_metrics ?? [];
        const available = metricsForEquipment(ex.equipment);
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={s.hyroxStepRow}>
              <div style={s.hyroxStepNum}>{i + 1}</div>
              <LibraryAutocomplete value={ex.exercise} library={library} types={["hyrox"]}
                onChange={(v, entry) => updE(i, {
                  exercise: v,
                  equipment: entry ? (entry.equipment ?? undefined) : ex.equipment,
                  default_distance_unit: entry ? (entry.default_distance_unit ?? undefined) : ex.default_distance_unit,
                  tracked_metrics: entry
                    ? resolveTrackedMetrics(undefined, entry, ex.tracked_metrics ?? []).filter((k) => metricsForEquipment(entry.equipment ?? undefined).includes(k))
                    : ex.tracked_metrics,
                  key_metrics: entry ? resolveKeyMetrics(undefined, entry, []) : ex.key_metrics,
                })} />
              <input value={ex.reps} placeholder="Reps / target" onChange={e => updE(i, { reps: e.target.value })}
                style={{ ...s.miniInput, width: 100 }} />
              {exercises.length > 1 && <button style={s.iconBtn} onClick={() => updEx(exercises.filter((_: any, j: number) => j !== i))}>×</button>}
            </div>
            <ExerciseTrackToggle
              tracked={tracked}
              onTrackedChange={(next) => updE(i, { tracked_metrics: next })}
              available={available}
              keyMetrics={ex.key_metrics}
              defaultDistanceUnit={ex.default_distance_unit ?? "km"}
              onDefaultDistanceUnitChange={(next) => updE(i, { default_distance_unit: next })}
            />
          </div>
        );
      })}
      <button style={s.addSetBtn} onClick={() => updEx([...exercises, { exercise: "", reps: "" }])}>+ Exercise</button>
      <div style={{ marginTop: 10, background: "#2a2240", borderRadius: 10, padding: "10px 14px", border: "1px solid #B388FF44" }}>
        <div style={{ fontSize: 12, color: "#B388FF", fontWeight: 600, marginBottom: 4 }}>Structure preview</div>
        <div style={{ fontSize: 13, color: "#E8EDF1" }}>{exercises.length} exercises × {workSec}s on / {restSec}s rest</div>
        <div style={{ fontSize: 13, color: "#E8EDF1" }}>×{rounds} rounds per cycle then {cyclRestSec}s rest ×{cycles} cycles</div>
        <div style={{ fontSize: 12, color: "#8593A0", marginTop: 4 }}>Total approx: {totalMin} min</div>
      </div>
      <div style={s.dayLabelRow}>Round/Cycle Data Tracking</div>
      <RecordLevelToggle levels={cfg.record_levels ?? ["round"]} onChange={(next) => upd({ record_levels: next })} />
      <TrackedMetricsRow cfg={cfg} upd={upd} subType="cycling" />
      <MetricBoxes
        tracked={cfg.tracked_metrics ?? DEFAULT_TRACKED_METRICS.cycling}
        values={cfg.metrics ?? {}}
        onChange={(v) => upd({ metrics: v })}
        defaultDistanceUnit={cfg.default_distance_unit ?? "km"}
      />
    </div>
  );
}

// ── Hyrox: EMOM ───────────────────────────────────────────────────────────────

function HyroxEMOM({ cfg, upd, library }: { cfg: any; upd: (p: any) => void; library: LibraryEntry[] }) {
  const mins = numOr(cfg.mins, 10);
  const slots = cfg.slots || [{ minute: "Odd", exercise: "", reps: "" }];
  useEffect(() => {
    const patch: any = {};
    if (cfg.mins == null) patch.mins = mins;
    if (!cfg.slots) patch.slots = slots;
    if (Object.keys(patch).length) upd(patch);
  }, []);
  const updSlots = (s: any[]) => upd({ slots: s });
  const updSlot = (i: number, patch: any) => updSlots(slots.map((s: any, j: number) => j === i ? { ...s, ...patch } : s));

  return (
    <div style={{ marginTop: 12 }}>
      <Field label="Total minutes">
        <input inputMode="numeric" value={cfg.mins ?? 10} onChange={e => upd({ mins: e.target.value })} style={{ ...s.miniInput, width: 80 }} />
      </Field>
      <div style={s.dayLabelRow}>Minute slots</div>
      {slots.map((slot: any, i: number) => (
        <div key={i} style={s.hyroxStepRow}>
          <input value={slot.minute} placeholder="Odd / Even / 1,3,5…"
            onChange={e => updSlot(i, { minute: e.target.value })} style={{ ...s.miniInput, width: 90 }} />
          <LibraryAutocomplete value={slot.exercise} library={library} types={["hyrox"]} placeholder="Exercise"
            onChange={(v, entry) => updSlot(i, {
              exercise: v,
              equipment: entry ? (entry.equipment ?? undefined) : slot.equipment,
              default_distance_unit: entry ? (entry.default_distance_unit ?? undefined) : slot.default_distance_unit,
            })} />
          <input value={slot.reps} placeholder="Reps/dist"
            onChange={e => updSlot(i, { reps: e.target.value })} style={{ ...s.miniInput, width: 80 }} />
          {slots.length > 1 && <button style={s.iconBtn} onClick={() => updSlots(slots.filter((_: any, j: number) => j !== i))}>×</button>}
        </div>
      ))}
      <button style={s.addSetBtn} onClick={() => updSlots([...slots, { minute: String(slots.length + 1), exercise: "", reps: "" }])}>+ Slot</button>
      <TrackedMetricsRow cfg={cfg} upd={upd} subType="emom" />
      <MetricBoxes
        tracked={cfg.tracked_metrics ?? DEFAULT_TRACKED_METRICS.emom}
        values={cfg.metrics ?? {}}
        onChange={(v) => upd({ metrics: v })}
        defaultDistanceUnit={cfg.default_distance_unit ?? "km"}
      />
    </div>
  );
}

// ── Hyrox: Interval ───────────────────────────────────────────────────────────

function HyroxInterval({ cfg, upd, library }: { cfg: any; upd: (p: any) => void; library: LibraryEntry[] }) {
  const sets = numOr(cfg.sets, 6); const workSec = numOr(cfg.workSec, 120); const restSec = numOr(cfg.restSec, 90);

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Field label="Exercise" grow>
          <LibraryAutocomplete value={cfg.exercise || ""} library={library} types={["hyrox"]} placeholder="e.g. SkiErg 500m"
            onChange={(v, entry) => upd({
              exercise: v,
              equipment: entry ? (entry.equipment ?? undefined) : cfg.equipment,
              default_distance_unit: entry ? (entry.default_distance_unit ?? undefined) : cfg.default_distance_unit,
              tracked_metrics: entry
                ? resolveTrackedMetrics(undefined, entry, DEFAULT_TRACKED_METRICS.interval).filter((k) => metricsForEquipment(entry.equipment ?? undefined).includes(k))
                : cfg.tracked_metrics,
              key_metrics: entry ? resolveKeyMetrics(undefined, entry, []) : cfg.key_metrics,
            })} />
        </Field>
        <Field label="Load"><input value={cfg.load || ""} placeholder="e.g. BW / 80kg" onChange={e => upd({ load: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Sets"><input inputMode="numeric" value={cfg.sets ?? 6} onChange={e => upd({ sets: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Work (s)"><input inputMode="numeric" value={cfg.workSec ?? 120} onChange={e => upd({ workSec: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Rest (s)"><input inputMode="numeric" value={cfg.restSec ?? 90} onChange={e => upd({ restSec: e.target.value })} style={s.miniInput} /></Field>
      </div>
      <TrackedMetricsRow cfg={cfg} upd={upd} subType="interval" available={metricsForEquipment(cfg.equipment)} keyMetrics={cfg.key_metrics} />
      <div style={s.dayLabelRow}>Log each set</div>
      {Array.from({ length: sets }, (_, i) => {
        const metricsArr: MetricValues[] = cfg.metrics || [];
        const tracked: MetricKey[] = cfg.tracked_metrics ?? DEFAULT_TRACKED_METRICS.interval;
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={s.hyroxStepNum}>{i + 1}</div>
              <span style={{ color: "#8593A0", fontSize: 12 }}>Set {i + 1}</span>
            </div>
            <MetricBoxes
              tracked={tracked}
              values={metricsArr[i] ?? {}}
              onChange={(v) => {
                const next = [...metricsArr];
                next[i] = v;
                upd({ metrics: next });
              }}
              size="compact"
              defaultDistanceUnit={cfg.default_distance_unit ?? "km"}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Hyrox: Circuit / AMRAP ───────────────────────────────────────────────────

function HyroxCircuit({ cfg, upd, library }: { cfg: any; upd: (p: any) => void; library: LibraryEntry[] }) {
  const rounds = numOr(cfg.rounds, 4); const restSec = numOr(cfg.restSec, 120);
  const isAmrap = cfg.isAmrap || false;
  const exercises = cfg.exercises || [{ exercise: "", reps: "" }];
  useEffect(() => {
    const patch: any = {};
    if (cfg.rounds == null) patch.rounds = rounds;
    if (cfg.restSec == null) patch.restSec = restSec;
    if (!cfg.exercises) patch.exercises = exercises;
    if (Object.keys(patch).length) upd(patch);
  }, []);
  const updEx = (s: any[]) => upd({ exercises: s });
  const updE = (i: number, p: any) => updEx(exercises.map((e: any, j: number) => j === i ? { ...e, ...p } : e));

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Field label="Mode">
          <select value={isAmrap ? "amrap" : "rounds"} onChange={e => upd({ isAmrap: e.target.value === "amrap" })}
            style={{ ...s.miniInput, width: 110 }}>
            <option value="rounds">Rounds</option>
            <option value="amrap">AMRAP</option>
          </select>
        </Field>
        {!isAmrap && <Field label="Rounds"><input inputMode="numeric" value={cfg.rounds ?? rounds} onChange={e => upd({ rounds: e.target.value })} style={s.miniInput} /></Field>}
        {isAmrap && <Field label="Time cap (s)"><input inputMode="numeric" value={cfg.timeCap ?? ""} onChange={e => upd({ timeCap: e.target.value })} style={s.miniInput} /></Field>}
        <Field label="Rest between rounds (s)"><input inputMode="numeric" value={cfg.restSec ?? restSec} onChange={e => upd({ restSec: e.target.value })} style={s.miniInput} /></Field>
      </div>
      <div style={s.dayLabelRow}>Circuit exercises</div>
      {exercises.map((ex: any, i: number) => {
        const tracked: MetricKey[] = ex.tracked_metrics ?? [];
        const available = metricsForEquipment(ex.equipment);
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={s.hyroxStepRow}>
              <div style={s.hyroxStepNum}>{i + 1}</div>
              <LibraryAutocomplete value={ex.exercise} library={library} types={["hyrox"]} placeholder="Exercise"
                onChange={(v, entry) => updE(i, {
                  exercise: v,
                  equipment: entry ? (entry.equipment ?? undefined) : ex.equipment,
                  default_distance_unit: entry ? (entry.default_distance_unit ?? undefined) : ex.default_distance_unit,
                  tracked_metrics: entry
                    ? resolveTrackedMetrics(undefined, entry, ex.tracked_metrics ?? []).filter((k) => metricsForEquipment(entry.equipment ?? undefined).includes(k))
                    : ex.tracked_metrics,
                  key_metrics: entry ? resolveKeyMetrics(undefined, entry, []) : ex.key_metrics,
                })} />
              <input value={ex.reps} placeholder="Reps/dist" onChange={e => updE(i, { reps: e.target.value })}
                style={{ ...s.miniInput, width: 80 }} />
              {exercises.length > 1 && <button style={s.iconBtn} onClick={() => updEx(exercises.filter((_: any, j: number) => j !== i))}>×</button>}
            </div>
            <ExerciseTrackToggle
              tracked={tracked}
              onTrackedChange={(next) => updE(i, { tracked_metrics: next })}
              available={available}
              keyMetrics={ex.key_metrics}
              defaultDistanceUnit={ex.default_distance_unit ?? "km"}
              onDefaultDistanceUnitChange={(next) => updE(i, { default_distance_unit: next })}
            />
          </div>
        );
      })}
      <button style={s.addSetBtn} onClick={() => updEx([...exercises, { exercise: "", reps: "" }])}>+ Exercise</button>
      {!isAmrap && (
        <div style={{ marginTop: 10 }}>
          <div style={s.dayLabelRow}>Round completion</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Array.from({ length: rounds }, (_, i) => {
              const done = (cfg.roundsDone || [])[i] || false;
              return (
                <button key={i} onClick={() => { const r = [...(cfg.roundsDone || Array(rounds).fill(false))]; r[i] = !r[i]; upd({ roundsDone: r }); }}
                  style={{ ...s.roundChip, background: done ? "#15302a" : "#1F272E", border: `1px solid ${done ? "#3FCF8E55" : "#2A343D"}`, color: done ? "#3FCF8E" : "#8593A0" }}>
                  Round {i + 1} {done ? "✓" : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <TrackedMetricsRow cfg={cfg} upd={upd} subType="circuit" />
      <MetricBoxes
        tracked={cfg.tracked_metrics ?? DEFAULT_TRACKED_METRICS.circuit}
        values={cfg.metrics ?? {}}
        onChange={(v) => upd({ metrics: v })}
        defaultDistanceUnit={cfg.default_distance_unit ?? "km"}
      />
    </div>
  );
}

// ── Cardio: Continuous / LSD ─────────────────────────────────────────────────

function CardioContinuous({ cfg, upd, library }: { cfg: any; upd: (p: any) => void; library: LibraryEntry[] }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Field label="Activity" grow>
          <LibraryAutocomplete value={cfg.modality || "Run"} library={library} types={["cardio", "hyrox"]} placeholder="Run, Bike…"
            onChange={(v, entry) => upd({
              modality: v,
              equipment: entry ? (entry.equipment ?? undefined) : cfg.equipment,
              default_distance_unit: entry ? (entry.default_distance_unit ?? undefined) : cfg.default_distance_unit,
              tracked_metrics: entry && cfg.tracked_metrics
                ? cfg.tracked_metrics.filter((k: MetricKey) => metricsForEquipment(entry.equipment ?? undefined).includes(k))
                : cfg.tracked_metrics,
            })} />
        </Field>
        <Field label="Duration (mins)"><input inputMode="numeric" value={cfg.duration || ""} placeholder="60" onChange={e => upd({ duration: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Distance"><input value={cfg.distance || ""} placeholder="e.g. 10 km" onChange={e => upd({ distance: e.target.value })} style={s.miniInput} /></Field>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Field label="Zone / Intensity" grow><input value={cfg.intensity || ""} placeholder="e.g. Z2 / easy / 70% HR" onChange={e => upd({ intensity: e.target.value })} style={{ ...s.miniInput, width: "100%" }} /></Field>
        <Field label="Target pace"><input value={cfg.pace || ""} placeholder="e.g. 5:30/km" onChange={e => upd({ pace: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Target HR"><input value={cfg.hr || ""} placeholder="e.g. 130–145 bpm" onChange={e => upd({ hr: e.target.value })} style={s.miniInput} /></Field>
      </div>
      <Field label="Coaching notes"><input value={cfg.notes || ""} placeholder="e.g. Keep conversational, nasal breathing" onChange={e => upd({ notes: e.target.value })} style={{ ...s.miniInput, width: "100%" }} /></Field>
      <TrackedMetricsRow cfg={cfg} upd={upd} subType="continuous" available={metricsForEquipment(cfg.equipment)} />
      <MetricBoxes
        tracked={cfg.tracked_metrics ?? DEFAULT_TRACKED_METRICS.continuous}
        values={cfg.metrics ?? {}}
        onChange={(v) => upd({ metrics: v })}
        defaultDistanceUnit={cfg.default_distance_unit ?? "km"}
      />
    </div>
  );
}

// ── Cardio: Threshold / Tempo ─────────────────────────────────────────────────

function CardioThreshold({ cfg, upd, library }: { cfg: any; upd: (p: any) => void; library: LibraryEntry[] }) {
  const blocks = cfg.blocks || [
    { label: "Warm-up",   duration: "10", intensity: "Z1 / easy",      repeat: 1, metrics: {} },
    { label: "Main set",  duration: "20", intensity: "threshold / LT",  repeat: 2, rest: "2 min easy", metrics: {} },
    { label: "Cool-down", duration: "10", intensity: "Z1 / easy",       repeat: 1, metrics: {} },
  ];
  const updBlocks = (b: any[]) => upd({ blocks: b });
  const updBlock = (i: number, p: any) => updBlocks(blocks.map((b: any, j: number) => j === i ? { ...b, ...p } : b));
  const tracked: MetricKey[] = cfg.tracked_metrics ?? DEFAULT_TRACKED_METRICS.threshold;

  return (
    <div style={{ marginTop: 12 }}>
      <Field label="Activity">
        <LibraryAutocomplete value={cfg.modality || "Run"} library={library} types={["cardio", "hyrox"]}
          onChange={(v, entry) => upd({
            modality: v,
            equipment: entry ? (entry.equipment ?? undefined) : cfg.equipment,
            default_distance_unit: entry ? (entry.default_distance_unit ?? undefined) : cfg.default_distance_unit,
            tracked_metrics: entry && cfg.tracked_metrics
              ? cfg.tracked_metrics.filter((k: MetricKey) => metricsForEquipment(entry.equipment ?? undefined).includes(k))
              : cfg.tracked_metrics,
          })} />
      </Field>
      <TrackedMetricsRow cfg={cfg} upd={upd} subType="threshold" available={metricsForEquipment(cfg.equipment)} />
      <div style={s.dayLabelRow}>Session blocks</div>
      {blocks.map((b: any, i: number) => {
        // Each block can override the session's Activity/equipment (e.g.
        // bike warm-up into a run main set) - blank means "same as
        // above". Falling back to the session-level tracked/equipment
        // keeps every existing threshold session working unchanged (0076).
        const blockEquipment = b.equipment ?? cfg.equipment;
        const blockTracked: MetricKey[] = b.tracked_metrics ?? tracked;
        const blockDistanceUnit: DistanceUnit = b.default_distance_unit ?? cfg.default_distance_unit ?? "km";
        return (
          <div key={i} style={{ background: "#0F1418", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #2A343D" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <input value={b.label} onChange={e => updBlock(i, { label: e.target.value })} style={{ ...s.miniInput, fontWeight: 700, width: 100 }} />
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button style={s.iconBtn} onClick={() => updBlock(i, { repeat: Math.max(1, (b.repeat || 1) - 1) })}>-</button>
                <span style={{ fontSize: 12, color: "#8593A0", minWidth: 60, textAlign: "center" }}>{b.repeat || 1}× {b.duration || "-"}min</span>
                <button style={s.iconBtn} onClick={() => updBlock(i, { repeat: (b.repeat || 1) + 1 })}>+</button>
              </div>
              {blocks.length > 1 && <button style={{ ...s.iconBtn, color: "#ff7d7d", marginLeft: "auto" }} onClick={() => updBlocks(blocks.filter((_: any, j: number) => j !== i))}>×</button>}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Field label="Duration (mins)"><input inputMode="numeric" value={b.duration} placeholder="20" onChange={e => updBlock(i, { duration: e.target.value })} style={s.miniInput} /></Field>
              <Field label="Zone / Intensity" grow><input value={b.intensity} placeholder="e.g. threshold / Z4" onChange={e => updBlock(i, { intensity: e.target.value })} style={{ ...s.miniInput, width: "100%" }} /></Field>
              {(b.repeat || 1) > 1 && <Field label="Recovery"><input value={b.rest || ""} placeholder="e.g. 2 min easy" onChange={e => updBlock(i, { rest: e.target.value })} style={s.miniInput} /></Field>}
            </div>
            <Field label="Activity (blank = same as above)">
              <LibraryAutocomplete value={b.modality || ""} library={library} types={["cardio", "hyrox"]} placeholder={cfg.modality || "Run"}
                onChange={(v, entry) => updBlock(i, {
                  modality: v,
                  equipment: entry ? (entry.equipment ?? undefined) : b.equipment,
                  default_distance_unit: entry ? (entry.default_distance_unit ?? undefined) : b.default_distance_unit,
                  tracked_metrics: entry
                    ? blockTracked.filter((k) => metricsForEquipment(entry.equipment ?? undefined).includes(k))
                    : b.tracked_metrics,
                  key_metrics: entry ? resolveKeyMetrics(undefined, entry, []) : b.key_metrics,
                })} />
            </Field>
            <div style={{ marginTop: 8 }}>
              <MetricToggles tracked={blockTracked} onChange={(next) => updBlock(i, { tracked_metrics: next })} available={metricsForEquipment(blockEquipment)} keyMetrics={b.key_metrics} />
              <DistanceUnitPresetRow tracked={blockTracked} value={blockDistanceUnit} onChange={(next) => updBlock(i, { default_distance_unit: next })} />
              <MetricBoxes tracked={blockTracked} values={b.metrics ?? {}} onChange={(v) => updBlock(i, { metrics: v })} size="compact" defaultDistanceUnit={blockDistanceUnit} />
            </div>
          </div>
        );
      })}
      <button style={s.addSetBtn} onClick={() => updBlocks([...blocks, { label: "Block", duration: "", intensity: "", repeat: 1, rest: "", metrics: {} }])}>+ Block</button>
    </div>
  );
}

// ── Cardio: Intervals / VO2max ────────────────────────────────────────────────

function CardioIntervals({ cfg, upd, library }: { cfg: any; upd: (p: any) => void; library: LibraryEntry[] }) {
  const reps = numOr(cfg.reps, 6);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Field label="Activity" grow>
          <LibraryAutocomplete value={cfg.modality || "Run"} library={library} types={["cardio", "hyrox"]}
            onChange={(v, entry) => upd({
              modality: v,
              equipment: entry ? (entry.equipment ?? undefined) : cfg.equipment,
              default_distance_unit: entry ? (entry.default_distance_unit ?? undefined) : cfg.default_distance_unit,
              tracked_metrics: entry && cfg.tracked_metrics
                ? cfg.tracked_metrics.filter((k: MetricKey) => metricsForEquipment(entry.equipment ?? undefined).includes(k))
                : cfg.tracked_metrics,
            })} />
        </Field>
        <Field label="Reps"><input inputMode="numeric" value={cfg.reps ?? 6} onChange={e => upd({ reps: e.target.value })} style={s.miniInput} /></Field>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Field label="Work (s)"><input inputMode="numeric" value={cfg.workDur || ""} placeholder="180" onChange={e => upd({ workDur: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Work distance"><input value={cfg.workDist || ""} placeholder="e.g. 400m" onChange={e => upd({ workDist: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Rest (s)"><input inputMode="numeric" value={cfg.restDur || ""} placeholder="90" onChange={e => upd({ restDur: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Rest type"><input value={cfg.restType || ""} placeholder="easy jog / walk" onChange={e => upd({ restType: e.target.value })} style={s.miniInput} /></Field>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Field label="Zone / Intensity" grow><input value={cfg.intensity || ""} placeholder="e.g. Z5 / VO2max / 95–100% HR" onChange={e => upd({ intensity: e.target.value })} style={{ ...s.miniInput, width: "100%" }} /></Field>
        <Field label="Target pace"><input value={cfg.pace || ""} placeholder="e.g. 3:50/km" onChange={e => upd({ pace: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Target HR"><input value={cfg.hr || ""} placeholder="e.g. 175+ bpm" onChange={e => upd({ hr: e.target.value })} style={s.miniInput} /></Field>
      </div>
      <TrackedMetricsRow cfg={cfg} upd={upd} subType="cardioIntervals" available={metricsForEquipment(cfg.equipment)} />
      <div style={s.dayLabelRow}>Log each rep</div>
      {Array.from({ length: reps }, (_, i) => {
        const metricsArr: MetricValues[] = cfg.metrics || [];
        const tracked: MetricKey[] = cfg.tracked_metrics ?? DEFAULT_TRACKED_METRICS.cardioIntervals;
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ ...s.hyroxStepNum, flexShrink: 0 }}>{i + 1}</div>
              <span style={{ color: "#8593A0", fontSize: 12 }}>Rep {i + 1}</span>
            </div>
            <MetricBoxes
              tracked={tracked}
              values={metricsArr[i] ?? {}}
              onChange={(v) => { const next = [...metricsArr]; next[i] = v; upd({ metrics: next }); }}
              size="compact"
              defaultDistanceUnit={cfg.default_distance_unit ?? "km"}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Cardio: Over-Unders ───────────────────────────────────────────────────────

function CardioOverUnder({ cfg, upd, library }: { cfg: any; upd: (p: any) => void; library: LibraryEntry[] }) {
  const sets = numOr(cfg.sets, 3); const reps = numOr(cfg.reps, 6);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Field label="Activity" grow>
          <LibraryAutocomplete value={cfg.modality || "Bike Erg"} library={library} types={["cardio", "hyrox"]}
            onChange={(v, entry) => upd({
              modality: v,
              equipment: entry ? (entry.equipment ?? undefined) : cfg.equipment,
              default_distance_unit: entry ? (entry.default_distance_unit ?? undefined) : cfg.default_distance_unit,
              tracked_metrics: entry && cfg.tracked_metrics
                ? cfg.tracked_metrics.filter((k: MetricKey) => metricsForEquipment(entry.equipment ?? undefined).includes(k))
                : cfg.tracked_metrics,
            })} />
        </Field>
        <Field label="Sets"><input inputMode="numeric" value={cfg.sets ?? 3} onChange={e => upd({ sets: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Reps / set"><input inputMode="numeric" value={cfg.reps ?? 6} onChange={e => upd({ reps: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Rest between sets (mins)"><input inputMode="numeric" value={cfg.restDur || "5"} onChange={e => upd({ restDur: e.target.value })} style={s.miniInput} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
        <div style={{ background: "#152530", border: "1px solid #4DC3FF44", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#4DC3FF", letterSpacing: 1, marginBottom: 8 }}>UNDER (below threshold)</div>
          <Field label="Duration (s)"><input inputMode="numeric" value={cfg.underDur || "180"} onChange={e => upd({ underDur: e.target.value })} style={s.miniInput} /></Field>
          <Field label="Zone / %"><input value={cfg.underInt || ""} placeholder="e.g. 93–95% FTP / Z3" onChange={e => upd({ underInt: e.target.value })} style={s.miniInput} /></Field>
          <Field label="Pace"><input value={cfg.underPace || ""} placeholder="e.g. 4:20/km" onChange={e => upd({ underPace: e.target.value })} style={s.miniInput} /></Field>
        </div>
        <div style={{ background: "#162743", border: "1px solid #3B8BEB44", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#3B8BEB", letterSpacing: 1, marginBottom: 8 }}>OVER (above threshold)</div>
          <Field label="Duration (s)"><input inputMode="numeric" value={cfg.overDur || "120"} onChange={e => upd({ overDur: e.target.value })} style={s.miniInput} /></Field>
          <Field label="Zone / %"><input value={cfg.overInt || ""} placeholder="e.g. 105–110% FTP / Z5" onChange={e => upd({ overInt: e.target.value })} style={s.miniInput} /></Field>
          <Field label="Pace"><input value={cfg.overPace || ""} placeholder="e.g. 3:50/km" onChange={e => upd({ overPace: e.target.value })} style={s.miniInput} /></Field>
        </div>
      </div>
      <TrackedMetricsRow cfg={cfg} upd={upd} subType="overUnder" available={metricsForEquipment(cfg.equipment)} />
      <div style={s.dayLabelRow}>Log each set</div>
      {Array.from({ length: sets }, (_, i) => {
        const metricsArr: MetricValues[] = cfg.metrics || [];
        const tracked: MetricKey[] = cfg.tracked_metrics ?? DEFAULT_TRACKED_METRICS.overUnder;
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={s.hyroxStepNum}>{i + 1}</div>
              <span style={{ color: "#8593A0", fontSize: 12 }}>Set {i + 1}</span>
            </div>
            <MetricBoxes
              tracked={tracked}
              values={metricsArr[i] ?? {}}
              onChange={(v) => { const next = [...metricsArr]; next[i] = v; upd({ metrics: next }); }}
              size="compact"
              defaultDistanceUnit={cfg.default_distance_unit ?? "km"}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Timer ─────────────────────────────────────────────────────────────────────

interface TimerState {
  phase: "idle" | "work" | "rest" | "cycleRest" | "paused" | "done";
  timeLeft: number;
  round: number;
  cycle: number;
  prevPhase?: string;
}

// Inline, non-blocking timer - previously a full-screen modal overlay
// that made it impossible to type into the recording boxes while it
// ran, and lost all its state (interval, elapsed time) the moment it
// was closed to free up the screen. Now it's always mounted (so the
// interval keeps running regardless of UI state) and renders as part
// of the normal page flow: an idle "Start Timer" bar before starting,
// then a `position: sticky` bar once running so it stays visible while
// scrolling down to fill in boxes, collapsible to a compact row without
// stopping it (0073).
export function HyroxTimer({ session, color }: { session: Session; color: string }) {
  useEffect(() => () => { stopKeepAlive(); }, []);

  const sessType = session.type;
  const htype = sessType === "cardio"
    ? ((session as any).cardio_type || "continuous")
    : (session.hyrox_type || "fixed");
  const cfg: any = (sessType === "hyrox" ? session.hyrox_config : (session as any).cardio_config) || {};

  const isCardioIntervals = htype === "cardioIntervals";
  const cyclingExs = htype === "cycling" ? (cfg.exercises || []) : [];
  const cyclingRoundsPerCycle = htype === "cycling" ? numOr(cfg.rounds, 2) : 1;

  const workSec = isCardioIntervals
    ? numOr(cfg.workDur, 180)
    : htype === "interval" ? numOr(cfg.workSec, 120)
    : htype === "emom" ? 60
    : htype === "cycling" ? numOr(cfg.workSec, 40)
    : numOr(cfg.workSec, 40);

  const restSec = isCardioIntervals
    ? numOr(cfg.restDur, 90)
    : htype === "cycling" ? numOr(cfg.restSec, 20)
    : (htype === "interval" || htype === "circuit") ? numOr(cfg.restSec, 90)
    : numOr(cfg.restSec, 20);

  const totalRounds = isCardioIntervals ? numOr(cfg.reps, 6)
    : htype === "interval" ? numOr(cfg.sets, 6)
    : htype === "circuit" ? numOr(cfg.rounds, 4)
    : htype === "emom" ? numOr(cfg.mins, 10)
    : htype === "cycling" ? (cyclingExs.length || 1) * cyclingRoundsPerCycle
    : numOr(cfg.rounds, 8);

  const cycles = (isCardioIntervals || htype === "interval" || htype === "emom" || htype === "circuit") ? 1 : numOr(cfg.cycles, 1);
  const cyclRestSec = numOr(cfg.cyclRestSec, 120);
  const slots: any[] = cfg.slots || [];
  const fixedSteps: any[] = cfg.steps || [];

  const [display, setDisplay] = useState<TimerState>({ phase: "idle", timeLeft: workSec || 60, round: 1, cycle: 1 });
  const [muted, setMuted] = useState(false);
  const [expanded, setExpanded] = useState(true);
  useEffect(() => { setSoundMuted(muted); }, [muted]);

  const stateRef = useRef<TimerState>({ phase: "idle", timeLeft: workSec || 60, round: 1, cycle: 1 });
  const intervalRef = useRef<any>(null);

  const applyState = (patch: Partial<TimerState>) => {
    stateRef.current = { ...stateRef.current, ...patch };
    setDisplay({ ...stateRef.current });
  };

  const beepFor = useCallback((tl: number) => {
    if (tl <= 3 && tl >= 1) playCountdownBeep();
  }, []);

  const tick = useCallback(() => {
    const st = stateRef.current;
    if (st.phase === "idle" || st.phase === "done" || st.phase === "paused") return;
    if (st.timeLeft > 1) {
      const next = st.timeLeft - 1;
      applyState({ timeLeft: next });
      beepFor(next);
      return;
    }
    if (st.phase === "work") {
      if (st.round < totalRounds) {
        if (htype === "emom") { applyState({ phase: "work", timeLeft: 60, round: st.round + 1 }); playDing(); }
        else { applyState({ phase: "rest", timeLeft: restSec }); playDing(); beepFor(restSec); }
      } else if (st.cycle < cycles) {
        applyState({ phase: "cycleRest", timeLeft: cyclRestSec, cycle: st.cycle + 1, round: 1 }); playDing(); beepFor(cyclRestSec);
      } else {
        applyState({ phase: "done", timeLeft: 0 }); clearInterval(intervalRef.current); playDoneBeep();
      }
    } else if (st.phase === "cycleRest") {
      applyState({ phase: "work", timeLeft: workSec || 60, round: 1 }); playDing(); beepFor(workSec || 60);
    } else if (st.phase === "rest") {
      applyState({ phase: "work", timeLeft: workSec || 60, round: st.round + 1 }); playDing(); beepFor(workSec || 60);
    }
  }, [workSec, restSec, totalRounds, cycles, cyclRestSec, htype]);

  const start = () => {
    unlockAudio();
    playDing();
    applyState({ phase: "work", timeLeft: workSec || 60, round: 1, cycle: 1 });
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, 1000);
  };
  const stop = () => {
    clearInterval(intervalRef.current); stopKeepAlive();
    applyState({ phase: "idle", timeLeft: workSec || 60, round: 1, cycle: 1 });
  };
  const pause = () => {
    const st = stateRef.current;
    if (st.phase === "paused") { unlockAudio(); applyState({ phase: (st.prevPhase as any) || "work" }); intervalRef.current = setInterval(tick, 1000); }
    else { clearInterval(intervalRef.current); applyState({ prevPhase: st.phase as any, phase: "paused" }); }
  };
  useEffect(() => () => clearInterval(intervalRef.current), []);

  const { phase, timeLeft, round, cycle } = display;
  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");
  const paused = phase === "paused";
  const phaseColor = phase === "work" ? "#3FCF8E" : phase === "rest" ? "#ff6b6b" : phase === "cycleRest" ? "#ff9944" : "#8593A0";

  const typeLabel: Record<string, string> = {
    fixed: "Fixed Workout", cycling: "Cycling Intervals", emom: "EMOM",
    interval: "Intervals", circuit: "Circuit/AMRAP",
    continuous: "Continuous / LSD", threshold: "Threshold / Tempo",
    cardioIntervals: "Intervals / VO2max", overUnder: "Over-Unders",
  };

  const currentExIdx = cyclingExs.length ? (round - 1) % cyclingExs.length : 0;
  const cyclingRoundNum = cyclingExs.length ? Math.ceil(round / cyclingExs.length) : 1;

  const phaseLabel = paused ? "PAUSED" : phase === "done" ? "DONE" : phase === "idle" ? "READY"
    : htype === "cycling" ? (() => {
        const ex = cyclingExs[currentExIdx]?.exercise;
        const pw = phase === "rest" ? "REST" : phase === "cycleRest" ? "CYCLE REST" : "WORK";
        return ex ? ex.toUpperCase() + ", " + pw : pw;
      })()
    : htype === "emom" ? "MIN " + round
    : htype === "interval" ? "SET " + round + ", " + (phase === "work" ? "WORK" : "REST")
    : htype === "circuit" ? "RND " + round + (phase === "rest" ? ", REST" : "")
    : phase.toUpperCase();

  const currentExercise = htype === "cycling" && cyclingExs.length ? (cyclingExs[currentExIdx]?.reps || "")
    : htype === "emom" && slots.length ? (() => {
        const slot = slots.find((sl: any) => {
          const parts = sl.minute.toLowerCase().split(/[,/]+/).map((x: string) => x.trim());
          if (parts.includes("odd") && round % 2 !== 0) return true;
          if (parts.includes("even") && round % 2 === 0) return true;
          return parts.includes(String(round));
        }) || slots[(round - 1) % slots.length];
        return slot ? (slot.exercise + " × " + slot.reps) : "";
      })()
    : htype === "fixed" && fixedSteps.length
      ? "Step " + Math.min(round, fixedSteps.length) + ": " + (fixedSteps[Math.min(round - 1, fixedSteps.length - 1)]?.exercise || "")
    : "";

  const roundCycleText = htype === "emom" ? `Min ${round}/${totalRounds}`
    : htype === "interval" ? `Set ${round}/${totalRounds}`
    : htype === "cycling" ? `Cycle ${cycle}/${cycles} · Round ${cyclingRoundNum}/${cyclingRoundsPerCycle}`
    : htype === "circuit" ? `Round ${round}/${totalRounds}`
    : `Cycle ${cycle}/${cycles} · Round ${round}/${totalRounds}`;

  if (phase === "idle") {
    return (
      <div style={{ ...s.timerIdleBar, borderColor: color + "44" }}>
        <span style={{ fontSize: 12, color: "#4DC3FF", fontWeight: 600 }}>{typeLabel[htype] || ""}</span>
        <button style={{ ...s.primaryBtn, background: color }} onClick={start}>▶ Start Timer</button>
      </div>
    );
  }

  return (
    <div style={{ ...s.timerSticky, borderColor: color + "44" }}>
      <div style={s.timerTopRow}>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: 1, color: paused ? "#8593A0" : phaseColor }}>
          {phaseLabel}
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={pause}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") pause(); }}
          style={s.timerIconBtn}
        >
          {phase === "done" ? "🎉" : paused ? "▶" : "⏸"}
        </span>
      </div>
      {/* The one clock - always shown at full size, never shrunk to a
          smaller "collapsed" version (0075) */}
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 72, fontWeight: 700, lineHeight: 1, letterSpacing: 2, margin: "2px 0 8px", textAlign: "center", color: paused ? "#8593A0" : phaseColor }}>
        {mm}:{ss}
      </div>
      <button style={s.timerExpandToggle} onClick={() => setExpanded(e => !e)}>
        {expanded ? "Less ▴" : "Details ▾"}
      </button>
      {expanded && (
        <div style={s.timerExpandedBody}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "#8593A0" }}>{typeLabel[htype] || ""} · {roundCycleText}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={() => setMuted(m => !m)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setMuted(m => !m); }}
              style={{ ...s.timerIconBtn, fontSize: 16 }}
            >
              {muted ? "🔇" : "🔊"}
            </span>
          </div>
          {currentExercise && (
            <div style={{ fontSize: 13, fontWeight: 600, color: "#E8EDF1", marginBottom: 8, textAlign: "center", padding: "4px 8px", background: "#1F272E", borderRadius: 8 }}>
              {currentExercise}
            </div>
          )}
          {phase === "done" && (
            <div style={{ background: "#15302a", color: "#3FCF8E", borderRadius: 10, padding: "9px 14px", fontWeight: 700, fontSize: 14, marginBottom: 8, textAlign: "center" }}>
              Session complete! Great work. 🎉
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}>
            <button style={s.dangerBtn} onClick={stop}>Stop</button>
            <button style={s.ghostBtn} onClick={pause}>{paused ? "▶ Resume" : "⏸ Pause"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  // borderWidth/borderStyle/borderColor kept separate (not the `border`
  // shorthand) on anything that conditionally overrides just borderColor
  // elsewhere - mixing shorthand and longhand across renders is a real
  // React footgun (triggers its own dev warning) that can leave a stale
  // border colour when toggling selection state.
  hyroxCfg: { borderWidth: 1, borderStyle: "solid", borderRadius: 12, padding: 16, marginBottom: 16 },
  dayLabelRow: { fontSize: 10, fontWeight: 700, color: "#8593A0", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8, marginTop: 10 },
  hyroxTypeGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 4 },
  hyroxTypeCard: { display: "flex", flexDirection: "column", gap: 4, padding: "12px 10px", borderRadius: 10, borderWidth: 1, borderStyle: "solid", borderColor: "#2A343D", background: "#1F272E", cursor: "pointer", textAlign: "left", color: "#E8EDF1" },
  hyroxTypeCardOn: { background: "#1a2840" },
  hyroxStepRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  hyroxStepNum: { width: 24, height: 24, borderRadius: "50%", background: "#2a2240", color: "#B388FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  fieldLabel: { fontSize: 10, color: "#8593A0", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 },
  miniInput: { background: "#1F272E", border: "1px solid #2A343D", borderRadius: 7, color: "#E8EDF1", padding: "6px 8px", fontSize: 13, minWidth: 60 },
  addSetBtn: { background: "#15302a", border: "1px solid #3FCF8E44", borderRadius: 7, padding: "5px 12px", color: "#3FCF8E", fontWeight: 700, fontSize: 12, cursor: "pointer" },
  iconBtn: { background: "transparent", border: "none", color: "#8593A0", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px" },
  roundChip: { borderRadius: 7, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13 },
  acWrap: { position: "relative", flex: 1 },
  acList: { position: "absolute", top: "100%", left: 0, right: 0, background: "#171D23", border: "1px solid #2A343D", borderRadius: 8, zIndex: 10, overflow: "hidden", maxHeight: 200, overflowY: "auto" },
  acItem: { width: "100%", padding: "8px 12px", background: "transparent", border: "none", color: "#E8EDF1", fontSize: 13, cursor: "pointer", textAlign: "left" },
  acAddItem: { width: "100%", padding: "8px 12px", background: "transparent", border: "none", borderTop: "1px solid #2A343D", color: "#3FCF8E", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" },
  addError: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 8 },
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 },
  ghostBtn: { background: "#1F272E", color: "#E8EDF1", border: "1px solid #2A343D", borderRadius: 9, padding: "9px 13px", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  primaryBtn: { border: "none", borderRadius: 9, padding: "9px 15px", fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#0a1420" },
  dangerBtn: { background: "transparent", color: "#ff7d7d", border: "1px solid #ff7d7d44", borderRadius: 9, padding: "9px 13px", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  // Inline, non-modal timer (0073) - idle bar before starting, then a
  // sticky bar (position: sticky keeps it pinned to the top of the
  // viewport while scrolling the rest of the page, without a blocking
  // backdrop like the old overlay had) once running.
  timerIdleBar: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "#171D23", borderWidth: 1, borderStyle: "solid", borderRadius: 10, padding: "10px 14px", marginBottom: 16,
  },
  timerSticky: {
    position: "sticky" as const, top: 0, zIndex: 50,
    background: "#171D23", borderWidth: 1, borderStyle: "solid", borderRadius: 10, marginBottom: 16,
    boxShadow: "0 8px 20px rgba(0,0,0,.35)",
  },
  timerTopRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 0" },
  timerIconBtn: { fontSize: 18, lineHeight: 1, cursor: "pointer", padding: 4 },
  timerExpandToggle: {
    display: "block", width: "100%", background: "transparent", border: "none", borderTop: "1px solid #2A343D",
    color: "#8593A0", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em",
    padding: "6px 0", cursor: "pointer",
  },
  timerExpandedBody: { padding: "10px 14px 14px" },
};
