"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SessionReviewEditor
//
// Shared review/edit component used by VoiceSessionModal and NotesSessionModal.
// Handles:
//   • ✓ / ⚠️ library match indicators per exercise
//   • Click exercise name → library search picker or "Create new"
//   • Click sets / reps / load / rest / tempo → inline edit
//   • Multi-session propagation prompt ("apply to all X sessions?")
//   • Blocks save while any exercise is unmatched (returns hasUnresolved)
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { saveLibraryEntry } from "@/lib/data/library";
import type { LibraryEntry } from "@/types";

// ── Exported types — used by both modals ──────────────────────────────────────

export interface ReviewExercise {
  name: string;
  order: string;        // superset/position label e.g. "1", "1A", "1B"
  libraryId: string | null;
  matched: boolean;
  video_url: string;
  sets: number;
  reps: string;
  rest: string;
  target_load: string;
  tempo: string;
  notes: string;
  time: string;
  each_side: boolean;
}

export interface ReviewSession {
  name: string;
  dayOffset: number;
  weekNumber: number;
  exercises: ReviewExercise[];
}

// ── Exported helpers — call these when converting Claude output ───────────────

export function enrichWithLibrary(
  exercises: Array<{
    name: string;
    sets: number;
    reps: string;
    rest: string;
    target_load: string;
    tempo: string;
    notes: string;
    time: string;
    each_side: boolean;
    [key: string]: any;
  }>,
  library: LibraryEntry[]
): ReviewExercise[] {
  return exercises.map((e) => {
    const lib = library.find(
      (l) => l.name.toLowerCase() === e.name.toLowerCase().trim()
    );
    return {
      name: lib?.name ?? e.name,
      order: String((e as any).order ?? ""),   // preserve superset label
      libraryId: lib?.id ?? null,
      matched: !!lib,
      video_url: lib?.video_url ?? "",
      sets: e.sets,
      reps: e.reps,
      rest: e.rest,
      target_load: e.target_load,
      tempo: e.tempo || lib?.tempo || "",
      notes: e.notes,
      time: e.time,
      each_side: e.each_side,
    };
  });
}

// ── Internal state types ──────────────────────────────────────────────────────

