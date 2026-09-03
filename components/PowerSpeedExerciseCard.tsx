"use client";

// ============================================================
// PowerSpeedExerciseCard — v3 (multi-metric)
// A coach picks which metrics the exercise tracks (0096):
//   • set metrics  (Load, Reps) — one value per set
//   • rep metrics  (Time, Distance, Height, Velocity, Power, RSI, GCT)
//     — one value per rep
// e.g. a sled sprint = Load + Time + Distance; a med-ball throw =
// Load + Reps + Distance. "Completion only" hides all boxes.
// ============================================================

import { useState, useRef } from "react";
import type { LibraryEntry } from "@/types";
import { saveLibraryEntry } from "@/lib/data/library";
import LibraryEntryForm from "@/components/LibraryEntryForm";
import {
  PS_METRIC_META, PS_METRIC_ORDER, QUALITY_META,
  buildPSLog, emptyPSSetLog, normalizePSLog,
  type PSMetricKey, type PSQuality, type PSExercise, type PSSetLog,
} from "@/lib/ps-metrics";

export type { PSExercise, PSSetLog } from "@/lib/ps-metrics";

const SURFACES = ["Grass", "Artificial Turf", "Track", "Gym Floor", "Sand", "Road", "Court"];
const DISTANCE_PRESETS = ["5m", "10m", "15m", "20m", "30m", "40m", "60m", "100m"];
const VALID_QUALITIES: PSQuality[] = ["acceleration", "max_velocity", "plyometric", "cod", "deceleration", ""];

function calcRSI(heightCm: string, contactMs: string): string {
  const h = parseFloat(heightCm);
  const ct = parseFloat(contactMs);
  if (!h || !ct || ct === 0) return "";
  return ((h / 100) / (ct / 1000)).toFixed(2);
}

interface Props {
  exercise: PSExercise;
  onChange: (updated: PSExercise) => void;
  onDelete: () => void;
  library?: LibraryEntry[];
}

