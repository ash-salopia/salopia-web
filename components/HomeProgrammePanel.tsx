"use client";

// Coach-side controls for publishing a template as a public Home
// Programme (0058) — publish/unpublish + share link + expiry, plus a
// per-exercise "equipment alternatives" editor. Deliberately separate
// from the template's normal exercise editing (which this app doesn't
// even expose on this page — defs are built via "Save as Template"
// from a real session) so this stays additive rather than risking the
// existing flow.

import { useEffect, useState } from "react";
import { publishTemplate, unpublishTemplate, updateTemplateDef } from "@/lib/data/templates";
import { listLibrary } from "@/lib/data/library";
import type { Template, TemplateDef, ExerciseAlternative, LibraryEntry } from "@/types";

const EXPIRY_OPTIONS: { label: string; days: number | null }[] = [
  { label: "Never", days: null },
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "90 days", days: 90 },
];

function blankAlt(): ExerciseAlternative {
  return { name: "", equipment: "", sets: undefined, reps: "", rest: "", notes: "", video_url: "" };
}

// Supabase's PostgrestError (what these calls actually throw) isn't an
// `instanceof Error`, so a plain `e instanceof Error` check silently
// swallows the real reason (e.g. "column ... does not exist") behind a
// generic fallback - fall back to reading `.message` structurally too.
function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return fallback;
}