type EditingCell = { si: number; ei: number; field: string; value: string } | null;
type PickerOpen = { si: number; ei: number } | null;
type PropagationState = {
  si: number;
  ei: number;
  field: string;
  value: string | number;
  matchCount: number;
} | null;

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  sessions: ReviewSession[];
  onChange: (sessions: ReviewSession[]) => void;
  library: LibraryEntry[];
  onLibraryEntryCreated: (entry: LibraryEntry) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SessionReviewEditor({
  sessions,
  onChange,
  library,
  onLibraryEntryCreated,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState<PickerOpen>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [propagation, setPropagation] = useState<PropagationState>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const multiSession = sessions.length > 1;

  // ── Update helpers ──────────────────────────────────────────────────────────

  const updateExercise = (
    si: number,
    ei: number,
    updates: Partial<ReviewExercise>,
    applyToAll = false
  ) => {
    const targetName = sessions[si].exercises[ei].name;
    onChange(
      sessions.map((session, sIdx) => ({
        ...session,
        exercises: session.exercises.map((ex, eIdx) => {
          const isTarget = sIdx === si && eIdx === ei;
          const isMatch = applyToAll && ex.name === targetName;
          if (isTarget || isMatch) return { ...ex, ...updates };
          return ex;
        }),
      }))
    );
  };

  const countMatches = (si: number, ei: number): number => {
    const targetName = sessions[si].exercises[ei].name;
    let count = 0;
    sessions.forEach((session, sIdx) => {
      session.exercises.forEach((ex, eIdx) => {
        if (ex.name === targetName && !(sIdx === si && eIdx === ei)) count++;
      });
    });
    return count;
  };

  // ── Library picker ──────────────────────────────────────────────────────────

  const openPicker = (si: number, ei: number) => {
    setPickerOpen({ si, ei });
    setPickerSearch(sessions[si].exercises[ei].name);
    setPropagation(null);
    setEditingCell(null);
  };

  const closePicker = () => {
    setPickerOpen(null);
    setPickerSearch("");
    setCreateError("");
  };

  const selectLibraryEntry = (si: number, ei: number, entry: LibraryEntry) => {
    updateExercise(si, ei, {
      name: entry.name,
      libraryId: entry.id,
      matched: true,
      video_url: entry.video_url,
      tempo: sessions[si].exercises[ei].tempo || entry.tempo || "",
    });
    closePicker();
  };

  const createNewEntry = async (si: number, ei: number, name: string) => {
    if (!name.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const entry = await saveLibraryEntry({ name: name.trim() });
      onLibraryEntryCreated(entry);
      updateExercise(si, ei, {
        name: entry.name,
        libraryId: entry.id,
        matched: true,
        video_url: "",
      });
      closePicker();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Could not create exercise");
    } finally {
      setCreating(false);
    }
  };

  const filteredLibrary = library.filter((e) =>
    e.name.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  // ── Inline cell editing ─────────────────────────────────────────────────────

  const startEditing = (si: number, ei: number, field: string) => {
    const ex = sessions[si].exercises[ei];
    const value = String((ex as any)[field] ?? "");
    setEditingCell({ si, ei, field, value });
    setPropagation(null);
    setPickerOpen(null);
  };

  const commitEdit = (si: number, ei: number, field: string, raw: string) => {
    setEditingCell(null);
    const value = field === "sets" ? Math.max(1, parseInt(raw, 10) || 1) : raw.trim();
    const matchCount = multiSession ? countMatches(si, ei) : 0;

    if (matchCount > 0) {
      setPropagation({ si, ei, field, value, matchCount });
    } else {
      updateExercise(si, ei, { [field]: value } as Partial<ReviewExercise>);
    }
  };

  const applyPropagation = (applyToAll: boolean) => {
    if (!propagation) return;
    const { si, ei, field, value } = propagation;
    updateExercise(si, ei, { [field]: value } as Partial<ReviewExercise>, applyToAll);
    setPropagation(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const hasUnresolved = sessions.some((s) => s.exercises.some((e) => !e.matched));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {hasUnresolved && (
        <div style={s.unresolvedBanner}>
          ⚠️ Link or create unmatched exercises before saving — historical reporting depends on library links
        </div>
      )}

      {sessions.map((session, si) => (
        <div key={si} style={s.sessionBlock}>
          {/* Session header — only show when multi-session */}
          {multiSession && (
            <div style={s.sessionLabel}>{session.name}</div>
          )}

          {session.exercises.length === 0 && (
            <div style={s.empty}>No exercises in this session</div>
          )}

          {session.exercises.map((ex, ei) => {
            const isPicking = pickerOpen?.si === si && pickerOpen?.ei === ei;
            const isPropTarget =
              propagation?.si === si && propagation?.ei === ei;

            return (
              <div key={ei} style={s.exCard}>
                {/* ── Exercise name row ── */}
                <div style={s.exNameRow}>
                  {/* Match badge */}
                  <div
                    style={{
                      ...s.badge,
                      background: ex.matched ? "#0a2a0a" : "#2a1a00",
                      color: ex.matched ? "var(--good)" : "#f5a623",
                      border: `1px solid ${ex.matched ? "#1a4a1a" : "#4a3000"}`,
                    }}
                    title={ex.matched ? "Linked to library" : "Not in library — click name to link"}
                  >
                    {ex.matched ? "✓" : "⚠"}
                  </div>

                  {/* Exercise name — click to open picker */}
                  <button
                    style={{
                      ...s.nameBtn,
                      color: ex.matched ? "var(--text)" : "#f5a623",
                    }}
                    onClick={() => openPicker(si, ei)}
                  >
                    {ex.name || "Unnamed"}
                    <span style={s.nameCaret}>▾</span>
                  </button>
                </div>

                {/* ── Library picker ── */}
                {isPicking && (
                  <div style={s.picker}>
                    <input
                      autoFocus
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      placeholder="Search library…"
                      style={s.pickerSearch}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") closePicker();
                        if (e.key === "Enter" && filteredLibrary.length === 0) {
                          createNewEntry(si, ei, pickerSearch);
                        }
                      }}
                    />
                    <div style={s.pickerList}>
                      {filteredLibrary.slice(0, 8).map((entry) => (
                        <button
                          key={entry.id}
                          style={s.pickerItem}
                          onClick={() => selectLibraryEntry(si, ei, entry)}
                        >
                          {entry.name}
                          {entry.video_url && (
                            <span style={s.pickerVideoTag}>🎥</span>
                          )}
                        </button>
                      ))}
                      {filteredLibrary.length === 0 && pickerSearch.trim() && (
                        <div style={s.pickerNoMatch}>
                          No matches for "{pickerSearch}"
                        </div>
                      )}
                    </div>
                    {pickerSearch.trim() && (
                      <button
                        style={s.createNewBtn}
                        disabled={creating}
                        onClick={() => createNewEntry(si, ei, pickerSearch)}
                      >
                        {creating
                          ? "Creating…"
                          : `+ Create "${pickerSearch}" as new exercise`}
                      </button>
                    )}
                    {createError && (
                      <div style={s.createError}>{createError}</div>
                    )}
                    <button style={s.pickerCancel} onClick={closePicker}>
                      Cancel
                    </button>
                  </div>
                )}

                {/* ── Value chips ── */}
                {!isPicking && (
                  <div style={s.chips}>
                    {/* Sets */}
                    <EditChip
                      label={`${ex.sets} sets`}
                      isEditing={
                        editingCell?.si === si &&
                        editingCell?.ei === ei &&
                        editingCell?.field === "sets"
                      }
                      value={editingCell?.si === si && editingCell?.ei === ei && editingCell?.field === "sets"
                        ? editingCell.value
                        : String(ex.sets)}
                      onStartEdit={() => startEditing(si, ei, "sets")}
                      onChange={(v) =>
                        setEditingCell((c) => c ? { ...c, value: v } : c)
                      }
                      onCommit={(v) => commitEdit(si, ei, "sets", v)}
                      width={52}
                    />

                    {/* Reps */}
                    {(ex.reps || ex.time) && (
                      <>
                        <span style={s.chipSep}>×</span>
                        <EditChip
                          label={ex.time ? `${ex.time}` : ex.reps}
                          isEditing={
                            editingCell?.si === si &&
                            editingCell?.ei === ei &&
                            editingCell?.field === (ex.time ? "time" : "reps")
                          }
                          value={
                            editingCell?.si === si && editingCell?.ei === ei &&
                            editingCell?.field === (ex.time ? "time" : "reps")
                              ? editingCell.value
                              : ex.time || ex.reps
                          }
                          onStartEdit={() =>
                            startEditing(si, ei, ex.time ? "time" : "reps")
                          }
                          onChange={(v) =>
                            setEditingCell((c) => c ? { ...c, value: v } : c)
                          }
                          onCommit={(v) =>
                            commitEdit(si, ei, ex.time ? "time" : "reps", v)
                          }
                          width={64}
                        />
                      </>
                    )}

                    {/* Load */}
                    {ex.target_load && (
                      <>
                        <span style={s.chipSep}>·</span>
                        <EditChip
                          label={ex.target_load}
                          isEditing={
                            editingCell?.si === si &&
                            editingCell?.ei === ei &&
                            editingCell?.field === "target_load"
                          }
                          value={
                            editingCell?.si === si && editingCell?.ei === ei &&
                            editingCell?.field === "target_load"
                              ? editingCell.value
                              : ex.target_load
                          }
                          onStartEdit={() =>
                            startEditing(si, ei, "target_load")
                          }
                          onChange={(v) =>
                            setEditingCell((c) => c ? { ...c, value: v } : c)
                          }
                          onCommit={(v) =>
                            commitEdit(si, ei, "target_load", v)
                          }
                          width={80}
                        />
                      </>
                    )}

                    {/* Rest */}
                    {ex.rest && (
                      <>
                        <span style={s.chipSep}>· rest</span>
                        <EditChip
                          label={ex.rest}
                          isEditing={
                            editingCell?.si === si &&
                            editingCell?.ei === ei &&
                            editingCell?.field === "rest"
                          }
                          value={
                            editingCell?.si === si && editingCell?.ei === ei &&
                            editingCell?.field === "rest"
                              ? editingCell.value
                              : ex.rest
                          }
                          onStartEdit={() => startEditing(si, ei, "rest")}
                          onChange={(v) =>
                            setEditingCell((c) => c ? { ...c, value: v } : c)
                          }
                          onCommit={(v) => commitEdit(si, ei, "rest", v)}
                          width={64}
                        />
                      </>
                    )}

                    {/* Tempo */}
                    {ex.tempo && (
                      <>
                        <span style={s.chipSep}>·</span>
                        <EditChip
                          label={ex.tempo}
                          isEditing={
                            editingCell?.si === si &&
                            editingCell?.ei === ei &&
                            editingCell?.field === "tempo"
                          }
                          value={
                            editingCell?.si === si && editingCell?.ei === ei &&
                            editingCell?.field === "tempo"
                              ? editingCell.value
                              : ex.tempo
                          }
                          onStartEdit={() => startEditing(si, ei, "tempo")}
                          onChange={(v) =>
                            setEditingCell((c) => c ? { ...c, value: v } : c)
                          }
                          onCommit={(v) => commitEdit(si, ei, "tempo", v)}
                          width={72}
                        />
                      </>
                    )}

                    {ex.each_side && (
                      <span style={{ ...s.chipSep, fontSize: 10 }}>· each side</span>
                    )}
                  </div>
                )}

                {ex.notes && !isPicking && (
                  <div style={s.exNotes}>{ex.notes}</div>
                )}

                {/* ── Propagation prompt ── */}
                {isPropTarget && propagation && (
                  <div style={s.propagation}>
                    <span style={s.propagationMsg}>
                      Apply this change to all {propagation.matchCount + 1} sessions with "{ex.name}"?
                    </span>
                    <div style={s.propagationBtns}>
                      <button
                        style={s.propagationYes}
                        onClick={() => applyPropagation(true)}
                      >
                        Yes, update all
                      </button>
                      <button
                        style={s.propagationNo}
                        onClick={() => applyPropagation(false)}
                      >
                        Just this session
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── EditChip — a value that turns into an input on click ──────────────────────

function EditChip({
  label,
  isEditing,
  value,
  onStartEdit,
  onChange,
  onCommit,
  width,
}: {
  label: string;
  isEditing: boolean;
  value: string;
  onStartEdit: () => void;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  width: number;
}) {
  if (isEditing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit((e.target as HTMLInputElement).value);
          if (e.key === "Escape") onCommit(label); // revert
        }}
        style={{ ...chipInputStyle, width }}
      />
    );
  }
  return (
    <button style={chipBtnStyle} onClick={onStartEdit} title="Click to edit">
      {label}
    </button>
  );
}

const chipBtnStyle: React.CSSProperties = {
  background: "var(--panel2)",
  border: "1px solid var(--line)",
  color: "var(--text)",
  borderRadius: 5,
  padding: "2px 7px",
  fontSize: 12,
  cursor: "pointer",
  fontWeight: 600,
};

const chipInputStyle: React.CSSProperties = {
  background: "var(--ink)",
  border: "1px solid var(--accent)",
  color: "var(--text)",
  borderRadius: 5,
  padding: "2px 6px",
  fontSize: 12,
  fontWeight: 600,
  outline: "none",
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  unresolvedBanner: {
    background: "#1a1200",
    border: "1px solid #f5a62344",
    color: "#f5a623",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 12,
    lineHeight: 1.5,
  },
  sessionBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  sessionLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--mute)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    paddingBottom: 2,
    borderBottom: "1px solid var(--line)",
    marginBottom: 2,
  },
  empty: {
    fontSize: 12,
    color: "var(--mute)",
    fontStyle: "italic",
    padding: "8px 0",
  },
  exCard: {
    background: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  exNameRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    width: 20,
    height: 20,
    borderRadius: 5,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    fontWeight: 700,
    flexShrink: 0,
  },
  nameBtn: {
    background: "transparent",
    border: "none",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    padding: 0,
    display: "flex",
    alignItems: "center",
    gap: 4,
    textAlign: "left" as const,
  },
  nameCaret: {
    fontSize: 9,
    color: "var(--mute)",
    opacity: 0.6,
  },
  // Picker
  picker: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    background: "var(--panel)",
    border: "1px solid var(--accent)",
    borderRadius: 10,
    padding: 10,
  },
  pickerSearch: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 7,
    padding: "8px 10px",
    fontSize: 13,
  },
  pickerList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    maxHeight: 180,
    overflowY: "auto",
  },
  pickerItem: {
    background: "transparent",
    border: "none",
    color: "var(--text)",
    borderRadius: 6,
    padding: "7px 10px",
    fontSize: 13,
    cursor: "pointer",
    textAlign: "left" as const,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pickerVideoTag: {
    fontSize: 11,
    opacity: 0.6,
  },
  pickerNoMatch: {
    fontSize: 12,
    color: "var(--mute)",
    padding: "6px 10px",
    fontStyle: "italic",
  },
  createNewBtn: {
    background: "var(--accent-dim)",
    border: "1px dashed var(--accent)",
    color: "var(--accent)",
    borderRadius: 7,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left" as const,
  },
  createError: {
    fontSize: 11,
    color: "#FF6B6B",
    padding: "0 2px",
  },
  pickerCancel: {
    background: "transparent",
    border: "none",
    color: "var(--mute)",
    fontSize: 12,
    cursor: "pointer",
    padding: "4px 0",
    textAlign: "left" as const,
  },
  // Value chips row
  chips: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap" as const,
  },
  chipSep: {
    fontSize: 12,
    color: "var(--mute)",
    userSelect: "none" as const,
  },
  exNotes: {
    fontSize: 11,
    color: "var(--mute)",
    fontStyle: "italic",
  },
  // Propagation
  propagation: {
    background: "var(--panel2)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  propagationMsg: {
    fontSize: 12,
    color: "var(--mute)",
    lineHeight: 1.4,
  },
  propagationBtns: {
    display: "flex",
    gap: 8,
  },
  propagationYes: {
    background: "var(--accent)",
    color: "#0a1420",
    border: "none",
    borderRadius: 7,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  propagationNo: {
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    borderRadius: 7,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
};
