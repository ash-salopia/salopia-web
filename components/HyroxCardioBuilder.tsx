"use client";

import { useState } from "react";
import type {
  HyroxType,
  HyroxConfig,
  HyroxFixedConfig,
  HyroxCyclingConfig,
  HyroxEMOMConfig,
  HyroxIntervalConfig,
  HyroxCircuitConfig,
  CardioConfig,
  Session,
} from "@/types";

// ── Cardio type definitions ───────────────────────────────────────────────────

export type CardioType = "lsd" | "interval" | "tempo" | "emom" | "fartlek";

const HYROX_TEMPLATES: { type: HyroxType; label: string; desc: string }[] = [
  { type: "interval",  label: "Interval",         desc: "Single exercise · sets · work / rest" },
  { type: "circuit",   label: "Circuit / AMRAP",  desc: "Multiple exercises · rounds or time cap" },
  { type: "emom",      label: "EMOM",             desc: "Every minute on the minute" },
  { type: "cycling",   label: "Cycling supersets", desc: "Alternating exercises in timed cycles" },
  { type: "fixed",     label: "Fixed / Race sim", desc: "Station-by-station targets + actuals" },
];

const CARDIO_TEMPLATES: { type: CardioType; label: string; desc: string }[] = [
  { type: "lsd",      label: "LSD",        desc: "Long slow distance · pace or HR zone" },
  { type: "interval", label: "Intervals",  desc: "Work / rest · sets" },
  { type: "tempo",    label: "Tempo",      desc: "Sustained effort · duration + pace" },
  { type: "emom",     label: "EMOM",       desc: "Every minute on the minute" },
  { type: "fartlek",  label: "Fartlek",    desc: "Unstructured speed play" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={s.fieldLabel}>{label}</div>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = "text", placeholder }: {
  value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      type={type}
      placeholder={placeholder}
      inputMode={type === "number" ? "numeric" : undefined}
      style={s.input}
    />
  );
}

