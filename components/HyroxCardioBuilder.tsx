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

// ── Audio engine (ported exactly from the original) ───────────────────────────

let _audioCtx: AudioContext | null = null;
let _keepAliveOsc: OscillatorNode | null = null;
let _soundMuted = false;

function getAudioCtx(): AudioContext | null {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
  }
  return _audioCtx;
}
function startKeepAlive() {
  const ctx = getAudioCtx(); if (!ctx || _keepAliveOsc) return;
  try {
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    gain.gain.value = 0.00001; osc.frequency.value = 20;
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); _keepAliveOsc = osc;
  } catch {}
}
function stopKeepAlive() {
  if (_keepAliveOsc) { try { _keepAliveOsc.stop(); } catch {} _keepAliveOsc = null; }
}
function unlockAudio() {
  const ctx = getAudioCtx(); if (!ctx) return;
  const finish = () => { startKeepAlive(); };
  if (ctx.state === "suspended") ctx.resume().then(finish).catch(() => {}); else finish();
}
function doPlayBeep(ctx: AudioContext, freq: number, ms: number, vol: number, type: OscillatorType) {
  try {
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = type; osc.frequency.value = freq; gain.gain.value = vol;
    osc.connect(gain); gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + ms / 1000);
    osc.start(now); osc.stop(now + ms / 1000 + 0.02);
  } catch {}
}
function playBeep(freq = 880, ms = 120, vol = 0.25, type: OscillatorType = "sine") {
  if (_soundMuted) return;
  const ctx = getAudioCtx(); if (!ctx) return;
  if (ctx.state === "running") doPlayBeep(ctx, freq, ms, vol, type);
  else ctx.resume().then(() => doPlayBeep(ctx, freq, ms, vol, type)).catch(() => {});
}
function playCountdownBeep() { playBeep(660, 110, 0.55, "sine"); }
function playDing() { playBeep(988, 320, 0.7, "triangle"); }
function playDoneBeep() {
  playBeep(880, 180, 0.65); setTimeout(() => playBeep(1100, 180, 0.65), 180); setTimeout(() => playBeep(1320, 280, 0.7), 360);
}

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
  value: string; onChange: (v: string) => void;
  library: LibraryEntry[]; types: string[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<any>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const filtered = library
    .filter(e => !types.length || (e.types || []).some((t: string) => types.includes(t)))
    .filter(e => !value.trim() || e.name.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 8);
  return (
    <div style={{ position: "relative", flex: 1 }}>
      <input
        value={value} placeholder={placeholder || "Exercise"}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { timer.current = setTimeout(() => setOpen(false), 150); }}
        style={{ ...s.miniInput, width: "100%" }}
      />
      {open && filtered.length > 0 && (
        <div style={s.acList}>
          {filtered.map((m, i) => (
            <button key={i} style={s.acItem} onMouseDown={e => { e.preventDefault(); onChange(m.name); setOpen(false); }}>
              {m.name}
            </button>
          ))}
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
  const [timerOpen, setTimerOpen] = useState(false);
  const isHyrox = session.type === "hyrox";
  const types = isHyrox ? HYROX_TYPES : CARDIO_TYPES;
  const currentType = isHyrox ? (session.hyrox_type || "") : ((session as any).cardio_type || "");
  const cfg: any = (isHyrox ? session.hyrox_config : session.cardio_config) || {};

  const upd = (patch: object) => onConfigChange({ ...cfg, ...patch });
  const setType = (t: string) => {
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

      {/* Timer launch banner */}
      {currentType && (
        <div style={{ ...s.hyroxBanner, borderColor: color + "44" }}>
          <span style={{ fontSize: 13, color: "#E8EDF1" }}>
            {isHyrox ? "Configure then start the timer" : "Configure then start timer"}
          </span>
          <button style={{ ...s.timerLaunchBtn, background: color }} onClick={() => setTimerOpen(true)}>
            ▶ Start Timer
          </button>
        </div>
      )}

      {/* Hyrox builders */}
      {isHyrox && currentType === "fixed"    && <HyroxFixed    cfg={cfg} upd={upd} library={library} />}
      {isHyrox && currentType === "cycling"  && <HyroxCycling  cfg={cfg} upd={upd} library={library} color={color} />}
      {isHyrox && currentType === "emom"     && <HyroxEMOM     cfg={cfg} upd={upd} />}
      {isHyrox && currentType === "interval" && <HyroxInterval cfg={cfg} upd={upd} library={library} />}
      {isHyrox && currentType === "circuit"  && <HyroxCircuit  cfg={cfg} upd={upd} />}

      {/* Cardio builders */}
      {!isHyrox && currentType === "continuous"      && <CardioContinuous  cfg={cfg} upd={upd} library={library} />}
      {!isHyrox && currentType === "threshold"       && <CardioThreshold   cfg={cfg} upd={upd} library={library} />}
      {!isHyrox && currentType === "cardioIntervals" && <CardioIntervals   cfg={cfg} upd={upd} library={library} />}
      {!isHyrox && currentType === "overUnder"       && <CardioOverUnder   cfg={cfg} upd={upd} library={library} />}

      {/* Timer modal */}
      {timerOpen && currentType && (
        <HyroxTimer session={session} onClose={() => setTimerOpen(false)} color={color} />
      )}
    </div>
  );
}

// ── Hyrox: Fixed ──────────────────────────────────────────────────────────────

function HyroxFixed({ cfg, upd, library }: { cfg: any; upd: (p: any) => void; library: LibraryEntry[] }) {
  const steps = cfg.steps || [{ exercise: "", target: "", actual: "" }];
  useEffect(() => { if (!cfg.steps) upd({ steps }); }, []);
  const updSteps = (s: any[]) => upd({ steps: s });
  const updStep = (i: number, patch: any) => updSteps(steps.map((x: any, j: number) => j === i ? { ...x, ...patch } : x));

  return (
    <div style={{ marginTop: 12 }}>
      <div style={s.dayLabelRow}>Workout sequence</div>
      {steps.map((step: any, i: number) => (
        <div key={i} style={s.hyroxStepRow}>
          <div style={s.hyroxStepNum}>{i + 1}</div>
          <LibraryAutocomplete value={step.exercise} onChange={v => updStep(i, { exercise: v })}
            library={library} types={["hyrox"]} placeholder="Exercise" />
          <input value={step.target} placeholder="Target" onChange={e => updStep(i, { target: e.target.value })}
            style={{ ...s.miniInput, width: 90 }} />
          <input value={step.actual || ""} placeholder="Actual result"
            onChange={e => updStep(i, { actual: e.target.value })}
            style={{ ...s.miniInput, width: 110, background: "#0F1418" }} />
          {steps.length > 1 && (
            <button style={s.iconBtn} onClick={() => updSteps(steps.filter((_: any, j: number) => j !== i))}>×</button>
          )}
        </div>
      ))}
      <button style={s.addSetBtn} onClick={() => updSteps([...steps, { exercise: "", target: "", actual: "" }])}>+ Step</button>
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
      {exercises.map((ex: any, i: number) => (
        <div key={i} style={s.hyroxStepRow}>
          <div style={s.hyroxStepNum}>{i + 1}</div>
          <LibraryAutocomplete value={ex.exercise} onChange={v => updE(i, { exercise: v })}
            library={library} types={["hyrox"]} />
          <input value={ex.reps} placeholder="Reps / target" onChange={e => updE(i, { reps: e.target.value })}
            style={{ ...s.miniInput, width: 100 }} />
          {exercises.length > 1 && <button style={s.iconBtn} onClick={() => updEx(exercises.filter((_: any, j: number) => j !== i))}>×</button>}
        </div>
      ))}
      <button style={s.addSetBtn} onClick={() => updEx([...exercises, { exercise: "", reps: "" }])}>+ Exercise</button>
      <div style={{ marginTop: 10, background: "#2a2240", borderRadius: 10, padding: "10px 14px", border: "1px solid #B388FF44" }}>
        <div style={{ fontSize: 12, color: "#B388FF", fontWeight: 600, marginBottom: 4 }}>Structure preview</div>
        <div style={{ fontSize: 13, color: "#E8EDF1" }}>{exercises.length} exercises × {workSec}s on / {restSec}s rest</div>
        <div style={{ fontSize: 13, color: "#E8EDF1" }}>×{rounds} rounds per cycle then {cyclRestSec}s rest ×{cycles} cycles</div>
        <div style={{ fontSize: 12, color: "#8593A0", marginTop: 4 }}>Total approx: {totalMin} min</div>
      </div>
    </div>
  );
}

// ── Hyrox: EMOM ───────────────────────────────────────────────────────────────

function HyroxEMOM({ cfg, upd }: { cfg: any; upd: (p: any) => void }) {
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
          <input value={slot.exercise} placeholder="Exercise"
            onChange={e => updSlot(i, { exercise: e.target.value })} style={{ ...s.miniInput, flex: 2 }} />
          <input value={slot.reps} placeholder="Reps/dist"
            onChange={e => updSlot(i, { reps: e.target.value })} style={{ ...s.miniInput, width: 80 }} />
          {slots.length > 1 && <button style={s.iconBtn} onClick={() => updSlots(slots.filter((_: any, j: number) => j !== i))}>×</button>}
        </div>
      ))}
      <button style={s.addSetBtn} onClick={() => updSlots([...slots, { minute: String(slots.length + 1), exercise: "", reps: "" }])}>+ Slot</button>
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
          <LibraryAutocomplete value={cfg.exercise || ""} onChange={v => upd({ exercise: v })}
            library={library} types={["hyrox"]} placeholder="e.g. SkiErg 500m" />
        </Field>
        <Field label="Load"><input value={cfg.load || ""} placeholder="e.g. BW / 80kg" onChange={e => upd({ load: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Sets"><input inputMode="numeric" value={cfg.sets ?? 6} onChange={e => upd({ sets: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Work (s)"><input inputMode="numeric" value={cfg.workSec ?? 120} onChange={e => upd({ workSec: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Rest (s)"><input inputMode="numeric" value={cfg.restSec ?? 90} onChange={e => upd({ restSec: e.target.value })} style={s.miniInput} /></Field>
      </div>
      <div style={s.dayLabelRow}>Log your results</div>
      {Array.from({ length: sets }, (_, i) => {
        const result = (cfg.results || [])[i] || "";
        return (
          <div key={i} style={s.hyroxStepRow}>
            <div style={s.hyroxStepNum}>{i + 1}</div>
            <span style={{ color: "#8593A0", fontSize: 12, minWidth: 40 }}>Set {i + 1}</span>
            <input value={result} placeholder="Time / distance / result"
              onChange={e => { const r = [...(cfg.results || Array(sets).fill(""))]; r[i] = e.target.value; upd({ results: r }); }}
              style={{ ...s.miniInput, flex: 1, background: "#0F1418" }} />
          </div>
        );
      })}
    </div>
  );
}

// ── Hyrox: Circuit / AMRAP ───────────────────────────────────────────────────

function HyroxCircuit({ cfg, upd }: { cfg: any; upd: (p: any) => void }) {
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
      {exercises.map((ex: any, i: number) => (
        <div key={i} style={s.hyroxStepRow}>
          <div style={s.hyroxStepNum}>{i + 1}</div>
          <input value={ex.exercise} placeholder="Exercise" onChange={e => updE(i, { exercise: e.target.value })}
            style={{ ...s.miniInput, flex: 2 }} />
          <input value={ex.reps} placeholder="Reps/dist" onChange={e => updE(i, { reps: e.target.value })}
            style={{ ...s.miniInput, width: 80 }} />
          {exercises.length > 1 && <button style={s.iconBtn} onClick={() => updEx(exercises.filter((_: any, j: number) => j !== i))}>×</button>}
        </div>
      ))}
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
      {isAmrap && (
        <Field label="Rounds completed">
          <input value={cfg.amrapResult || ""} placeholder="e.g. 6 rounds + 2 exercises"
            onChange={e => upd({ amrapResult: e.target.value })} style={{ ...s.miniInput, width: "100%", background: "#0F1418" }} />
        </Field>
      )}
    </div>
  );
}

// ── Cardio: Continuous / LSD ─────────────────────────────────────────────────

function CardioContinuous({ cfg, upd, library }: { cfg: any; upd: (p: any) => void; library: LibraryEntry[] }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Field label="Activity" grow>
          <LibraryAutocomplete value={cfg.modality || "Run"} onChange={v => upd({ modality: v })}
            library={library} types={["cardio", "hyrox"]} placeholder="Run, Bike…" />
        </Field>
        <Field label="Duration"><input value={cfg.duration || ""} placeholder="e.g. 60 min" onChange={e => upd({ duration: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Distance"><input value={cfg.distance || ""} placeholder="e.g. 10 km" onChange={e => upd({ distance: e.target.value })} style={s.miniInput} /></Field>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Field label="Zone / Intensity" grow><input value={cfg.intensity || ""} placeholder="e.g. Z2 / easy / 70% HR" onChange={e => upd({ intensity: e.target.value })} style={{ ...s.miniInput, width: "100%" }} /></Field>
        <Field label="Target pace"><input value={cfg.pace || ""} placeholder="e.g. 5:30/km" onChange={e => upd({ pace: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Target HR"><input value={cfg.hr || ""} placeholder="e.g. 130–145 bpm" onChange={e => upd({ hr: e.target.value })} style={s.miniInput} /></Field>
      </div>
      <Field label="Coaching notes"><input value={cfg.notes || ""} placeholder="e.g. Keep conversational, nasal breathing" onChange={e => upd({ notes: e.target.value })} style={{ ...s.miniInput, width: "100%" }} /></Field>
      <div style={{ marginTop: 10 }}>
        <div style={s.dayLabelRow}>Log your result</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Field label="Actual time / dist" grow><input value={cfg.actual || ""} placeholder="e.g. 62 min / 11.2 km" onChange={e => upd({ actual: e.target.value })} style={{ ...s.miniInput, background: "#0F1418", width: "100%" }} /></Field>
          <Field label="Avg HR / pace"><input value={cfg.actualHR || ""} placeholder="e.g. 138 bpm / 5:33/km" onChange={e => upd({ actualHR: e.target.value })} style={{ ...s.miniInput, background: "#0F1418" }} /></Field>
        </div>
      </div>
    </div>
  );
}

// ── Cardio: Threshold / Tempo ─────────────────────────────────────────────────

function CardioThreshold({ cfg, upd, library }: { cfg: any; upd: (p: any) => void; library: LibraryEntry[] }) {
  const blocks = cfg.blocks || [
    { label: "Warm-up",   duration: "10 min", intensity: "Z1 / easy",      repeat: 1, result: "" },
    { label: "Main set",  duration: "20 min", intensity: "threshold / LT",  repeat: 2, rest: "2 min easy", result: "" },
    { label: "Cool-down", duration: "10 min", intensity: "Z1 / easy",       repeat: 1, result: "" },
  ];
  const updBlocks = (b: any[]) => upd({ blocks: b });
  const updBlock = (i: number, p: any) => updBlocks(blocks.map((b: any, j: number) => j === i ? { ...b, ...p } : b));

  return (
    <div style={{ marginTop: 12 }}>
      <Field label="Activity">
        <LibraryAutocomplete value={cfg.modality || "Run"} onChange={v => upd({ modality: v })}
          library={library} types={["cardio", "hyrox"]} />
      </Field>
      <div style={s.dayLabelRow}>Session blocks</div>
      {blocks.map((b: any, i: number) => (
        <div key={i} style={{ background: "#0F1418", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #2A343D" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <input value={b.label} onChange={e => updBlock(i, { label: e.target.value })} style={{ ...s.miniInput, fontWeight: 700, width: 100 }} />
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button style={s.iconBtn} onClick={() => updBlock(i, { repeat: Math.max(1, (b.repeat || 1) - 1) })}>-</button>
              <span style={{ fontSize: 12, color: "#8593A0", minWidth: 60, textAlign: "center" }}>{b.repeat || 1}× {b.duration || "-"}</span>
              <button style={s.iconBtn} onClick={() => updBlock(i, { repeat: (b.repeat || 1) + 1 })}>+</button>
            </div>
            {blocks.length > 1 && <button style={{ ...s.iconBtn, color: "#ff7d7d", marginLeft: "auto" }} onClick={() => updBlocks(blocks.filter((_: any, j: number) => j !== i))}>×</button>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Field label="Duration"><input value={b.duration} placeholder="e.g. 20 min" onChange={e => updBlock(i, { duration: e.target.value })} style={s.miniInput} /></Field>
            <Field label="Zone / Intensity" grow><input value={b.intensity} placeholder="e.g. threshold / Z4" onChange={e => updBlock(i, { intensity: e.target.value })} style={{ ...s.miniInput, width: "100%" }} /></Field>
            {(b.repeat || 1) > 1 && <Field label="Recovery"><input value={b.rest || ""} placeholder="e.g. 2 min easy" onChange={e => updBlock(i, { rest: e.target.value })} style={s.miniInput} /></Field>}
          </div>
          <div style={{ marginTop: 8 }}>
            <Field label="Result"><input value={b.result || ""} placeholder="e.g. avg 4:12/km, HR 168" onChange={e => updBlock(i, { result: e.target.value })} style={{ ...s.miniInput, width: "100%", background: "#0F1418" }} /></Field>
          </div>
        </div>
      ))}
      <button style={s.addSetBtn} onClick={() => updBlocks([...blocks, { label: "Block", duration: "", intensity: "", repeat: 1, rest: "", result: "" }])}>+ Block</button>
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
          <LibraryAutocomplete value={cfg.modality || "Run"} onChange={v => upd({ modality: v })}
            library={library} types={["cardio", "hyrox"]} />
        </Field>
        <Field label="Reps"><input inputMode="numeric" value={cfg.reps ?? 6} onChange={e => upd({ reps: e.target.value })} style={s.miniInput} /></Field>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Field label="Work duration"><input value={cfg.workDur || ""} placeholder="e.g. 3 min" onChange={e => upd({ workDur: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Work distance"><input value={cfg.workDist || ""} placeholder="e.g. 400m" onChange={e => upd({ workDist: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Rest"><input value={cfg.restDur || ""} placeholder="e.g. 90s / 2 min" onChange={e => upd({ restDur: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Rest type"><input value={cfg.restType || ""} placeholder="easy jog / walk" onChange={e => upd({ restType: e.target.value })} style={s.miniInput} /></Field>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Field label="Zone / Intensity" grow><input value={cfg.intensity || ""} placeholder="e.g. Z5 / VO2max / 95–100% HR" onChange={e => upd({ intensity: e.target.value })} style={{ ...s.miniInput, width: "100%" }} /></Field>
        <Field label="Target pace"><input value={cfg.pace || ""} placeholder="e.g. 3:50/km" onChange={e => upd({ pace: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Target HR"><input value={cfg.hr || ""} placeholder="e.g. 175+ bpm" onChange={e => upd({ hr: e.target.value })} style={s.miniInput} /></Field>
      </div>
      <div style={s.dayLabelRow}>Log each rep</div>
      {Array.from({ length: reps }, (_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ ...s.hyroxStepNum, flexShrink: 0 }}>{i + 1}</div>
          <input value={(cfg.results || [])[i] || ""} placeholder="Time / pace / HR"
            onChange={e => { const r = [...(cfg.results || Array(reps).fill(""))]; r[i] = e.target.value; upd({ results: r }); }}
            style={{ ...s.miniInput, flex: 1, background: "#0F1418" }} />
        </div>
      ))}
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
          <LibraryAutocomplete value={cfg.modality || "Bike Erg"} onChange={v => upd({ modality: v })}
            library={library} types={["cardio", "hyrox"]} />
        </Field>
        <Field label="Sets"><input inputMode="numeric" value={cfg.sets ?? 3} onChange={e => upd({ sets: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Reps / set"><input inputMode="numeric" value={cfg.reps ?? 6} onChange={e => upd({ reps: e.target.value })} style={s.miniInput} /></Field>
        <Field label="Rest between sets"><input value={cfg.restDur || "5 min"} onChange={e => upd({ restDur: e.target.value })} style={s.miniInput} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
        <div style={{ background: "#152530", border: "1px solid #4DC3FF44", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#4DC3FF", letterSpacing: 1, marginBottom: 8 }}>UNDER (below threshold)</div>
          <Field label="Duration"><input value={cfg.underDur || "3 min"} onChange={e => upd({ underDur: e.target.value })} style={s.miniInput} /></Field>
          <Field label="Zone / %"><input value={cfg.underInt || ""} placeholder="e.g. 93–95% FTP / Z3" onChange={e => upd({ underInt: e.target.value })} style={s.miniInput} /></Field>
          <Field label="Pace"><input value={cfg.underPace || ""} placeholder="e.g. 4:20/km" onChange={e => upd({ underPace: e.target.value })} style={s.miniInput} /></Field>
        </div>
        <div style={{ background: "#162743", border: "1px solid #3B8BEB44", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#3B8BEB", letterSpacing: 1, marginBottom: 8 }}>OVER (above threshold)</div>
          <Field label="Duration"><input value={cfg.overDur || "2 min"} onChange={e => upd({ overDur: e.target.value })} style={s.miniInput} /></Field>
          <Field label="Zone / %"><input value={cfg.overInt || ""} placeholder="e.g. 105–110% FTP / Z5" onChange={e => upd({ overInt: e.target.value })} style={s.miniInput} /></Field>
          <Field label="Pace"><input value={cfg.overPace || ""} placeholder="e.g. 3:50/km" onChange={e => upd({ overPace: e.target.value })} style={s.miniInput} /></Field>
        </div>
      </div>
      <div style={s.dayLabelRow}>Log each set</div>
      {Array.from({ length: sets }, (_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={s.hyroxStepNum}>{i + 1}</div>
          <input value={(cfg.results || [])[i] || ""} placeholder="e.g. avg 4:18 / 106% FTP"
            onChange={e => { const r = [...(cfg.results || Array(sets).fill(""))]; r[i] = e.target.value; upd({ results: r }); }}
            style={{ ...s.miniInput, flex: 1, background: "#0F1418" }} />
        </div>
      ))}
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

function HyroxTimer({ session, onClose, color }: { session: Session; onClose: () => void; color: string }) {
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
    ? (cfg.workDur ? numOr(cfg.workDur, 3) * 60 : 180)
    : htype === "interval" ? numOr(cfg.workSec, 120)
    : htype === "emom" ? 60
    : htype === "cycling" ? numOr(cfg.workSec, 40)
    : numOr(cfg.workSec, 40);

  const restSec = isCardioIntervals
    ? (cfg.restDur ? numOr(cfg.restDur, 1) * 60 : 90)
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
  useEffect(() => { _soundMuted = muted; }, [muted]);

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

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.timerBox} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, marginBottom: 2 }}>{session.name}</div>
          <button onClick={() => setMuted(m => !m)}
            style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: muted ? "#8593A0" : "#E8EDF1" }}>
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: "#4DC3FF", fontWeight: 600, marginBottom: 8, textAlign: "center" }}>{typeLabel[htype] || ""}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 21, fontWeight: 700, letterSpacing: 2, color: paused ? "#8593A0" : phaseColor }}>{phaseLabel}</span>
          <span style={{ fontSize: 12, color: "#8593A0" }}>
            {htype === "emom" ? `Min ${round}/${totalRounds}`
              : htype === "interval" ? `Set ${round}/${totalRounds}`
              : htype === "cycling" ? `Cycle ${cycle}/${cycles} · Round ${cyclingRoundNum}/${cyclingRoundsPerCycle}`
              : htype === "circuit" ? `Round ${round}/${totalRounds}`
              : `Cycle ${cycle}/${cycles} · Round ${round}/${totalRounds}`}
          </span>
        </div>
        {currentExercise && (
          <div style={{ fontSize: 13, fontWeight: 600, color: "#E8EDF1", marginBottom: 4, textAlign: "center", padding: "4px 8px", background: "#1F272E", borderRadius: 8 }}>
            {currentExercise}
          </div>
        )}
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 86, fontWeight: 700, lineHeight: 1, letterSpacing: 2, margin: "8px 0", textAlign: "center", color: paused ? "#8593A0" : phaseColor }}>
          {mm}:{ss}
        </div>
        {phase === "done" && (
          <div style={{ background: "#15302a", color: "#3FCF8E", borderRadius: 10, padding: "9px 14px", fontWeight: 700, fontSize: 15, marginBottom: 7, textAlign: "center" }}>
            Session complete! Great work. 🎉
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 14 }}>
          {phase === "idle" || phase === "done"
            ? <><button style={s.ghostBtn} onClick={onClose}>Close</button><button style={{ ...s.primaryBtn, background: color }} onClick={start}>{phase === "done" ? "Restart" : "Start"}</button></>
            : <><button style={s.dangerBtn} onClick={stop}>Stop</button><button style={s.ghostBtn} onClick={pause}>{paused ? "▶ Resume" : "⏸ Pause"}</button></>}
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  hyroxCfg: { border: "1px solid", borderRadius: 12, padding: 16, marginBottom: 16 },
  hyroxBanner: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "#1a2030", border: "1px solid", borderRadius: 10, padding: "10px 14px", marginBottom: 12,
  },
  timerLaunchBtn: { border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 14, color: "#0a1420", cursor: "pointer" },
  dayLabelRow: { fontSize: 10, fontWeight: 700, color: "#8593A0", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8, marginTop: 10 },
  hyroxTypeGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 4 },
  hyroxTypeCard: { display: "flex", flexDirection: "column", gap: 4, padding: "12px 10px", borderRadius: 10, border: "1px solid #2A343D", background: "#1F272E", cursor: "pointer", textAlign: "left", color: "#E8EDF1" },
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
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 },
  timerBox: { background: "#171D23", border: "1px solid #2A343D", borderRadius: 15, padding: 26, width: "100%", maxWidth: 380, boxShadow: "0 24px 60px rgba(0,0,0,.6)", textAlign: "center" },
  ghostBtn: { background: "#1F272E", color: "#E8EDF1", border: "1px solid #2A343D", borderRadius: 9, padding: "9px 13px", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  primaryBtn: { border: "none", borderRadius: 9, padding: "9px 15px", fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#0a1420" },
  dangerBtn: { background: "transparent", color: "#ff7d7d", border: "1px solid #ff7d7d44", borderRadius: 9, padding: "9px 13px", fontWeight: 600, fontSize: 13, cursor: "pointer" },
};