export default function PowerSpeedExerciseCard({ exercise, onChange, onDelete, library = [] }: Props) {
  const [showCues, setShowCues] = useState(!!exercise.notes);
  const [showLog, setShowLog] = useState(false);
  const [nameQuery, setNameQuery] = useState(exercise.name);
  const [showDropdown, setShowDropdown] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const [localSets, setLocalSets] = useState(exercise.sets || 3);
  const [localReps, setLocalReps] = useState(exercise.reps || 4);
  const [localLog, setLocalLog] = useState<PSSetLog[]>(
    () => normalizePSLog(exercise.log, exercise.reps || 4, exercise.tracked_metrics),
  );
  const [showMetricPicker, setShowMetricPicker] = useState(false);

  const qMeta = QUALITY_META[exercise.quality] ?? QUALITY_META[""];
  const completionOnly = !!exercise.completion_only;
  const tracked = exercise.tracked_metrics ?? [];
  const setMetrics = tracked.filter((k) => PS_METRIC_META[k].scope === "set");
  const repMetrics = tracked.filter((k) => PS_METRIC_META[k].scope === "rep");
  const isPlyo = exercise.quality === "plyometric";
  const doneSets = localLog.filter((s) => s.done).length;

  // ── Library autocomplete ──────────────────────────────────────────────────
  const trimmedName = nameQuery.trim();
  const libraryMatches = trimmedName.length > 0
    ? library
        .filter((e) => e.name.toLowerCase().includes(nameQuery.toLowerCase()))
        .sort((a, b) => {
          const aPS = (a.types ?? []).includes("Power/Speed");
          const bPS = (b.types ?? []).includes("Power/Speed");
          return aPS === bPS ? 0 : aPS ? -1 : 1;
        })
        .slice(0, 8)
    : [];
  const hasExactMatch = library.some((e) => e.name.toLowerCase() === trimmedName.toLowerCase());

  // ── Mutations ─────────────────────────────────────────────────────────────
  function commit(fields: Partial<PSExercise>, log: PSSetLog[]) {
    onChange({ ...exercise, sets: localSets, reps: localReps, ...fields, log });
  }

  function update(fields: Partial<PSExercise>) {
    const newSets = fields.sets ?? localSets;
    const newReps = fields.reps ?? localReps;
    if (fields.sets !== undefined) setLocalSets(newSets);
    if (fields.reps !== undefined) setLocalReps(newReps);

    // Resize the log grid from localLog (parent state can be stale)
    const log = [...localLog];
    while (log.length < newSets) log.push(emptyPSSetLog(newReps));
    const newLog = log.slice(0, Math.max(1, newSets)).map((s) => {
      const rm = s.rep_metrics.slice(0, Math.max(1, newReps)).map((r) => ({ ...r }));
      while (rm.length < Math.max(1, newReps)) rm.push({});
      return { ...s, rep_metrics: rm };
    });
    setLocalLog(newLog);
    onChange({ ...exercise, ...fields, sets: newSets, reps: newReps, log: newLog });
  }

  function toggleMetric(key: PSMetricKey) {
    const next = tracked.includes(key) ? tracked.filter((k) => k !== key) : [...tracked, key];
    // keep in canonical order
    update({ tracked_metrics: PS_METRIC_ORDER.filter((k) => next.includes(k)) });
  }

  function setDone(si: number, done: boolean) {
    const newLog = localLog.map((s, i) => (i === si ? { ...s, done } : s));
    setLocalLog(newLog);
    commit({}, newLog);
  }

  function updateSetField(si: number, patch: Partial<PSSetLog>) {
    const newLog = localLog.map((s, i) => (i === si ? { ...s, ...patch } : s));
    setLocalLog(newLog);
    commit({}, newLog);
  }

  function updateSetMetric(si: number, key: PSMetricKey, value: string) {
    const newLog = localLog.map((s, i) => {
      if (i !== si) return s;
      const set_metrics = { ...s.set_metrics, [key]: value };
      const anyVal = anyLogged({ ...s, set_metrics });
      return { ...s, set_metrics, done: anyVal || s.done };
    });
    setLocalLog(newLog);
    commit({}, newLog);
  }

  function updateRepMetric(si: number, ri: number, key: PSMetricKey, value: string) {
    const newLog = localLog.map((s, i) => {
      if (i !== si) return s;
      const rep_metrics = s.rep_metrics.map((r, idx) => (idx === ri ? { ...r, [key]: value } : r));
      // auto-RSI when height + contact time are both present and RSI is tracked
      if (tracked.includes("rsi") && (key === "height" || key === "contact_time")) {
        const rep = rep_metrics[ri];
        const rsi = calcRSI(rep.height ?? "", rep.contact_time ?? "");
        if (rsi) rep_metrics[ri] = { ...rep, rsi };
      }
      const updated = { ...s, rep_metrics };
      return { ...updated, done: anyLogged(updated) || s.done };
    });
    setLocalLog(newLog);
    commit({}, newLog);
  }

  function handleAddToLibrary(entry: Partial<LibraryEntry> & { name: string }) {
    setAddError("");
    saveLibraryEntry(entry)
      .then((saved) => { setAddOpen(false); selectLibraryEntry(saved); })
      .catch((e) => setAddError(e instanceof Error ? e.message : "Could not save to library"));
  }

  function selectLibraryEntry(entry: LibraryEntry) {
    setNameQuery(entry.name);
    setShowDropdown(false);
    const patch: Partial<PSExercise> = { name: entry.name };
    const q = entry.default_ps_quality;
    if (q != null && VALID_QUALITIES.includes(q as PSQuality)) patch.quality = q as PSQuality;
    const metrics = Array.isArray(entry.default_ps_metrics)
      ? entry.default_ps_metrics.filter((k): k is PSMetricKey => k in PS_METRIC_META)
      : [];
    if (metrics.length) patch.tracked_metrics = PS_METRIC_ORDER.filter((k) => metrics.includes(k));
    else if (entry.default_measurement_type) {
      const legacy = { time_s: "time", height_cm: "height", distance_m: "distance", rsi: "rsi", power_w: "power", velocity_ms: "velocity", none: null } as Record<string, PSMetricKey | null>;
      const m = legacy[entry.default_measurement_type];
      patch.tracked_metrics = m ? [m] : [];
    }
    if (entry.default_completion_only) patch.completion_only = true;
    update(patch);
  }

  return (
    <div style={card.wrap}>
      {/* ── Header ── */}
      <div style={card.header}>
        <select
          value={exercise.quality}
          onChange={(e) => {
            const nextQ = e.target.value as PSQuality;
            const patch: Partial<PSExercise> = { quality: nextQ };
            // seed metrics from the quality default only when nothing's tracked yet
            if (tracked.length === 0) {
              patch.tracked_metrics = QUALITY_META[nextQ]?.defaultMetrics ?? [];
            }
            update(patch);
          }}
          style={{ ...card.qualityChip, background: qMeta.color + "22", color: qMeta.color, border: `1px solid ${qMeta.color}55` }}
        >
          {Object.entries(QUALITY_META).filter(([k]) => k !== "").map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
          <option value="">• General</option>
        </select>

        <input
          value={exercise.order}
          onChange={(e) => update({ order: e.target.value })}
          placeholder="#"
          title="1, 1A/1B for a superset, Complex A for French Contrast"
          style={card.orderInput}
        />

        {/* Name + autocomplete */}
        <div style={{ flex: 1, position: "relative" as const }}>
          <input
            ref={nameRef}
            value={nameQuery}
            onChange={(e) => { setNameQuery(e.target.value); update({ name: e.target.value }); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder="Exercise name…"
            style={card.nameInput}
          />
          {showDropdown && trimmedName.length > 0 && (libraryMatches.length > 0 || !hasExactMatch) && (
            <div style={card.dropdown}>
              {libraryMatches.map((e) => (
                <button key={e.id} style={card.dropdownItem}
                  onMouseDown={(ev) => { ev.preventDefault(); selectLibraryEntry(e); }}>
                  <span>{e.name}</span>
                  {(e.types ?? []).includes("Power/Speed") && (
                    <span style={{ fontSize: 10, color: "#A855F7", marginLeft: 6 }}>P/S</span>
                  )}
                </button>
              ))}
              {!hasExactMatch && (
                <button style={card.dropdownAdd}
                  onMouseDown={(ev) => { ev.preventDefault(); setAddOpen(true); }}>
                  + Add &quot;{trimmedName}&quot; to library
                </button>
              )}
            </div>
          )}
        </div>

        {localLog.length > 0 && (
          <span style={{ ...card.badge, background: doneSets === localLog.length ? "#10B98122" : "var(--ink)", color: doneSets === localLog.length ? "#10B981" : "var(--mute)" }}>
            {doneSets}/{localLog.length}
          </span>
        )}

        <button style={card.deleteBtn} onClick={onDelete}>×</button>
      </div>

      {/* ── Metrics tracked ── */}
      {!completionOnly && (
        <div>
          <button style={card.metricSummary} onClick={() => setShowMetricPicker((v) => !v)}>
            {showMetricPicker ? "▾" : "▸"} Metrics:{" "}
            {tracked.length
              ? tracked.map((k) => PS_METRIC_META[k].short).join(" · ")
              : <span style={{ color: "var(--mute)" }}>none — just tick done</span>}
          </button>
          {showMetricPicker && (
            <div style={card.metricPicker}>
              {PS_METRIC_ORDER.map((key) => {
                const m = PS_METRIC_META[key];
                const on = tracked.includes(key);
                return (
                  <button key={key} type="button" onClick={() => toggleMetric(key)}
                    style={{
                      ...card.metricChip,
                      background: on ? "var(--accent-dim)" : "var(--ink)",
                      borderColor: on ? "var(--accent)" : "var(--line)",
                      color: on ? "var(--accent)" : "var(--mute)",
                    }}>
                    {m.label}{m.unit ? ` (${m.unit})` : ""}
                    <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 4 }}>{m.scope === "set" ? "per set" : "per rep"}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Prescribed fields ── */}
      <div style={card.fields}>
        <Field label="Sets">
          <input type="number" value={localSets || ""} min={1}
            onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) update({ sets: v }); else if (e.target.value === "") setLocalSets(0); }}
            onBlur={() => { if (!localSets || localSets < 1) { setLocalSets(1); update({ sets: 1 }); } }}
            style={card.miniInput} />
        </Field>
        {!completionOnly && (
          <Field label="Reps">
            <input type="number" value={localReps || ""} min={1}
              onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) update({ reps: v }); else if (e.target.value === "") setLocalReps(0); }}
              onBlur={() => { if (!localReps || localReps < 1) { setLocalReps(1); update({ reps: 1 }); } }}
              style={card.miniInput} />
          </Field>
        )}
        {!completionOnly && (
          <Field label="Distance">
            <div style={{ display: "flex", gap: 2 }}>
              <input value={exercise.distance} onChange={(e) => update({ distance: e.target.value })}
                placeholder="10m" style={{ ...card.miniInput, flex: 1 }} />
              <select value="" onChange={(e) => update({ distance: e.target.value })}
                style={{ ...card.miniInput, width: 28, padding: "4px 2px" }}>
                <option value="">↓</option>
                {DISTANCE_PRESETS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </Field>
        )}
        <Field label="Rest">
          <input value={exercise.rest} onChange={(e) => update({ rest: e.target.value })}
            placeholder="3min" style={card.miniInput} />
        </Field>
        {isPlyo && !completionOnly && (
          <Field label="Contacts">
            <input type="number" value={exercise.contacts ?? ""}
              onChange={(e) => update({ contacts: parseInt(e.target.value) || null })}
              placeholder="20" style={card.miniInput} />
          </Field>
        )}
        {!completionOnly && (
          <Field label="Surface">
            <select value={exercise.surface} onChange={(e) => update({ surface: e.target.value })} style={card.miniInput}>
              <option value=""> - </option>
              {SURFACES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        )}
      </div>

      <label style={card.completionRow} title="No metric to log — the athlete just ticks each set done.">
        <input type="checkbox" checked={completionOnly}
          onChange={(e) => update({ completion_only: e.target.checked })}
          style={{ accentColor: "var(--accent)" }} />
        <span style={{ color: completionOnly ? "var(--accent)" : "var(--mute)" }}>Completion only</span>
      </label>

      {/* ── Coaching cues ── */}
      <button style={card.toggleBtn} onClick={() => setShowCues((v) => !v)}>
        {showCues ? "▾ Hide cues" : "▸ Coaching cues"}
      </button>
      {showCues && (
        <textarea value={exercise.notes} onChange={(e) => update({ notes: e.target.value })}
          placeholder="Technical focus, progressions, constraints…" rows={2} style={card.cuesInput} />
      )}

      {/* ── Live log ── */}
      <button
        style={{ ...card.toggleBtn, color: doneSets > 0 ? "#10B981" : "var(--mute)" }}
        onClick={() => setShowLog((v) => !v)}
      >
        {showLog ? "▾ Hide log" : `▸ Log sets${doneSets > 0 ? ` (${doneSets}/${localLog.length})` : ""}`}
      </button>

      {showLog && (
        <div style={card.logWrap}>
          {localLog.map((set, si) => (
            <div key={si} style={{ ...card.setBlock, ...(set.done ? card.setBlockDone : {}) }}>
              <div style={card.setHeader}>
                <span style={card.setLabel}>Set {si + 1}</span>
                {!completionOnly && repMetrics.length > 0 && (
                  <label style={card.toggleLabel}>
                    <input type="checkbox" checked={set.single_value}
                      onChange={(e) => updateSetField(si, { single_value: e.target.checked })}
                      style={{ accentColor: "var(--accent)" }} />
                    <span style={{ fontSize: 11, color: "var(--mute)" }}>One value for all reps</span>
                  </label>
                )}
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
                  <span style={card.metaLabel}>RPE</span>
                  <input value={set.rpe} onChange={(e) => updateSetField(si, { rpe: e.target.value })}
                    placeholder="-" inputMode="numeric" style={card.metaInput} />
                  <span style={card.metaLabel}>Pain</span>
                  <input value={set.pain} onChange={(e) => updateSetField(si, { pain: e.target.value })}
                    placeholder="-" inputMode="numeric" style={card.metaInput} />
                  <button style={{ ...card.doneBtn, ...(set.done ? card.doneBtnOn : {}) }}
                    onClick={() => setDone(si, !set.done)}>✓</button>
                </div>
              </div>

              {/* Set-level metric boxes (Load / Reps) */}
              {!completionOnly && setMetrics.length > 0 && (
                <div style={card.setMetricRow}>
                  {setMetrics.map((key) => (
                    <div key={key} style={card.setMetricBox}>
                      <span style={card.repLabelWide}>{PS_METRIC_META[key].label}{PS_METRIC_META[key].unit ? ` (${PS_METRIC_META[key].unit})` : ""}</span>
                      <input value={set.set_metrics[key] ?? ""}
                        onChange={(e) => updateSetMetric(si, key, e.target.value)}
                        placeholder={PS_METRIC_META[key].placeholder}
                        inputMode="decimal" style={card.repInput} />
                    </div>
                  ))}
                </div>
              )}

              {/* Per-rep metric boxes */}
              {!completionOnly && repMetrics.length > 0 && (
                set.single_value ? (
                  <div style={card.repGrid}>
                    <span style={card.repLabel}>All</span>
                    {repMetrics.map((key) => (
                      <div key={key} style={card.repRow}>
                        <input value={set.rep_metrics[0]?.[key] ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            // write to every rep
                            const newLog = localLog.map((s, i) => {
                              if (i !== si) return s;
                              const rm = s.rep_metrics.map((r) => ({ ...r, [key]: v }));
                              return { ...s, rep_metrics: rm, done: v.trim().length > 0 || s.done };
                            });
                            setLocalLog(newLog); commit({}, newLog);
                          }}
                          placeholder={PS_METRIC_META[key].placeholder}
                          inputMode="decimal" style={card.repInput} />
                        <span style={card.unitLabel}>{PS_METRIC_META[key].short}{PS_METRIC_META[key].unit ? ` ${PS_METRIC_META[key].unit}` : ""}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  Array.from({ length: Math.max(1, set.rep_metrics.length) }).map((_, ri) => (
                    <div key={ri} style={card.repGrid}>
                      <span style={card.repLabel}>R{ri + 1}</span>
                      {repMetrics.map((key) => (
                        <div key={key} style={card.repRow}>
                          <input value={set.rep_metrics[ri]?.[key] ?? ""}
                            onChange={(e) => updateRepMetric(si, ri, key, e.target.value)}
                            placeholder={PS_METRIC_META[key].placeholder}
                            inputMode="decimal" style={card.repInput} />
                          <span style={card.unitLabel}>{PS_METRIC_META[key].short}{PS_METRIC_META[key].unit ? ` ${PS_METRIC_META[key].unit}` : ""}</span>
                        </div>
                      ))}
                    </div>
                  ))
                )
              )}

              <input value={set.set_notes} onChange={(e) => updateSetField(si, { set_notes: e.target.value })}
                placeholder="Set notes…" style={card.setNotesInput} />
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <div style={card.addOverlay} onClick={() => setAddOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            {addError && <div style={card.addError}>{addError}</div>}
            <LibraryEntryForm
              entry={null}
              initialName={trimmedName}
              initialTypes={["Power/Speed"]}
              title={`Add "${trimmedName}" to library`}
              onSave={handleAddToLibrary}
              onClose={() => setAddOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Any logged metric value in the set (used to auto-mark it done)
function anyLogged(set: PSSetLog): boolean {
  if (Object.values(set.set_metrics).some((v) => (v ?? "").trim().length > 0)) return true;
  return set.rep_metrics.some((r) => Object.values(r).some((v) => (v ?? "").trim().length > 0));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 60 }}>
      <div style={{ fontSize: 10, color: "var(--mute)", marginBottom: 3, textTransform: "uppercase" as const }}>{label}</div>
      {children}
    </div>
  );
}

const card: Record<string, React.CSSProperties> = {
  wrap: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 },
  header: { display: "flex", alignItems: "center", gap: 6 },
  qualityChip: { borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  orderInput: { width: 32, textAlign: "center" as const, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, padding: "6px 2px", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  nameInput: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 14, fontWeight: 700 },
  dropdown: { position: "absolute" as const, top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30, background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 10, padding: 4, maxHeight: 200, overflowY: "auto" as const, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" },
  dropdownItem: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "7px 10px", border: "none", background: "transparent", color: "var(--text)", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" as const, borderRadius: 6 },
  dropdownAdd: { display: "block", width: "100%", padding: "8px 10px", marginTop: 4, borderRadius: 7, border: "1px dashed var(--accent)", background: "var(--accent-dim)", color: "var(--accent)", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "left" as const },
  addOverlay: { position: "fixed" as const, inset: 0, background: "rgba(6,9,12,.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16 },
  addError: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 8 },
  completionRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", marginTop: 2 },
  badge: { fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "2px 7px", flexShrink: 0 },
  deleteBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer", padding: 4, flexShrink: 0 },
  metricSummary: { background: "transparent", border: "none", color: "var(--text)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "2px 0", textAlign: "left" as const },
  metricPicker: { display: "flex", flexWrap: "wrap" as const, gap: 5, marginTop: 6, padding: 8, background: "var(--ink)", borderRadius: 8 },
  metricChip: { display: "flex", alignItems: "center", border: "1px solid", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" },
  fields: { display: "flex", gap: 8, flexWrap: "wrap" as const },
  miniInput: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "5px 7px", fontSize: 13 },
  toggleBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "2px 0", textAlign: "left" as const },
  cuesInput: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 10px", fontSize: 12, fontStyle: "italic" as const, resize: "vertical" as const, fontFamily: "inherit" },
  logWrap: { display: "flex", flexDirection: "column" as const, gap: 8 },
  setBlock: { background: "var(--ink)", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column" as const, gap: 6 },
  setBlockDone: { boxShadow: "inset 0 0 0 1px #10B98144" },
  setHeader: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const },
  setLabel: { fontSize: 12, fontWeight: 700, color: "var(--mute)", flexShrink: 0 },
  toggleLabel: { display: "flex", alignItems: "center", gap: 4, cursor: "pointer" },
  metaLabel: { fontSize: 10, color: "var(--mute)", fontWeight: 600, textTransform: "uppercase" as const, flexShrink: 0 },
  metaInput: { width: 44, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 5, padding: "4px 6px", fontSize: 12, textAlign: "center" as const },
  doneBtn: { width: 26, height: 26, borderRadius: 5, border: "1px solid var(--line)", background: "transparent", color: "var(--mute)", cursor: "pointer", flexShrink: 0, fontSize: 12 },
  doneBtnOn: { background: "#10B98122", color: "#10B981", borderColor: "#10B981" },
  setMetricRow: { display: "flex", flexWrap: "wrap" as const, gap: 8 },
  setMetricBox: { display: "flex", flexDirection: "column" as const, gap: 2 },
  repGrid: { display: "flex", flexWrap: "wrap" as const, gap: 6, alignItems: "center" },
  repRow: { display: "flex", alignItems: "center", gap: 3 },
  repLabel: { fontSize: 10, color: "var(--mute)", fontWeight: 700, width: 22, flexShrink: 0 },
  repLabelWide: { fontSize: 10, color: "var(--mute)", fontWeight: 700, textTransform: "uppercase" as const },
  repInput: { width: 64, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 5, padding: "5px 7px", fontSize: 13, fontWeight: 700 },
  unitLabel: { fontSize: 10, color: "var(--mute)", flexShrink: 0 },
  setNotesInput: { width: "100%", background: "transparent", border: "none", borderTop: "1px solid var(--line)", color: "var(--mute)", padding: "6px 0 0", fontSize: 11, fontStyle: "italic" as const },
};