function NumInput({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <input
      value={value || ""}
      onChange={e => { const n = parseInt(e.target.value); onChange(isNaN(n) ? 0 : Math.max(min, n)); }}
      inputMode="numeric"
      style={s.input}
    />
  );
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button style={s.addRowBtn} onClick={onClick}>{label}</button>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return <button style={s.removeBtn} onClick={onClick}>✕</button>;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  session: Session;
  color: string;
  onTypeChange: (hyroxType: string | null, cardioType: string | null) => void;
  onConfigChange: (config: HyroxConfig | CardioConfig) => void;
  onStartTimer: (workSec: number, restSec: number, rounds: number) => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HyroxCardioBuilder({ session, color, onTypeChange, onConfigChange, onStartTimer }: Props) {
  const isHyrox  = session.type === "hyrox";
  const isCardio = session.type === "cardio";

  const currentHyroxType  = session.hyrox_type  as HyroxType | null;
  const currentCardioType = session.cardio_type  as CardioType | null;
  const currentType = isHyrox ? currentHyroxType : currentCardioType;
  const templates   = isHyrox ? HYROX_TEMPLATES  : CARDIO_TEMPLATES;

  const config = (isHyrox ? session.hyrox_config : session.cardio_config) ?? {};

  const handleTemplateSelect = (type: string) => {
    if (isHyrox) {
      onTypeChange(type, null);
      onConfigChange({});
    } else {
      onTypeChange(null, type);
      onConfigChange({});
    }
  };

  return (
    <div style={s.wrap}>
      {/* Template picker */}
      <div style={s.pickerRow}>
        {templates.map(t => (
          <button
            key={t.type}
            style={{
              ...s.templateBtn,
              ...(currentType === t.type ? { ...s.templateBtnActive, borderColor: color, color } : {}),
            }}
            onClick={() => handleTemplateSelect(t.type)}
          >
            <div style={s.templateLabel}>{t.label}</div>
            <div style={s.templateDesc}>{t.desc}</div>
          </button>
        ))}
      </div>

      {/* Config UI */}
      {currentType && (
        <div style={s.configWrap}>
          {isHyrox && currentHyroxType === "interval"  && <HyroxIntervalBuilder  config={config as HyroxIntervalConfig}  onChange={onConfigChange} color={color} onStartTimer={onStartTimer} />}
          {isHyrox && currentHyroxType === "circuit"   && <HyroxCircuitBuilder   config={config as HyroxCircuitConfig}   onChange={onConfigChange} color={color} onStartTimer={onStartTimer} />}
          {isHyrox && currentHyroxType === "emom"      && <EMOMBuilder           config={config as HyroxEMOMConfig}      onChange={onConfigChange} color={color} />}
          {isHyrox && currentHyroxType === "cycling"   && <HyroxCyclingBuilder   config={config as HyroxCyclingConfig}   onChange={onConfigChange} color={color} onStartTimer={onStartTimer} />}
          {isHyrox && currentHyroxType === "fixed"     && <HyroxFixedBuilder     config={config as HyroxFixedConfig}     onChange={onConfigChange} color={color} />}
          {isCardio && currentCardioType === "lsd"      && <CardioLSDBuilder      config={config as CardioConfig} onChange={onConfigChange} color={color} />}
          {isCardio && currentCardioType === "interval" && <CardioIntervalBuilder config={config as CardioConfig} onChange={onConfigChange} color={color} onStartTimer={onStartTimer} />}
          {isCardio && currentCardioType === "tempo"    && <CardioTempoBuilder    config={config as CardioConfig} onChange={onConfigChange} color={color} />}
          {isCardio && currentCardioType === "emom"     && <EMOMBuilder           config={config as HyroxEMOMConfig} onChange={onConfigChange} color={color} />}
          {isCardio && currentCardioType === "fartlek"  && <CardioFartlekBuilder  config={config as CardioConfig} onChange={onConfigChange} color={color} />}
        </div>
      )}
    </div>
  );
}

// ── Hyrox: Interval ──────────────────────────────────────────────────────────

function HyroxIntervalBuilder({ config, onChange, color, onStartTimer }: {
  config: Partial<HyroxIntervalConfig>; onChange: (c: HyroxConfig) => void;
  color: string; onStartTimer: (w: number, r: number, rounds: number) => void;
}) {
  const c = { exercise: "", load: "", sets: 5, workSec: 40, restSec: 20, results: [], ...config };
  const up = (patch: Partial<HyroxIntervalConfig>) => onChange({ ...c, ...patch } as HyroxConfig);

  const ensureResults = (sets: number, current: string[]) => {
    const arr = [...current];
    while (arr.length < sets) arr.push("");
    return arr.slice(0, sets);
  };

  const setSets = (n: number) => up({ sets: n, results: ensureResults(n, c.results) });

  return (
    <div style={s.builder}>
      <div style={s.row3}>
        <Field label="Exercise"><Input value={c.exercise} onChange={v => up({ exercise: v })} placeholder="e.g. Row" /></Field>
        <Field label="Load / target"><Input value={c.load} onChange={v => up({ load: v })} placeholder="e.g. Damper 5" /></Field>
        <Field label="Sets"><NumInput value={c.sets} onChange={setSets} min={1} /></Field>
      </div>
      <div style={s.row3}>
        <Field label="Work (sec)"><NumInput value={c.workSec} onChange={v => up({ workSec: v })} /></Field>
        <Field label="Rest (sec)"><NumInput value={c.restSec} onChange={v => up({ restSec: v })} /></Field>
        <Field label=""><div /></Field>
      </div>

      {/* Per-set result logging */}
      {c.sets > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          <div style={s.fieldLabel}>Results</div>
          <div style={s.resultsGrid}>
            {Array.from({ length: c.sets }, (_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 11, color: "var(--mute)", width: 16, flexShrink: 0 }}>{i + 1}</div>
                <Input
                  value={c.results[i] ?? ""}
                  onChange={v => {
                    const r = [...(c.results ?? [])];
                    while (r.length <= i) r.push("");
                    r[i] = v;
                    up({ results: r });
                  }}
                  placeholder="e.g. 1:45"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <button style={{ ...s.timerBtn, background: color }} onClick={() => onStartTimer(c.workSec, c.restSec, c.sets)}>
        ▶ Start Timer ({c.sets} × {c.workSec}s / {c.restSec}s rest)
      </button>
    </div>
  );
}

// ── Hyrox: Circuit / AMRAP ───────────────────────────────────────────────────

function HyroxCircuitBuilder({ config, onChange, color, onStartTimer }: {
  config: Partial<HyroxCircuitConfig>; onChange: (c: HyroxConfig) => void;
  color: string; onStartTimer: (w: number, r: number, rounds: number) => void;
}) {
  const c: HyroxCircuitConfig = {
    isAmrap: false, rounds: 3, timeCap: 0, restSec: 60,
    exercises: [{ exercise: "", reps: "" }],
    roundsDone: [], amrapResult: "", ...config,
  };
  const up = (patch: Partial<HyroxCircuitConfig>) => onChange({ ...c, ...patch } as HyroxConfig);

  const addEx = () => up({ exercises: [...c.exercises, { exercise: "", reps: "" }] });
  const removeEx = (i: number) => up({ exercises: c.exercises.filter((_, j) => j !== i) });
  const updateEx = (i: number, field: "exercise" | "reps", val: string) => {
    const exs = c.exercises.map((e, j) => j === i ? { ...e, [field]: val } : e);
    up({ exercises: exs });
  };

  return (
    <div style={s.builder}>
      {/* AMRAP toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          style={{ ...s.toggleBtn, background: c.isAmrap ? color : "var(--panel2)", color: c.isAmrap ? "#0a1420" : "var(--mute)" }}
          onClick={() => up({ isAmrap: !c.isAmrap })}
        >
          {c.isAmrap ? "✓ AMRAP" : "AMRAP"}
        </button>
        <span style={{ fontSize: 12, color: "var(--mute)" }}>
          {c.isAmrap ? "As many rounds as possible in the time cap" : "Fixed rounds"}
        </span>
      </div>

      <div style={s.row3}>
        {c.isAmrap ? (
          <Field label="Time cap (min)"><NumInput value={Math.floor(c.timeCap / 60)} onChange={v => up({ timeCap: v * 60 })} /></Field>
        ) : (
          <Field label="Rounds"><NumInput value={c.rounds} onChange={v => up({ rounds: v })} min={1} /></Field>
        )}
        <Field label="Rest between rounds (sec)"><NumInput value={c.restSec} onChange={v => up({ restSec: v })} /></Field>
        <Field label=""><div /></Field>
      </div>

      {/* Exercises */}
      <div>
        <div style={s.fieldLabel}>Exercises</div>
        {c.exercises.map((ex, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <div style={{ flex: 2 }}><Input value={ex.exercise} onChange={v => updateEx(i, "exercise", v)} placeholder={`Exercise ${i + 1}`} /></div>
            <div style={{ flex: 1 }}><Input value={ex.reps} onChange={v => updateEx(i, "reps", v)} placeholder="Reps / target" /></div>
            <RemoveBtn onClick={() => removeEx(i)} />
          </div>
        ))}
        <AddBtn label="+ Exercise" onClick={addEx} />
      </div>

      {/* AMRAP result */}
      {c.isAmrap && (
        <Field label="AMRAP result">
          <Input value={c.amrapResult} onChange={v => up({ amrapResult: v })} placeholder="e.g. 4 rounds + 3 reps" />
        </Field>
      )}

      {/* Round checkboxes */}
      {!c.isAmrap && c.rounds > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Array.from({ length: c.rounds }, (_, i) => (
            <button
              key={i}
              style={{
                ...s.roundChip,
                background: c.roundsDone[i] ? color : "var(--ink)",
                color: c.roundsDone[i] ? "#0a1420" : "var(--mute)",
                border: `1px solid ${c.roundsDone[i] ? color : "var(--line)"}`,
                fontWeight: c.roundsDone[i] ? 700 : 500,
              }}
              onClick={() => {
                const d = [...c.roundsDone];
                d[i] = !d[i];
                up({ roundsDone: d });
              }}
            >
              R{i + 1} {c.roundsDone[i] ? "✓" : ""}
            </button>
          ))}
        </div>
      )}

      {!c.isAmrap && (
        <button style={{ ...s.timerBtn, background: color }} onClick={() => onStartTimer(c.timeCap || 1800, c.restSec, c.rounds)}>
          ▶ Start Timer
        </button>
      )}
    </div>
  );
}

// ── EMOM (shared Hyrox + Cardio) ─────────────────────────────────────────────

function EMOMBuilder({ config, onChange, color }: {
  config: Partial<HyroxEMOMConfig>; onChange: (c: HyroxConfig | CardioConfig) => void; color: string;
}) {
  const c: HyroxEMOMConfig = {
    mins: 10,
    slots: [{ minute: "1", exercise: "", reps: "" }],
    ...config,
  };
  const up = (patch: Partial<HyroxEMOMConfig>) => onChange({ ...c, ...patch });

  const addSlot = () => up({ slots: [...c.slots, { minute: String(c.slots.length + 1), exercise: "", reps: "" }] });
  const removeSlot = (i: number) => up({ slots: c.slots.filter((_, j) => j !== i) });
  const updateSlot = (i: number, field: keyof typeof c.slots[0], val: string) => {
    const slots = c.slots.map((s, j) => j === i ? { ...s, [field]: val } : s);
    up({ slots });
  };

  return (
    <div style={s.builder}>
      <Field label="Total minutes"><NumInput value={c.mins} onChange={v => up({ mins: v })} min={1} /></Field>

      <div>
        <div style={s.fieldLabel}>Slots — what happens each minute</div>
        {c.slots.map((slot, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <div style={{ width: 56 }}>
              <Input value={slot.minute} onChange={v => updateSlot(i, "minute", v)} placeholder="Min" />
            </div>
            <div style={{ flex: 2 }}>
              <Input value={slot.exercise} onChange={v => updateSlot(i, "exercise", v)} placeholder="Exercise" />
            </div>
            <div style={{ flex: 1 }}>
              <Input value={slot.reps} onChange={v => updateSlot(i, "reps", v)} placeholder="Reps / target" />
            </div>
            <RemoveBtn onClick={() => removeSlot(i)} />
          </div>
        ))}
        <AddBtn label="+ Minute slot" onClick={addSlot} />
      </div>

      <div style={{ fontSize: 12, color: "var(--mute)", fontStyle: "italic" }}>
        Tip: use repeating minute ranges like "1, 3, 5…" to show which minutes an exercise repeats.
      </div>
    </div>
  );
}

// ── Hyrox: Cycling supersets ──────────────────────────────────────────────────

function HyroxCyclingBuilder({ config, onChange, color, onStartTimer }: {
  config: Partial<HyroxCyclingConfig>; onChange: (c: HyroxConfig) => void;
  color: string; onStartTimer: (w: number, r: number, rounds: number) => void;
}) {
  const c: HyroxCyclingConfig = {
    exercises: [{ exercise: "", reps: "" }, { exercise: "", reps: "" }],
    workSec: 40, restSec: 20, rounds: 8, cycles: 3, cyclRestSec: 90, ...config,
  };
  const up = (patch: Partial<HyroxCyclingConfig>) => onChange({ ...c, ...patch } as HyroxConfig);

  const updateEx = (i: number, field: "exercise" | "reps", val: string) => {
    const exs = c.exercises.map((e, j) => j === i ? { ...e, [field]: val } : e);
    up({ exercises: exs });
  };
  const addEx = () => up({ exercises: [...c.exercises, { exercise: "", reps: "" }] });
  const removeEx = (i: number) => up({ exercises: c.exercises.filter((_, j) => j !== i) });

  return (
    <div style={s.builder}>
      <div>
        <div style={s.fieldLabel}>Exercises (cycle through these)</div>
        {c.exercises.map((ex, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <div style={{ flex: 2 }}><Input value={ex.exercise} onChange={v => updateEx(i, "exercise", v)} placeholder={`Exercise ${i + 1}`} /></div>
            <div style={{ flex: 1 }}><Input value={ex.reps} onChange={v => updateEx(i, "reps", v)} placeholder="Reps / target" /></div>
            <RemoveBtn onClick={() => removeEx(i)} />
          </div>
        ))}
        <AddBtn label="+ Exercise" onClick={addEx} />
      </div>

      <div style={s.row3}>
        <Field label="Work (sec)"><NumInput value={c.workSec} onChange={v => up({ workSec: v })} /></Field>
        <Field label="Rest (sec)"><NumInput value={c.restSec} onChange={v => up({ restSec: v })} /></Field>
        <Field label="Rounds per cycle"><NumInput value={c.rounds} onChange={v => up({ rounds: v })} min={1} /></Field>
      </div>
      <div style={s.row3}>
        <Field label="Cycles"><NumInput value={c.cycles} onChange={v => up({ cycles: v })} min={1} /></Field>
        <Field label="Rest between cycles (sec)"><NumInput value={c.cyclRestSec} onChange={v => up({ cyclRestSec: v })} /></Field>
        <Field label=""><div /></Field>
      </div>

      <button style={{ ...s.timerBtn, background: color }} onClick={() => onStartTimer(c.workSec, c.restSec, c.rounds * c.cycles)}>
        ▶ Start Timer
      </button>
    </div>
  );
}

// ── Hyrox: Fixed / Race sim ───────────────────────────────────────────────────

const HYROX_STATIONS = [
  "1km run", "SkiErg", "1km run", "Sled push",
  "1km run", "Sled pull", "1km run", "Burpee broad jumps",
  "1km run", "Row", "1km run", "Farmers carry",
  "1km run", "Sandbag lunges", "1km run", "Wall balls",
];

function HyroxFixedBuilder({ config, onChange, color }: {
  config: Partial<HyroxFixedConfig>; onChange: (c: HyroxConfig) => void; color: string;
}) {
  const defaultSteps = HYROX_STATIONS.map(ex => ({ exercise: ex, target: "", actual: "" }));
  const c: HyroxFixedConfig = { steps: defaultSteps, ...config };
  if (!c.steps.length) c.steps = defaultSteps;
  const up = (steps: HyroxFixedConfig["steps"]) => onChange({ steps } as HyroxConfig);

  const updateStep = (i: number, field: "exercise" | "target" | "actual", val: string) => {
    const steps = c.steps.map((s, j) => j === i ? { ...s, [field]: val } : s);
    up(steps);
  };

  return (
    <div style={s.builder}>
      <div style={{ fontSize: 12, color: "var(--mute)", marginBottom: 4 }}>
        Standard Hyrox race format. Edit stations, set targets, and log actuals after.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 6, alignItems: "center" }}>
        <div style={s.fieldLabel}>Station</div>
        <div style={s.fieldLabel}>Target</div>
        <div style={s.fieldLabel}>Actual</div>
        <div />
        {c.steps.map((step, i) => (
          <>
            <Input key={`ex-${i}`} value={step.exercise} onChange={v => updateStep(i, "exercise", v)} placeholder="Station" />
            <Input key={`tg-${i}`} value={step.target} onChange={v => updateStep(i, "target", v)} placeholder="Target" />
            <Input key={`ac-${i}`} value={step.actual} onChange={v => updateStep(i, "actual", v)} placeholder="Actual" />
            <RemoveBtn key={`rm-${i}`} onClick={() => up(c.steps.filter((_, j) => j !== i))} />
          </>
        ))}
      </div>
      <AddBtn label="+ Station" onClick={() => up([...c.steps, { exercise: "", target: "", actual: "" }])} />
    </div>
  );
}

