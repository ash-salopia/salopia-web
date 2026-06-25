"use client";

// ============================================================
// PowerSpeedExerciseCard
// Used in Power/Speed sessions on the coach-side session editor.
// Replaces ExerciseCard for session.type === "power_speed".
//
// Fields per exercise:
//   Prescribed: quality, name, sets, reps, distance, rest,
//               contacts, surface, notes (coaching cues)
//   Logged per set: result (time or height), contact_time,
//                   rsi (auto-calc), rpe, pain, notes, done
// ============================================================

import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────

export type PSQuality =
  | "acceleration"
  | "max_velocity"
  | "plyometric"
  | "cod"
  | "deceleration"
  | "";

export interface PSSetLog {
  done: boolean;
  result: string;        // sprint time (s) or jump height (cm) or distance (m)
  contact_time: string;  // ms — for RSI calc
  rsi: string;           // reactive strength index (auto or manual)
  rpe: string;           // 1–10
  pain: string;          // 0–10
  notes: string;
}

export interface PSExercise {
  id: string;
  name: string;
  order: string;
  quality: PSQuality;
  sets: number;
  reps: string;
  distance: string;
  rest: string;
  contacts: number | null;
  surface: string;
  notes: string;          // coaching cues
  log: PSSetLog[];
  sort_order: number;
}

// ── Constants ─────────────────────────────────────────────────

const QUALITY_META: Record<PSQuality, { label: string; color: string; icon: string }> = {
  acceleration:  { label: "Acceleration",  color: "#F59E0B", icon: "⚡" },
  max_velocity:  { label: "Max Velocity",  color: "#EF4444", icon: "🏃" },
  plyometric:    { label: "Plyometric",    color: "#8B5CF6", icon: "🦘" },
  cod:           { label: "COD",           color: "#3B82F6", icon: "🔄" },
  deceleration:  { label: "Deceleration",  color: "#10B981", icon: "🛑" },
  "":            { label: "General",       color: "#6B7280", icon: "🏋" },
};

const SURFACES = ["Grass", "Artificial Turf", "Track", "Gym Floor", "Sand", "Road", "Court"];
const DISTANCE_PRESETS = ["5m", "10m", "15m", "20m", "30m", "40m", "60m", "100m"];

// ── Helpers ───────────────────────────────────────────────────

function calcRSI(jumpHeightCm: string, contactTimeMs: string): string {
  const h = parseFloat(jumpHeightCm);
  const ct = parseFloat(contactTimeMs);
  if (!h || !ct || ct === 0) return "";
  // RSI = jump height (m) / contact time (s)
  const rsi = (h / 100) / (ct / 1000);
  return rsi.toFixed(2);
}

function emptyLog(sets: number): PSSetLog[] {
  return Array.from({ length: sets }, () => ({
    done: false, result: "", contact_time: "", rsi: "", rpe: "", pain: "", notes: "",
  }));
}

// ── Props ─────────────────────────────────────────────────────

interface Props {
  exercise: PSExercise;
  onChange: (updated: PSExercise) => void;
  onDelete: () => void;
  isPlyo?: boolean; // true = show contact_time + RSI in log
}

// ── Component ─────────────────────────────────────────────────

