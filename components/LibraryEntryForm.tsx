"use client";

// Shared exercise-library create/edit form — used by the Library page
// itself, and by ExerciseCard's "+ Add to library" flow so a coach can
// save a new preset without leaving the session they're building.

import { useState } from "react";
import type { LibraryEntry } from "@/types";

const SESSION_TYPES = ["Strength", "Power/Speed", "Cardio", "Hyrox"];

export default function LibraryEntryForm({
  entry,
  initialName,
  title,
  onSave,
  onClose,
}: {
  entry: LibraryEntry | null;
  initialName?: string;
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
  const [types, setTypes] = useState<string[]>(entry?.types ?? []);

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
      <FieldRow label="Video URL">
        <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://..." style={s.input} />
      </FieldRow>
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
      <FieldRow label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...s.input, minHeight: 70 }} />
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
          Tag which session types this exercise appears in
        </div>
      </FieldRow>
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
  },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
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