// ── Cardio: LSD ──────────────────────────────────────────────────────────────

function CardioLSDBuilder({ config, onChange, color }: {
  config: CardioConfig; onChange: (c: CardioConfig) => void; color: string;
}) {
  const c = { distance: "", duration: "", targetPace: "", hrZone: "", notes: "", ...config } as any;
  const up = (patch: any) => onChange({ ...c, ...patch });

  return (
    <div style={s.builder}>
      <div style={s.row3}>
        <Field label="Distance"><Input value={c.distance} onChange={v => up({ distance: v })} placeholder="e.g. 10km" /></Field>
        <Field label="Duration"><Input value={c.duration} onChange={v => up({ duration: v })} placeholder="e.g. 60 min" /></Field>
        <Field label="HR zone"><Input value={c.hrZone} onChange={v => up({ hrZone: v })} placeholder="e.g. Zone 2" /></Field>
      </div>
      <Field label="Target pace"><Input value={c.targetPace} onChange={v => up({ targetPace: v })} placeholder="e.g. 5:30 /km" /></Field>
      <Field label="Notes"><Input value={c.notes} onChange={v => up({ notes: v })} placeholder="Terrain, route, effort guidance…" /></Field>
    </div>
  );
}

// ── Cardio: Intervals ─────────────────────────────────────────────────────────