export default function PowerSpeedExerciseCard({ exercise, onChange, onDelete }: Props) {
  const [showCues, setShowCues] = useState(!!exercise.notes);
  const [showLog, setShowLog] = useState(false);

  const isPlyoQuality = exercise.quality === "plyometric";
  const isSprintQuality = exercise.quality === "acceleration" || exercise.quality === "max_velocity";
  const resultLabel = isPlyoQuality ? "Height (cm)" : isSprintQuality ? "Time (s)" : "Result";

  function update(fields: Partial<PSExercise>) {
    const updated = { ...exercise, ...fields };
    // Resize log if sets changed
    if (fields.sets !== undefined && fields.sets !== exercise.sets) {
      const newSets = Math.max(1, fields.sets);
      const log = [...(updated.log ?? [])];
      while (log.length < newSets) log.push({ done: false, result: "", contact_time: "", rsi: "", rpe: "", pain: "", notes: "" });
      updated.log = log.slice(0, newSets);
    }
    onChange(updated);
  }

  function updateSet(i: number, patch: Partial<PSSetLog>) {
    const log = exercise.log.map((s, idx) => {
      if (idx !== i) return s;
      const updated = { ...s, ...patch };
      // Auto-calculate RSI when height + contact_time are both set (plyometric)
      if (isPlyoQuality && (patch.result !== undefined || patch.contact_time !== undefined)) {
        const rsi = calcRSI(
          patch.result ?? updated.result,
          patch.contact_time ?? updated.contact_time
        );
        if (rsi) updated.rsi = rsi;
      }
      // Mark done when result logged
      if (patch.result !== undefined) {
        updated.done = patch.result.trim().length > 0;
      }
      return updated;
    });
    onChange({ ...exercise, log });
  }

  const qMeta = QUALITY_META[exercise.quality] ?? QUALITY_META[""];
  const doneSets = exercise.log.filter(s => s.done).length;

  return (
    <div style={card.wrap}>
      {/* ── Header ── */}
      <div style={card.header}>
        {/* Quality chip */}
        <select
          value={exercise.quality}
          onChange={e => update({ quality: e.target.value as PSQuality })}
          style={{ ...card.qualityChip, background: qMeta.color + "22", color: qMeta.color, border: `1px solid ${qMeta.color}44` }}
        >
          {Object.entries(QUALITY_META).filter(([k]) => k !== "").map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
          <option value="">⚪ General</option>
        </select>

        {/* Order */}
        <input
          value={exercise.order}
          onChange={e => update({ order: e.target.value })}
          placeholder="#"
          title="e.g. 1, 1A/1B for superset, Complex A for French Contrast"
          style={card.orderInput}
        />

        {/* Name */}
        <input
          value={exercise.name}
          onChange={e => update({ name: e.target.value })}
          placeholder="Exercise name…"
          style={card.nameInput}
        />

        {/* Done badge */}
        {exercise.log.length > 0 && (
          <span style={{ ...card.doneBadge, background: doneSets === exercise.log.length ? "#10B98122" : "var(--ink)", color: doneSets === exercise.log.length ? "#10B981" : "var(--mute)" }}>
            {doneSets}/{exercise.log.length}
          </span>
        )}

        <button style={card.deleteBtn} onClick={onDelete}>×</button>
      </div>

      {/* ── Prescribed fields ── */}
      <div style={card.fields}>
        <Field label="Sets">
          <input type="number" value={exercise.sets} min={1}
            onChange={e => update({ sets: parseInt(e.target.value) || 1 })}
            style={card.miniInput} />
        </Field>
        <Field label="Reps">
          <input value={exercise.reps} onChange={e => update({ reps: e.target.value })}
            placeholder="6" style={card.miniInput} />
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
        {isPlyoQuality && (
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

      {/* ── Coaching cues toggle ── */}
      <button style={card.toggleBtn} onClick={() => setShowCues(v => !v)}>
        {showCues ? "▾ Hide cues" : "▸ Coaching cues"}
      </button>
      {showCues && (
        <textarea
          value={exercise.notes}
          onChange={e => update({ notes: e.target.value })}
          placeholder="Technical focus, progressions, constraints…"
          rows={2}
          style={card.cuesInput}
        />
      )}

      {/* ── Live log toggle ── */}
      <button
        style={{ ...card.toggleBtn, color: doneSets > 0 ? "#10B981" : "var(--mute)" }}
        onClick={() => setShowLog(v => !v)}
      >
        {showLog ? "▾ Hide log" : `▸ Log sets${doneSets > 0 ? ` (${doneSets}/${exercise.log.length} done)` : ""}`}
      </button>

      {showLog && (
        <div style={card.logSection}>
          {/* Column headers */}
          <div style={card.logHeaderRow}>
            <span style={card.logHeaderCell}>#</span>
            <span style={{ ...card.logHeaderCell, flex: 2 }}>{resultLabel}</span>
            {isPlyoQuality && <span style={{ ...card.logHeaderCell, flex: 2 }}>CT (ms)</span>}
            {isPlyoQuality && <span style={{ ...card.logHeaderCell, flex: 1.5 }}>RSI</span>}
            <span style={card.logHeaderCell}>RPE</span>
            <span style={card.logHeaderCell}>Pain</span>
            <span style={{ ...card.logHeaderCell, flex: 2 }}>Notes</span>
            <span style={card.logHeaderCell}>✓</span>
          </div>

          {exercise.log.map((set, i) => (
            <div key={i} style={{ ...card.logRow, ...(set.done ? card.logRowDone : {}) }}>
              <span style={card.setNum}>{i + 1}</span>

              {/* Result: time or height */}
              <input
                value={set.result}
                onChange={e => updateSet(i, { result: e.target.value })}
                placeholder={isPlyoQuality ? "cm" : isSprintQuality ? "s" : "—"}
                inputMode="decimal"
                style={{ ...card.logInput, flex: 2 }}
              />

              {/* Contact time (plyometric only) */}
              {isPlyoQuality && (
                <input
                  value={set.contact_time}
                  onChange={e => updateSet(i, { contact_time: e.target.value })}
                  placeholder="ms"
                  inputMode="decimal"
                  style={{ ...card.logInput, flex: 2 }}
                />
              )}

              {/* RSI (auto or manual) */}
              {isPlyoQuality && (
                <input
                  value={set.rsi}
                  onChange={e => updateSet(i, { rsi: e.target.value })}
                  placeholder="auto"
                  inputMode="decimal"
                  style={{ ...card.logInput, flex: 1.5, color: "var(--accent)" }}
                />
              )}

              {/* RPE */}
              <input
                value={set.rpe}
                onChange={e => updateSet(i, { rpe: e.target.value })}
                placeholder="—"
                inputMode="numeric"
                style={{ ...card.logInput }}
              />

              {/* Pain */}
              <input
                value={set.pain}
                onChange={e => updateSet(i, { pain: e.target.value })}
                placeholder="—"
                inputMode="numeric"
                style={{ ...card.logInput }}
              />

              {/* Notes */}
              <input
                value={set.notes}
                onChange={e => updateSet(i, { notes: e.target.value })}
                placeholder="—"
                style={{ ...card.logInput, flex: 2 }}
              />

              {/* Done */}
              <button
                style={{ ...card.doneBtn, ...(set.done ? card.doneBtnOn : {}) }}
                onClick={() => updateSet(i, { done: !set.done })}
              >✓</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 60 }}>
      <div style={{ fontSize: 10, color: "var(--mute)", marginBottom: 3, textTransform: "uppercase" as const }}>{label}</div>
      {children}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const card: Record<string, React.CSSProperties> = {
  wrap: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 },
  header: { display: "flex", alignItems: "center", gap: 6 },
  qualityChip: { borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  orderInput: { width: 32, textAlign: "center" as const, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, padding: "6px 2px", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  nameInput: { flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 14, fontWeight: 700 },
  doneBadge: { fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "2px 7px", flexShrink: 0 },
  deleteBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer", padding: 4, flexShrink: 0 },
  fields: { display: "flex", gap: 8, flexWrap: "wrap" as const },
  miniInput: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "5px 7px", fontSize: 13 },
  toggleBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "2px 0", textAlign: "left" as const },
  cuesInput: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 10px", fontSize: 12, fontStyle: "italic" as const, resize: "vertical" as const, fontFamily: "inherit" },
  logSection: { display: "flex", flexDirection: "column" as const, gap: 4, background: "var(--ink)", borderRadius: 8, padding: 8 },
  logHeaderRow: { display: "flex", gap: 4, alignItems: "center", paddingBottom: 4, borderBottom: "1px solid var(--line)", marginBottom: 2 },
  logHeaderCell: { flex: 1, fontSize: 9, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, textAlign: "center" as const },
  logRow: { display: "flex", gap: 4, alignItems: "center" },
  logRowDone: { opacity: 0.7 },
  setNum: { width: 18, fontSize: 11, fontWeight: 700, color: "var(--mute)", textAlign: "center" as const, flexShrink: 0 },
  logInput: { flex: 1, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 5, padding: "5px 6px", fontSize: 12, minWidth: 0 },
  doneBtn: { width: 26, height: 26, borderRadius: 5, border: "1px solid var(--line)", background: "transparent", color: "var(--mute)", cursor: "pointer", flexShrink: 0, fontSize: 12 },
  doneBtnOn: { background: "#10B98122", color: "#10B981", borderColor: "#10B981" },
};
