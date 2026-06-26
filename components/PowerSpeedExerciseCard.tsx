"use client";

// ============================================================
// PowerSpeedExerciseCard — v2
// Per-rep logging with measurement type selector.
// Each set has an array of rep results. A "same for all reps"
// toggle collapses to one value per set (useful for RSI scores
// measured per set, not per rep).
// Library autocomplete shows Power/Speed exercises first.
// ============================================================

import { useState, useEffect, useRef } from "react";
import type { LibraryEntry } from "@/types";

// ── Types ──────────────────────────────────────────────────────────────────────

export type PSQuality =
  | "acceleration" | "max_velocity" | "plyometric"
  | "cod" | "deceleration" | "";

export type MeasurementType =
  | "time_s"      // sprint time (lower = better)
  | "height_cm"   // jump height
  | "distance_m"  // broad jump / sprint distance result
  | "rsi"         // reactive strength index
  | "power_w"    // power in watts
  | "none";       // just tick done

export interface PSSetLog {
  done: boolean;
  rep_results: string[];    // one per rep — length matches exercise.reps
  single_value: boolean;    // if true, only rep_results[0] is shown/used
  contact_time: string;     // ms (plyometric)
  rsi: string;              // auto-calculated or manual
  rpe: string;              // 1–10
  pain: string;             // 0–10
  set_notes: string;
}