function CardioIntervalBuilder({ config, onChange, color, onStartTimer }: {
  config: CardioConfig; onChange: (c: CardioConfig) => void;
  color: string; onStartTimer: (w: number, r: number, rounds: number) => void;
}) {
  const c = { exercise: "", sets: 6, workSec: 60, restSec: 90, targetPace: "", results: [], ...config } as any;
  const up = (patch: any) => onChange({ ...c, ...patch });

  return (
    <div style={s.builder}>
      <div style={s.row3}>
        <Field label="Exercise"><Input value={c.exercise} onChange={v => up({ exercise: v })} placeholder="e.g. 400m run" /></Field>
        <Field label="Target pace"><Input value={c.targetPace} onChange={v => up({ targetPace: v })} placeholder="e.g. 1:45" /></Field>
        <Field label="Sets"><NumInput value={c.sets} onChange={v => up({ sets: v, results: [] })} min={1} /></Field>
      </div>
      <div style={s.row3}>
        <Field label="Work (sec)"><NumInput value={c.workSec} onChange={v => up({ workSec: v })} /></Field>
        <Field label="Rest (sec)"><NumInput value={c.restSec} onChange={v => up({ restSec: v })} /></Field>
        <Field label=""><div /></Field>
      </div>
      <div>
        <div style={s.fieldLabel}>Results</div>
        <div style={s.resultsGrid}>
          {Array.from({ length: c.sets }, (_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 11, color: "var(--mute)", width: 16, flexShrink: 0 }}>{i + 1}</div>
              <Input value={c.results[i] ?? ""} onChange={v => {
                const r = [...(c.results ?? [])];
                while (r.length <= i) r.push("");
                r[i] = v; up({ results: r });
              }} placeholder="Time / pace" />
            </div>
          ))}
        </div>
      </div>
      <button style={{ ...s.timerBtn, background: color }} onClick={() => onStartTimer(c.workSec, c.restSec, c.sets)}>
        ▶ Start Timer ({c.sets} × {c.workSec}s / {c.restSec}s rest)
      </button>
    </div>
  );
}

