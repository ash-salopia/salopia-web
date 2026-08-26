"use client";

// Shared exercise-library create/edit form — used by the Library page
// itself, and by ExerciseCard's "+ Add to library" flow so a coach can
// save a new preset without leaving the session they're building.

import { useState } from "react";
import type { LibraryEntry } from "@/types";
import { MetricToggles, DistanceUnitPills } from "@/components/MetricBoxes";
import { EQUIPMENT_ORDER, EQUIPMENT_META, metricsForEquipment, type MetricKey, type EquipmentType, type DistanceUnit } from "@/lib/cardio-metrics";

// Sensible starting distance unit per equipment, applied when a coach
// picks that equipment (still freely overridable) - an Erg is
// conventionally read in metres, a Treadmill/Bike in km (or miles, a
// tap away). No suggestion for equipment where distance rarely applies.
const EQUIPMENT_DISTANCE_UNIT: Partial<Record<EquipmentType, DistanceUnit>> = {
  erg: "m", treadmill: "km", bike: "km",
};

const SESSION_TYPES = ["Strength", "Power/Speed", "Cardio", "Hyrox"];

export default function LibraryEntryForm({
  entry,
  initialName,
  initialTypes,
  title,
  onSave,
  onClose,
}: {
  entry: LibraryEntry | null;
  initialName?: string;
  initialTypes?: string[];
  title?: string;
  onSave: (entry: Partial<LibraryEntry> & { name: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(entry?.name ?? initialName ?? "");
  const [videoUrl, setVideoUrl] = useState(entry?.video_url ?? "");
  const [sets, setSets] = useState(entry?.sets ?? "");
  const [reps, setReps] = useState(entry?.reps ?? "");
  const [rest, setRest] = useState(entry?.rest ?? "");
  const [targetLoad, setTargetLoad] = useState(entry?.target_load ?? "");
  const [tempo, setTempo] = useState(entry?.tempo ?? "2-0-2");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [types, setTypes] = useState<string[]>(entry?.types ?? initialTypes ?? []);
  const [isBodyweight, setIsBodyweight] = useState(entry?.is_bodyweight ?? false);
  const [eachSide, setEachSide] = useState(entry?.each_side ?? false);
  const [usePercent1rm, setUsePercent1rm] = useState(entry?.use_percent_1rm ?? false);
  const [defaultTrackedMetrics, setDefaultTrackedMetrics] = useState<MetricKey[]>(entry?.default_tracked_metrics ?? []);
  const [equipment, setEquipment] = useState<EquipmentType | null>(entry?.equipment ?? null);
  const [defaultDistanceUnit, setDefaultDistanceUnit] = useState<DistanceUnit>(entry?.default_distance_unit ?? "km");

  const handleEquipmentChange = (next: EquipmentType | null) => {
    setEquipment(next);
    // Picking a concrete equipment type auto-ticks every metric it
    // supports (e.g. Erg -> distance/pace/watts/cadence/HR/calories) so
    // the right boxes show up immediately rather than the coach having
    // to tick each one by hand - they can still untick individually.
    // Reverting to "None" leaves whatever was already ticked alone
    // (nothing to prune - None allows everything).
    if (next) {
      setDefaultTrackedMetrics(metricsForEquipment(next));
      const suggestedUnit = EQUIPMENT_DISTANCE_UNIT[next];
      if (suggestedUnit) setDefaultDistanceUnit(suggestedUnit);
    }
  };
  const strengthFields = types.includes("Strength") || types.includes("Power/Speed");
  const cardioFields = types.includes("Cardio") || types.includes("Hyrox");

  const toggleType = (t: string) =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: entry?.id,
      name: name.trim(),
      video_url: videoUrl.trim(),
      sets,
      reps,
      rest,
      target_load: targetLoad,
      tempo,
      notes,
      types,
      is_bodyweight: isBodyweight,
      each_side: eachSide,
      use_percent_1rm: isBodyweight ? false : usePercent1rm,
      default_tracked_metrics: cardioFields ? defaultTrackedMetrics : [],
      equipment: cardioFields ? equipment : null,
      default_distance_unit: cardioFields && defaultTrackedMetrics.includes("distance") ? defaultDistanceUnit : null,
    } as Partial<LibraryEntry> & { name: string });
  };

  return (
    <form onSubmit={handleSubmit} style={s.editorPane}>
      <div style={s.headerRow}>
        <h2 style={s.editorTitle}>{title ?? (entry ? "Edit exercise" : "New exercise")}</h2>
        <button type="button" style={s.closeBtn} onClick={onClose}>
          ×
        </button>
      </div>
      <FieldRow label="Name">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={s.input} />
      </FieldRow>
      <FieldRow label="Session types">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SESSION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              style={{
                background: types.includes(t) ? "var(--accent-dim)" : "var(--ink)",
                border: `1px solid ${types.includes(t) ? "var(--accent)" : "var(--line)"}`,
                color: types.includes(t) ? "var(--accent)" : "var(--mute)",
                borderRadius: 6,
                padding: "5px 10px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 4 }}>
          Determines which fields below apply - e.g. Cardio/Hyrox hide the strength-only fields
        </div>
      </FieldRow>
      <FieldRow label="Video URL">
        <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://..." style={s.input} />
      </FieldRow>
      <FieldRow label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...s.input, minHeight: 70 }} />
      </FieldRow>
      {strengthFields && (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <FieldRow label="Sets"><input value={sets} onChange={(e) => setSets(e.target.value)} style={s.input} /></FieldRow>
            <FieldRow label="Reps"><input value={reps} onChange={(e) => setReps(e.target.value)} style={s.input} /></FieldRow>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <FieldRow label="Rest"><input value={rest} onChange={(e) => setRest(e.target.value)} style={s.input} /></FieldRow>
            <FieldRow label="Tempo">
              <input
                value={tempo}
                onChange={(e) => setTempo(e.target.value.replace(/[^0-9-]/g, ""))}
                style={s.input}
              />
            </FieldRow>
          </div>
          <FieldRow label="Default load">
            <input value={targetLoad} onChange={(e) => setTargetLoad(e.target.value)} placeholder="e.g. 60kg" style={s.input} />
          </FieldRow>
          <FieldRow label="Defaults when added to a session">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={s.checkRow}>
                <input
                  type="checkbox"
                  checked={isBodyweight}
                  onChange={(e) => setIsBodyweight(e.target.checked)}
                  style={{ accentColor: "var(--accent)" }}
                />
                <span style={{ color: isBodyweight ? "var(--accent)" : "var(--text)" }}>Bodyweight only</span>
              </label>
              <label style={s.checkRow}>
                <input
                  type="checkbox"
                  checked={eachSide}
                  onChange={(e) => setEachSide(e.target.checked)}
                  style={{ accentColor: "var(--accent)" }}
                />
                <span style={{ color: eachSide ? "var(--accent)" : "var(--text)" }}>Each side</span>
              </label>
              {!isBodyweight && (
                <label style={s.checkRow}>
                  <input
                    type="checkbox"
                    checked={usePercent1rm}
                    onChange={(e) => setUsePercent1rm(e.target.checked)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span style={{ color: usePercent1rm ? "var(--accent)" : "var(--text)" }}>Use %1RM</span>
                </label>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 4 }}>
              Pre-ticked whenever this exercise is added from the library
            </div>
          </FieldRow>
        </>
      )}
      {cardioFields && (
        <>
          <FieldRow label="Equipment">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => handleEquipmentChange(null)}
                style={{
                  background: equipment === null ? "var(--accent-dim)" : "var(--ink)",
                  border: `1px solid ${equipment === null ? "var(--accent)" : "var(--line)"}`,
                  color: equipment === null ? "var(--accent)" : "var(--mute)",
                  borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                None
              </button>
              {EQUIPMENT_ORDER.filter((eq) => eq !== "other").map((eq) => (
                <button
                  key={eq}
                  type="button"
                  onClick={() => handleEquipmentChange(eq)}
                  style={{
                    background: equipment === eq ? "var(--accent-dim)" : "var(--ink)",
                    border: `1px solid ${equipment === eq ? "var(--accent)" : "var(--line)"}`,
                    color: equipment === eq ? "var(--accent)" : "var(--mute)",
                    borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {EQUIPMENT_META[eq].label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 4 }}>
              Picking equipment auto-ticks the metrics it supports below - restricts what can be ticked to just those. Leave as "None" for no restriction.
            </div>
          </FieldRow>
          <FieldRow label="Tracking metrics">
            <MetricToggles tracked={defaultTrackedMetrics} onChange={setDefaultTrackedMetrics} available={metricsForEquipment(equipment ?? undefined)} />
            <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 4 }}>
              Pre-ticked whenever this exercise is added to a Hyrox/Cardio session — a
              coach can still adjust it for an individual exercise from there
            </div>
          </FieldRow>
          {defaultTrackedMetrics.includes("distance") && (
            <FieldRow label="Default distance unit">
              <DistanceUnitPills value={defaultDistanceUnit} onChange={setDefaultDistanceUnit} />
              <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 4 }}>
                Starting unit for this exercise's distance box, e.g. Ergs default to metres, a Treadmill to km
              </div>
            </FieldRow>
          )}
        </>
      )}
      <button type="submit" style={s.primaryBtn}>
        Save
      </button>
    </form>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12, flex: 1 }}>
      <div style={s.fieldLabel}>{label}</div>
      {children}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  editorPane: {
    width: 320,
    flexShrink: 0,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: 16,
    height: "fit-content",
    // Equipment + Tracking metrics made this taller than a lot of
    // screens - without this the Save button ends up below the fold
    // with no way to reach it (the overlay that centers this pane
    // doesn't scroll on its own). Sticky header keeps the close button
    // reachable too while scrolled down.
    maxHeight: "min(85vh, 720px)",
    overflowY: "auto" as const,
  },
  headerRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16,
    position: "sticky" as const, top: -16, background: "var(--panel)", paddingTop: 16, marginTop: -16, zIndex: 1,
  },
  editorTitle: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, margin: 0 },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer" },
  input: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
  },
  fieldLabel: { fontSize: 11, color: "var(--mute)", marginBottom: 4, fontWeight: 600 },
  checkRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" },
  primaryBtn: {
    background: "var(--accent)",
    color: "#0a1420",
    border: "none",
    borderRadius: 10,
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
};