export interface PSExercise {
  id: string;
  name: string;
  order: string;
  quality: PSQuality;
  measurement_type: MeasurementType;
  sets: number;
  reps: number;             // number of reps per set (integer for P/S)
  distance: string;         // prescribed distance e.g. "10m"
  rest: string;
  contacts: number | null;  // prescribed contacts (plyometric)
  surface: string;
  notes: string;            // coaching cues
  log: PSSetLog[];
  sort_order: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const QUALITY_META: Record<string, { label: string; color: string; icon: string; defaultMeasurement: MeasurementType }> = {
  acceleration:  { label: "Acceleration",  color: "#F59E0B", icon: "⚡", defaultMeasurement: "time_s" },
  max_velocity:  { label: "Max Velocity",  color: "#EF4444", icon: "🏃", defaultMeasurement: "time_s" },
  plyometric:    { label: "Plyometric",    color: "#8B5CF6", icon: "🦘", defaultMeasurement: "height_cm" },
  cod:           { label: "COD",           color: "#3B82F6", icon: "🔄", defaultMeasurement: "time_s" },
  deceleration:  { label: "Deceleration",  color: "#10B981", icon: "🛑", defaultMeasurement: "time_s" },
  "":            { label: "General",       color: "#6B7280", icon: "•",  defaultMeasurement: "none" },
};

const MEASUREMENT_META: Record<MeasurementType, { label: string; unit: string; placeholder: string }> = {
  time_s:    { label: "Time",     unit: "s",   placeholder: "" },
  height_cm: { label: "Height",   unit: "cm",  placeholder: "" },
  distance_m:{ label: "Distance", unit: "m",   placeholder: "" },
  rsi:       { label: "RSI",      unit: "",    placeholder: "" },
  power_w:   { label: "Power",    unit: "W",   placeholder: "" },
  none:      { label: "None",     unit: "",    placeholder: "—" },
};

const SURFACES = ["Grass", "Artificial Turf", "Track", "Gym Floor", "Sand", "Road", "Court"];
const DISTANCE_PRESETS = ["5m", "10m", "15m", "20m", "30m", "40m", "60m", "100m"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcRSI(heightCm: string, contactMs: string): string {
  const h = parseFloat(heightCm);
  const ct = parseFloat(contactMs);
  if (!h || !ct || ct === 0) return "";
  return ((h / 100) / (ct / 1000)).toFixed(2);
}

export function emptySetLog(reps: number): PSSetLog {
  return {
    done: false,
    rep_results: Array(Math.max(1, reps)).fill(""),
    single_value: false,
    contact_time: "",
    rsi: "",
    rpe: "",
    pain: "",
    set_notes: "",
  };
}

export function buildLog(sets: number, reps: number): PSSetLog[] {
  return Array.from({ length: sets }, () => emptySetLog(reps));
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  exercise: PSExercise;
  onChange: (updated: PSExercise) => void;
  onDelete: () => void;
  library?: LibraryEntry[];
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PowerSpeedExerciseCard({ exercise, onChange, onDelete, library = [] }: Props) {
  const [showCues, setShowCues] = useState(!!exercise.notes);
  const [showLog, setShowLog] = useState(false);
  const [nameQuery, setNameQuery] = useState(exercise.name);
  const [showDropdown, setShowDropdown] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Local state prevents dropdown/log flickering on parent re-renders
  const validMeasureTypes: MeasurementType[] = ["time_s","height_cm","distance_m","rsi","power_w","none"];
  const initMeasure: MeasurementType = validMeasureTypes.includes(exercise.measurement_type as any)
    ? exercise.measurement_type as MeasurementType
    : "time_s";
  const [localMeasure, setLocalMeasure] = useState<MeasurementType>(initMeasure);
  const [localSets, setLocalSets] = useState(exercise.sets || 3);
  const [localReps, setLocalReps] = useState(exercise.reps || 4);

  // Build log from exercise or create fresh
  const initLog = (): PSSetLog[] => {
    const sets = exercise.sets || 3;
    const reps = exercise.reps || 4;
    if (Array.isArray(exercise.log) && exercise.log.length > 0 && 'rep_results' in exercise.log[0]) {
      // Ensure rep_results length matches reps
      return exercise.log.map(s => ({
        ...s,
        rep_results: Array.from({ length: reps }, (_, i) => (s.rep_results ?? [])[i] ?? ""),
      }));
    }
    return buildLog(sets, reps);
  };
  const [localLog, setLocalLog] = useState<PSSetLog[]>(initLog);

  const qMeta = QUALITY_META[exercise.quality] ?? QUALITY_META[""];
  const mMeta = MEASUREMENT_META[localMeasure] ?? MEASUREMENT_META.none;
  const isPlyo = exercise.quality === "plyometric";
  const doneSets = localLog.filter(s => s.done).length;

  // Library autocomplete — Power/Speed exercises first
  const libraryMatches = nameQuery.trim().length > 0
    ? library
        .filter(e => e.name.toLowerCase().includes(nameQuery.toLowerCase()))
        .sort((a, b) => {
          const aPS = (a.types ?? []).includes("Power/Speed");
          const bPS = (b.types ?? []).includes("Power/Speed");
          if (aPS && !bPS) return -1;
          if (!aPS && bPS) return 1;
          return 0;
        })
        .slice(0, 8)
    : [];

  function update(fields: Partial<PSExercise>) {
    const updated = { ...exercise, ...fields };

    // Resize log if sets or reps changed
    if (fields.sets !== undefined || fields.reps !== undefined) {
      const newSets = fields.sets ?? localSets;
      const newReps = fields.reps ?? localReps;
      const log = [...(updated.log ?? [])];
      while (log.length < newSets) log.push(emptySetLog(newReps));
      const newLog = log.slice(0, newSets).map(s => ({
        ...s,
        rep_results: Array.from({ length: newReps }, (_, i) => (s.rep_results ?? [])[i] ?? ""),
      }));
      updated.log = newLog;
      setLocalLog(newLog);
    }

    // Auto-set measurement type when quality changes
    if (fields.quality !== undefined) {
      const newM = (QUALITY_META[fields.quality]?.defaultMeasurement ?? "time_s") as MeasurementType; updated.measurement_type = newM; setLocalMeasure(newM);
    }

    onChange(updated);
  }

  function updateSet(si: number, patch: Partial<PSSetLog>) {
    const newLog = localLog.map((s, idx) => {
      if (idx !== si) return s;
      const updated = { ...s, ...patch };
      // Auto-calc RSI for plyometric
      if (isPlyo && (patch.contact_time !== undefined || patch.rep_results !== undefined)) {
        const firstResult = updated.rep_results[0] ?? "";
        const rsi = calcRSI(firstResult, updated.contact_time);
        if (rsi) updated.rsi = rsi;
      }
      return updated;
    });
    setLocalLog(newLog);
    onChange({ ...exercise, sets: localSets, reps: localReps, measurement_type: localMeasure, log: newLog });
  }

  function updateRep(si: number, ri: number, value: string) {
    const newLog2 = localLog.map((s, idx) => {
      if (idx !== si) return s;
      const rep_results = s.rep_results.map((r, i) => i === ri ? value : r);
      const updated = { ...s, rep_results };
      // Mark set done if any rep has a result
      updated.done = rep_results.some(r => r.trim().length > 0);
      // Auto-calc RSI from first result
      if (isPlyo && ri === 0) {
        const rsi = calcRSI(value, s.contact_time);
        if (rsi) updated.rsi = rsi;
      }
      return updated;
    });
    setLocalLog(newLog2);
    onChange({ ...exercise, sets: localSets, reps: localReps, measurement_type: localMeasure, log: newLog2 });
  }

  function selectLibraryEntry(entry: LibraryEntry) {
    setNameQuery(entry.name);
    setShowDropdown(false);
    update({ name: entry.name });
  }

  return (
    <div style={card.wrap}>
      {/* ── Header ── */}
      <div style={card.header}>
        {/* Quality selector */}
        <select
          value={exercise.quality}
          onChange={e => update({ quality: e.target.value as PSQuality })}
          style={{ ...card.qualityChip, background: qMeta.color + "22", color: qMeta.color, border: `1px solid ${qMeta.color}55` }}
        >
          {Object.entries(QUALITY_META).filter(([k]) => k !== "").map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
          <option value="">• General</option>
        </select>

        {/* Order */}
        <input
          value={exercise.order}
          onChange={e => update({ order: e.target.value })}
          placeholder="#"
          title="1, 1A/1B for superset, Complex A for French Contrast"
          style={card.orderInput}
        />

        {/* Name with autocomplete */}
        <div style={{ flex: 1, position: "relative" as const }}>
          <input
            ref={nameRef}
            value={nameQuery}
            onChange={e => { setNameQuery(e.target.value); update({ name: e.target.value }); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder="Exercise name…"
            style={card.nameInput}
          />
          {showDropdown && libraryMatches.length > 0 && (
            <div style={card.dropdown}>
              {libraryMatches.map(e => (
                <button
                  key={e.id}
                  style={card.dropdownItem}
                  onMouseDown={ev => { ev.preventDefault(); selectLibraryEntry(e); }}
                >
                  <span>{e.name}</span>
                  {(e.types ?? []).includes("Power/Speed") && (
                    <span style={{ fontSize: 10, color: "#A855F7", marginLeft: 6 }}>P/S</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Done badge */}
        {localLog.length > 0 && (
          <span style={{ ...card.badge, background: doneSets === localLog.length ? "#10B98122" : "var(--ink)", color: doneSets === localLog.length ? "#10B981" : "var(--mute)" }}>
            {doneSets}/{localLog.length}
          </span>
        )}

        {/* Measurement type — prominent in header so it's always visible */}
        <select
          value={localMeasure}
          onChange={e => { setLocalMeasure(e.target.value as MeasurementType); update({ measurement_type: e.target.value as MeasurementType }); }}
          style={card.measureSelect}
          title="What are you measuring per rep?"
        >
          {Object.entries(MEASUREMENT_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}{v.unit ? ` (${v.unit})` : ""}</option>
          ))}
        </select>

        <button style={card.deleteBtn} onClick={onDelete}>×</button>
      </div>

      {/* ── Prescribed fields ── */}
      <div style={card.fields}>
        <Field label="Sets">
          <input type="number" value={localSets} min={1}
            onChange={e => update({ sets: parseInt(e.target.value) || 1 })}
            style={card.miniInput} />
        </Field>
        <Field label="Reps">
          <input type="number" value={localReps} min={1}
            onChange={e => update({ reps: parseInt(e.target.value) || 1 })}
            style={card.miniInput} />
        </Field>
        <Field label="Distance">
          <div style={{ display: "flex", gap: 2 }}>
            <input value={exercise.distance} onChange={e => update({ distance: e.target.value })}
              placeholder="10m" style={{ ...card.miniInput, flex: 1 }} />
            <select value="" onChange={e => update({ distance: e.target.value })}
              style={{ ...card.miniInput, width: 28, padding: "4px 2px" }}>
              <option value="">↓</option>
              {DISTANCE_PRESETS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </Field>
        <Field label="Rest">
          <input value={exercise.rest} onChange={e => update({ rest: e.target.value })}
            placeholder="3min" style={card.miniInput} />
        </Field>
        {isPlyo && (
          <Field label="Contacts">
            <input type="number" value={exercise.contacts ?? ""}
              onChange={e => update({ contacts: parseInt(e.target.value) || null })}
              placeholder="20" style={card.miniInput} />
          </Field>
        )}
        <Field label="Surface">
          <select value={exercise.surface} onChange={e => update({ surface: e.target.value })}
            style={card.miniInput}>
            <option value="">—</option>
            {SURFACES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

      </div>

      {/* ── Coaching cues ── */}
      <button style={card.toggleBtn} onClick={() => setShowCues(v => !v)}>
        {showCues ? "▾ Hide cues" : "▸ Coaching cues"}
      </button>
      {showCues && (
        <textarea value={exercise.notes} onChange={e => update({ notes: e.target.value })}
          placeholder="Technical focus, progressions, constraints…" rows={2} style={card.cuesInput} />
      )}

      {/* ── Live log ── */}
      <button
        style={{ ...card.toggleBtn, color: doneSets > 0 ? "#10B981" : "var(--mute)" }}
        onClick={() => setShowLog(v => !v)}
      >
        {showLog ? "▾ Hide log" : `▸ Log sets${doneSets > 0 ? ` (${doneSets}/${localLog.length})` : ""}`}
      </button>

      {showLog && localMeasure !== "none" && (
        <div style={card.logWrap}>
          {localLog.map((set, si) => (
            <div key={si} style={{ ...card.setBlock, ...(set.done ? card.setBlockDone : {}) }}>
              {/* Set header */}
              <div style={card.setHeader}>
                <span style={card.setLabel}>Set {si + 1}</span>

                {/* Single value toggle */}
                <label style={card.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={set.single_value}
                    onChange={e => updateSet(si, { single_value: e.target.checked })}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span style={{ fontSize: 11, color: "var(--mute)" }}>One {mMeta.label.toLowerCase()} for all reps</span>
                </label>

                {/* RPE + Pain */}
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={card.metaLabel}>RPE</span>
                  <input value={set.rpe} onChange={e => updateSet(si, { rpe: e.target.value })}
                    placeholder="—" inputMode="numeric" style={card.metaInput} />
                  <span style={card.metaLabel}>Pain</span>
                  <input value={set.pain} onChange={e => updateSet(si, { pain: e.target.value })}
                    placeholder="—" inputMode="numeric" style={card.metaInput} />
                  <button
                    style={{ ...card.doneBtn, ...(set.done ? card.doneBtnOn : {}) }}
                    onClick={() => updateSet(si, { done: !set.done })}
                  >✓</button>
                </div>
              </div>

              {/* Rep results */}
              {set.single_value ? (
                /* Single value for all reps */
                <div style={card.singleValueRow}>
                  <span style={card.repLabel}>All reps</span>
                  <input
                    value={set.rep_results[0] ?? ""}
                    onChange={e => updateSet(si, { rep_results: Array(exercise.reps).fill(e.target.value), done: e.target.value.trim().length > 0 })}
                    placeholder={mMeta.placeholder}
                    inputMode="decimal"
                    style={card.repInput}
                  />
                  <span style={card.unitLabel}>{mMeta.unit}</span>
                </div>
              ) : (
                /* Per-rep inputs */
                <div style={card.repGrid}>
                  {set.rep_results.map((result, ri) => (
                    <div key={ri} style={card.repRow}>
                      <span style={card.repLabel}>R{ri + 1}</span>
                      <input
                        value={result}
                        onChange={e => updateRep(si, ri, e.target.value)}
                        placeholder={mMeta.placeholder}
                        inputMode="decimal"
                        style={card.repInput}
                      />
                      <span style={card.unitLabel}>{mMeta.unit}</span>
                    </div>
                  ))}
                </div>
              )}



              {/* Set notes */}
              <input value={set.set_notes}
                onChange={e => updateSet(si, { set_notes: e.target.value })}
                placeholder="Set notes…"
                style={card.setNotesInput} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 60 }}>
      <div style={{ fontSize: 10, color: "var(--mute)", marginBottom: 3, textTransform: "uppercase" as const }}>{label}</div>
      {children}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const card: Record<string, React.CSSProperties> = {
  wrap: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 },
  header: { display: "flex", alignItems: "center", gap: 6 },
  qualityChip: { borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  orderInput: { width: 32, textAlign: "center" as const, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, padding: "6px 2px", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  nameInput: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 14, fontWeight: 700 },
  dropdown: { position: "absolute" as const, top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30, background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 10, padding: 4, maxHeight: 200, overflowY: "auto" as const, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" },
  dropdownItem: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "7px 10px", border: "none", background: "transparent", color: "var(--text)", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" as const, borderRadius: 6 },
  badge: { fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "2px 7px", flexShrink: 0 },
  deleteBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer", padding: 4, flexShrink: 0 },
  measureSelect: { background: "var(--ink)", border: "1px solid var(--accent)44", color: "var(--accent)", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  fields: { display: "flex", gap: 8, flexWrap: "wrap" as const },
  miniInput: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "5px 7px", fontSize: 13 },
  toggleBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "2px 0", textAlign: "left" as const },
  cuesInput: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 10px", fontSize: 12, fontStyle: "italic" as const, resize: "vertical" as const, fontFamily: "inherit" },
  logWrap: { display: "flex", flexDirection: "column" as const, gap: 8 },
  setBlock: { background: "var(--ink)", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column" as const, gap: 6 },
  setBlockDone: { boxShadow: "inset 0 0 0 1px #10B98144" },
  setHeader: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const },
  setLabel: { fontSize: 12, fontWeight: 700, color: "var(--mute)", flexShrink: 0 },
  toggleLabel: { display: "flex", alignItems: "center", gap: 4, cursor: "pointer", flex: 1 },
  metaLabel: { fontSize: 10, color: "var(--mute)", fontWeight: 600, textTransform: "uppercase" as const, flexShrink: 0 },
  metaInput: { width: 44, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 5, padding: "4px 6px", fontSize: 12, textAlign: "center" as const },
  doneBtn: { width: 26, height: 26, borderRadius: 5, border: "1px solid var(--line)", background: "transparent", color: "var(--mute)", cursor: "pointer", flexShrink: 0, fontSize: 12 },
  doneBtnOn: { background: "#10B98122", color: "#10B981", borderColor: "#10B981" },
  repGrid: { display: "flex", flexWrap: "wrap" as const, gap: 6 },
  repRow: { display: "flex", alignItems: "center", gap: 4 },
  singleValueRow: { display: "flex", alignItems: "center", gap: 6 },
  repLabel: { fontSize: 10, color: "var(--mute)", fontWeight: 700, width: 22, flexShrink: 0 },
  repInput: { width: 64, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 5, padding: "5px 7px", fontSize: 13, fontWeight: 700 },
  unitLabel: { fontSize: 10, color: "var(--mute)", flexShrink: 0 },
  plyoRow: { display: "flex", alignItems: "center", gap: 6 },
  setNotesInput: { width: "100%", background: "transparent", border: "none", borderTop: "1px solid var(--line)", color: "var(--mute)", padding: "6px 0 0", fontSize: 11, fontStyle: "italic" as const },
};