// ── Cardio: Tempo ─────────────────────────────────────────────────────────────

function CardioTempoBuilder({ config, onChange, color }: {
  config: CardioConfig; onChange: (c: CardioConfig) => void; color: string;
}) {
  const c = { duration: "", distance: "", targetPace: "", hrZone: "", notes: "", actualTime: "", ...config } as any;
  const up = (patch: any) => onChange({ ...c, ...patch });

  return (
    <div style={s.builder}>
      <div style={s.row3}>
        <Field label="Duration"><Input value={c.duration} onChange={v => up({ duration: v })} placeholder="e.g. 20 min" /></Field>
        <Field label="Distance"><Input value={c.distance} onChange={v => up({ distance: v })} placeholder="e.g. 5km" /></Field>
        <Field label="HR zone"><Input value={c.hrZone} onChange={v => up({ hrZone: v })} placeholder="e.g. Zone 3–4" /></Field>
      </div>
      <div style={s.row3}>
        <Field label="Target pace"><Input value={c.targetPace} onChange={v => up({ targetPace: v })} placeholder="e.g. 4:45 /km" /></Field>
        <Field label="Actual time"><Input value={c.actualTime} onChange={v => up({ actualTime: v })} placeholder="Log after" /></Field>
        <Field label=""><div /></Field>
      </div>
      <Field label="Notes"><Input value={c.notes} onChange={v => up({ notes: v })} placeholder="Effort guidance, route…" /></Field>
    </div>
  );
}