export default function HomeProgrammePanel({ template, onRefresh }: { template: Template; onRefresh: () => void }) {
  const [publishing, setPublishing] = useState(false);
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [openExerciseKey, setOpenExerciseKey] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  // Which alternative row's name-search dropdown is open, and its
  // current typed text - transient/local, never touches the saved
  // alternative until the coach either picks a library match or blurs
  // the field, so searching never forces a library entry to exist.
  const [openAltKey, setOpenAltKey] = useState<string | null>(null);
  const [altDraft, setAltDraft] = useState("");

  useEffect(() => {
    listLibrary().then(setLibrary).catch(() => {});
  }, []);

  const publicUrl = template.share_code && typeof window !== "undefined" ? `${window.location.origin}/g/${template.share_code}` : "";

  const handlePublish = async () => {
    setPublishing(true);
    setError("");
    try {
      await publishTemplate(template.id, expiryDays);
      onRefresh();
    } catch (e) {
      setError(errorMessage(e, "Could not publish"));
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!confirm("Unpublish this home programme? The link will stop working immediately.")) return;
    try {
      await unpublishTemplate(template.id);
      onRefresh();
    } catch (e) {
      setError(errorMessage(e, "Could not unpublish"));
    }
  };

  const handleCopy = () => {
    if (!publicUrl) return;
    navigator.clipboard?.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const saveDefExercises = async (def: TemplateDef, exercises: TemplateDef["exercises"]) => {
    setError("");
    try {
      await updateTemplateDef(def.id, { exercises });
      onRefresh();
    } catch (e) {
      setError(errorMessage(e, "Could not save"));
    }
  };

  return (
    <div style={s.card}>
      <div style={s.cardTitle}>Home Programme</div>
      <div style={s.hint}>
        Publish this template as a public, no-login link — for younger squads doing home workouts where
        there's no individual athlete profile. Read-only: no login, no progress tracking, just today's
        session(s).
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {!template.share_code ? (
        <div style={{ marginTop: 12 }}>
          <div style={s.fieldLabel}>Link expires</div>
          <div style={s.expiryRow}>
            {EXPIRY_OPTIONS.map((o) => (
              <button
                key={o.label}
                onClick={() => setExpiryDays(o.days)}
                style={{ ...s.expiryBtn, ...(expiryDays === o.days ? s.expiryBtnActive : {}) }}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button style={{ ...s.primaryBtn, opacity: publishing ? 0.6 : 1 }} disabled={publishing} onClick={handlePublish}>
            {publishing ? "Publishing…" : "Publish as Home Programme"}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div style={s.linkRow}>
            <input readOnly value={publicUrl} style={s.linkInput} onFocus={(e) => e.target.select()} />
            <button style={s.ghostBtn} onClick={handleCopy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div style={s.expiryNote}>
            {template.share_expires_at
              ? `Expires ${new Date(template.share_expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
              : "No fixed expiry"}
            {" · also stops working automatically if your subscription lapses"}
          </div>
          <button style={s.dangerBtn} onClick={handleUnpublish}>
            Unpublish
          </button>
        </div>
      )}

      {(template.defs ?? []).length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={s.fieldLabel}>Equipment alternatives</div>
          <div style={s.hint}>
            Tag an exercise with the equipment it needs, then add alternatives for other equipment — the
            public page lets the viewer pick what they've got and swaps exercises in automatically.
          </div>
          {(template.defs ?? []).map((def) => (
            <div key={def.id} style={s.defBlock}>
              <div style={s.defName}>{def.name}</div>
              {(def.exercises ?? []).map((ex, i) => {
                const key = `${def.id}:${i}`;
                const open = openExerciseKey === key;
                return (
                  <div key={key} style={s.exRow}>
                    <button style={s.exToggle} onClick={() => setOpenExerciseKey(open ? null : key)}>
                      <span>{ex.name || `Exercise ${i + 1}`}</span>
                      <span style={s.exToggleMeta}>
                        {ex.equipment ? ex.equipment : "No equipment tag"} · {(ex.alternatives ?? []).length} alt{(ex.alternatives ?? []).length === 1 ? "" : "s"} {open ? "▲" : "▼"}
                      </span>
                    </button>
                    {open && (
                      <div style={s.exEditor}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <div style={{ flex: 1 }}>
                            <div style={s.fieldLabelSm}>Equipment tag (only needed if you want this swapped out for an alternative)</div>
                            <input
                              defaultValue={ex.equipment ?? ""}
                              placeholder="e.g. Dumbbells — blank = always shown"
                              style={s.input}
                              onBlur={(e) => {
                                const next = [...(def.exercises ?? [])];
                                next[i] = { ...next[i], equipment: e.target.value };
                                saveDefExercises(def, next);
                              }}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={s.fieldLabelSm}>Video link</div>
                            <input
                              // Keyed on the value itself so the "Use library
                              // video" button's programmatic fill (below)
                              // actually shows up - an uncontrolled input's
                              // defaultValue only applies on mount, and this
                              // row otherwise never remounts on its own.
                              key={`video-${key}-${ex.video_url}`}
                              defaultValue={ex.video_url ?? ""}
                              placeholder="YouTube link"
                              style={s.input}
                              onBlur={(e) => {
                                const next = [...(def.exercises ?? [])];
                                next[i] = { ...next[i], video_url: e.target.value };
                                saveDefExercises(def, next);
                              }}
                            />
                            {!ex.video_url && (() => {
                              const libMatch = library.find((l) => l.name.toLowerCase() === ex.name.trim().toLowerCase() && l.video_url);
                              return libMatch ? (
                                <button
                                  style={s.useLibVideoBtn}
                                  onClick={() => {
                                    const next = [...(def.exercises ?? [])];
                                    next[i] = { ...next[i], video_url: libMatch.video_url };
                                    saveDefExercises(def, next);
                                  }}
                                >
                                  📹 Use "{ex.name}"'s library video
                                </button>
                              ) : null;
                            })()}
                          </div>
                        </div>

                        <div style={{ ...s.fieldLabelSm, marginTop: 12 }}>
                          Alternatives — each needs its own equipment tag, or it can never be picked on the public page
                        </div>
                        {(ex.alternatives ?? []).map((alt, ai) => {
                          const altKey = `${key}:${ai}`;
                          const altOpen = openAltKey === altKey;
                          const query = altOpen ? altDraft : alt.name;
                          const matches = altOpen && query.trim()
                            ? library.filter((l) => l.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
                            : [];
                          const applyLibraryEntry = (entry: LibraryEntry) => {
                            const next = [...(def.exercises ?? [])];
                            const alts = [...(next[i].alternatives ?? [])];
                            alts[ai] = {
                              ...alts[ai],
                              name: entry.name,
                              video_url: entry.video_url || alts[ai].video_url,
                              reps: entry.reps || alts[ai].reps,
                              rest: entry.rest || alts[ai].rest,
                              notes: entry.notes || alts[ai].notes,
                              sets: entry.sets ? parseInt(entry.sets) || alts[ai].sets : alts[ai].sets,
                            };
                            next[i] = { ...next[i], alternatives: alts };
                            setOpenAltKey(null);
                            saveDefExercises(def, next);
                          };
                          return (
                            <div key={ai} style={s.altRow}>
                              <div style={s.nameFieldWrap}>
                                <input
                                  value={query}
                                  placeholder="Search the exercise library, or just type a name"
                                  style={{ ...s.input, marginBottom: 6 }}
                                  onFocus={() => {
                                    setAltDraft(alt.name);
                                    setOpenAltKey(altKey);
                                  }}
                                  onChange={(e) => setAltDraft(e.target.value)}
                                  onBlur={(e) => {
                                    // Free-typed names are kept as-is — searching the
                                    // library is only ever a shortcut, never a
                                    // requirement, so nothing forces a new library
                                    // entry to get created here.
                                    setTimeout(() => setOpenAltKey(null), 150);
                                    const next = [...(def.exercises ?? [])];
                                    const alts = [...(next[i].alternatives ?? [])];
                                    alts[ai] = { ...alts[ai], name: e.target.value };
                                    next[i] = { ...next[i], alternatives: alts };
                                    saveDefExercises(def, next);
                                  }}
                                />
                                {altOpen && matches.length > 0 && (
                                  <div style={s.nameDropdown}>
                                    {matches.map((entry) => (
                                      <button
                                        key={entry.id}
                                        style={s.nameDropdownItem}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          applyLibraryEntry(entry);
                                        }}
                                      >
                                        <span>{entry.name}</span>
                                        {entry.video_url && <span style={s.nameDropdownVideoTag}>▶</span>}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                                <input
                                  defaultValue={alt.equipment}
                                  placeholder="Equipment (required to be selectable)"
                                  style={{ ...s.input, flex: 1.4 }}
                                  onBlur={(e) => {
                                    const next = [...(def.exercises ?? [])];
                                    const alts = [...(next[i].alternatives ?? [])];
                                    alts[ai] = { ...alts[ai], equipment: e.target.value };
                                    next[i] = { ...next[i], alternatives: alts };
                                    saveDefExercises(def, next);
                                  }}
                                />
                                <input
                                  type="number"
                                  min={1}
                                  defaultValue={alt.sets ?? ""}
                                  placeholder="Sets"
                                  style={{ ...s.input, width: 55 }}
                                  onBlur={(e) => {
                                    const next = [...(def.exercises ?? [])];
                                    const alts = [...(next[i].alternatives ?? [])];
                                    alts[ai] = { ...alts[ai], sets: e.target.value ? parseInt(e.target.value) : undefined };
                                    next[i] = { ...next[i], alternatives: alts };
                                    saveDefExercises(def, next);
                                  }}
                                />
                                <input
                                  defaultValue={alt.reps}
                                  placeholder="Reps"
                                  style={{ ...s.input, width: 55 }}
                                  onBlur={(e) => {
                                    const next = [...(def.exercises ?? [])];
                                    const alts = [...(next[i].alternatives ?? [])];
                                    alts[ai] = { ...alts[ai], reps: e.target.value };
                                    next[i] = { ...next[i], alternatives: alts };
                                    saveDefExercises(def, next);
                                  }}
                                />
                                <input
                                  defaultValue={alt.rest}
                                  placeholder="Rest"
                                  style={{ ...s.input, width: 60 }}
                                  onBlur={(e) => {
                                    const next = [...(def.exercises ?? [])];
                                    const alts = [...(next[i].alternatives ?? [])];
                                    alts[ai] = { ...alts[ai], rest: e.target.value };
                                    next[i] = { ...next[i], alternatives: alts };
                                    saveDefExercises(def, next);
                                  }}
                                />
                                <button
                                  style={s.smallDeleteBtn}
                                  onClick={() => {
                                    const next = [...(def.exercises ?? [])];
                                    const alts = (next[i].alternatives ?? []).filter((_, idx) => idx !== ai);
                                    next[i] = { ...next[i], alternatives: alts };
                                    saveDefExercises(def, next);
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                              <input
                                defaultValue={alt.video_url}
                                placeholder="Video link (YouTube)"
                                style={{ ...s.input, marginBottom: 6 }}
                                onBlur={(e) => {
                                  const next = [...(def.exercises ?? [])];
                                  const alts = [...(next[i].alternatives ?? [])];
                                  alts[ai] = { ...alts[ai], video_url: e.target.value };
                                  next[i] = { ...next[i], alternatives: alts };
                                  saveDefExercises(def, next);
                                }}
                              />
                              <input
                                defaultValue={alt.notes}
                                placeholder="Coach notes for this alternative (optional)"
                                style={s.input}
                                onBlur={(e) => {
                                  const next = [...(def.exercises ?? [])];
                                  const alts = [...(next[i].alternatives ?? [])];
                                  alts[ai] = { ...alts[ai], notes: e.target.value };
                                  next[i] = { ...next[i], alternatives: alts };
                                  saveDefExercises(def, next);
                                }}
                              />
                            </div>
                          );
                        })}
                        <button
                          style={s.addAltBtn}
                          onClick={() => {
                            const next = [...(def.exercises ?? [])];
                            next[i] = { ...next[i], alternatives: [...(next[i].alternatives ?? []), blankAlt()] };
                            saveDefExercises(def, next);
                          }}
                        >
                          + Add alternative
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {!(def.exercises ?? []).length && <div style={s.hint}>No exercises in this session.</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 20 },
  cardTitle: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" },
  hint: { fontSize: 12, color: "var(--mute)", lineHeight: 1.5 },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "8px 10px", fontSize: 12, marginTop: 10 },
  fieldLabel: { fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 6 },
  fieldLabelSm: { fontSize: 11, fontWeight: 700, color: "var(--mute)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" },
  expiryRow: { display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" },
  expiryBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  expiryBtnActive: { borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-dim)" },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 },
  dangerBtn: { background: "transparent", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", marginTop: 10 },
  linkRow: { display: "flex", gap: 8 },
  linkInput: { flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "monospace" },
  expiryNote: { fontSize: 11, color: "var(--mute)", marginTop: 8 },
  defBlock: { marginTop: 12 },
  defName: { fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 6 },
  exRow: { border: "1px solid var(--line)", borderRadius: 8, marginBottom: 6, overflow: "hidden" },
  exToggle: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "var(--ink)",
    border: "none",
    color: "var(--text)",
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
  },
  exToggleMeta: { fontSize: 11, fontWeight: 500, color: "var(--mute)" },
  exEditor: { padding: 12, background: "var(--panel2)" },
  input: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
    boxSizing: "border-box" as const,
  },
  altRow: { borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 8 },
  nameFieldWrap: { position: "relative" as const },
  nameDropdown: {
    position: "absolute" as const,
    top: "100%",
    left: 0,
    right: 0,
    zIndex: 10,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    marginTop: 2,
    maxHeight: 200,
    overflowY: "auto" as const,
    boxShadow: "0 8px 24px rgba(0,0,0,.4)",
  },
  nameDropdownItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    background: "transparent",
    border: "none",
    color: "var(--text)",
    padding: "8px 10px",
    fontSize: 13,
    cursor: "pointer",
    textAlign: "left" as const,
  },
  nameDropdownVideoTag: { color: "var(--accent)", fontSize: 11 },
  smallDeleteBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, width: 30, fontSize: 14, cursor: "pointer", flexShrink: 0 },
  useLibVideoBtn: { background: "transparent", border: "none", color: "var(--accent)", fontSize: 11, fontWeight: 600, cursor: "pointer", padding: "4px 0 0", textAlign: "left" as const },
  addAltBtn: { background: "transparent", border: "1px dashed var(--line)", color: "var(--accent)", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", marginTop: 10, width: "100%" },
};