// ── Cardio: Fartlek ───────────────────────────────────────────────────────────

function CardioFartlekBuilder({ config, onChange, color }: {
  config: CardioConfig; onChange: (c: CardioConfig) => void; color: string;
}) {
  const c = { duration: "", structure: "", notes: "", result: "", ...config } as any;
  const up = (patch: any) => onChange({ ...c, ...patch });

  return (
    <div style={s.builder}>
      <Field label="Total duration"><Input value={c.duration} onChange={v => up({ duration: v })} placeholder="e.g. 45 min" /></Field>
      <Field label="Structure / guidance">
        <textarea
          value={c.structure}
          onChange={e => up({ structure: e.target.value })}
          placeholder="e.g. After a 10-min warm-up, surge hard for 1–2 min whenever you feel ready, recover at easy pace, repeat…"
          rows={3}
          style={{ ...s.input, resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>
      <Field label="Result / notes">
        <Input value={c.result} onChange={v => up({ result: v })} placeholder="How did it go?" />
      </Field>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 },
  pickerRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  templateBtn: {
    background: "var(--ink)", border: "1px solid var(--line)",
    borderRadius: 10, padding: "10px 14px", cursor: "pointer",
    textAlign: "left", minWidth: 120, flex: "1 1 auto",
  },
  templateBtnActive: { background: "var(--accent-dim)" },
  templateLabel: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 2 },
  templateDesc: { fontSize: 11, color: "var(--mute)", lineHeight: 1.4 },
  configWrap: {
    background: "var(--panel)", border: "1px solid var(--line)",
    borderRadius: 12, padding: 18,
  },
  builder: { display: "flex", flexDirection: "column", gap: 14 },
  fieldLabel: {
    fontSize: 11, fontWeight: 700, color: "var(--mute)",
    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2,
  },
  input: {
    width: "100%", background: "var(--ink)", border: "1px solid var(--line)",
    color: "var(--text)", borderRadius: 8, padding: "8px 10px",
    fontSize: 13, fontFamily: "inherit",
  },
  row3: { display: "flex", gap: 10 },
  addRowBtn: {
    background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)",
    borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer", marginTop: 4,
  },
  removeBtn: {
    background: "transparent", border: "1px solid var(--line)", color: "#FF6B6B",
    borderRadius: 6, padding: "5px 8px", fontSize: 11, cursor: "pointer", flexShrink: 0,
  },
  timerBtn: {
    width: "100%", border: "none", borderRadius: 10,
    padding: "13px 0", fontSize: 14, fontWeight: 700,
    color: "#0a1420", cursor: "pointer", marginTop: 4,
  },
  toggleBtn: {
    border: "none", borderRadius: 8, padding: "8px 14px",
    fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  roundChip: {
    borderRadius: 7, padding: "6px 12px", fontSize: 12,
    fontWeight: 600, cursor: "pointer",
  },
  resultsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 6 },
};
