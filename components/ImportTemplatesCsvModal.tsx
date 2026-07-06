"use client";

// Bulk-imports one or more programme templates from a single CSV. Reuses
// SessionReviewEditor for the same preview-and-fix experience the Voice/Notes
// template-creation flows already use, composed once per detected template so
// SessionReviewEditor's own cross-session propagation (for inline field
// edits) stays scoped within a template rather than crossing between
// unrelated ones.

import { useEffect, useRef, useState } from "react";
import { parseTemplatesCsv, type ImportReviewSession } from "@/lib/templates-csv-import";
import { listLibrary } from "@/lib/data/library";
import { createTemplate, addTemplateDef, updateTemplateDef, updateTemplate, deleteTemplate } from "@/lib/data/templates";
import SessionReviewEditor, { type ReviewExercise } from "@/components/SessionReviewEditor";
import type { LibraryEntry, PrescribedExercise, SessionType } from "@/types";

type Phase = "select" | "parsing" | "review" | "saving" | "done";

interface TemplateState {
  name: string;
  included: boolean;
  sessions: ImportReviewSession[];
  includedSessionIdx: Set<number>;
}

interface DoneResult {
  name: string;
  ok: boolean;
  sessionCount: number;
  error?: string;
}

function stripExercise(e: ReviewExercise): PrescribedExercise {
  return {
    id: crypto.randomUUID(),
    name: e.name,
    order: e.order,
    sets: e.sets,
    reps: e.reps,
    time: e.time,
    rest: e.rest,
    target_load: e.target_load,
    tempo: e.tempo,
    each_side: e.each_side,
    notes: e.notes,
    video_url: e.video_url,
    rpe: e.rpe ?? null,
    percent_1rm: e.percent_1rm ?? null,
  };
}

export default function ImportTemplatesCsvModal({ onCreated, onClose }: {
  onCreated: () => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("select");
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [templates, setTemplates] = useState<TemplateState[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [results, setResults] = useState<DoneResult[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listLibrary().then(setLibrary).catch(() => {}).finally(() => setLibraryLoading(false));
  }, []);

  const handleFile = async (file: File) => {
    setPhase("parsing");
    setError("");
    try {
      const result = await parseTemplatesCsv(file, library);
      if (!result.templates.length) {
        setError("No valid rows found — check the Template Name / Session Name / Exercise Name columns are present.");
        setPhase("select");
        return;
      }
      setTemplates(
        result.templates.map((t) => ({
          name: t.name,
          included: true,
          sessions: t.sessions,
          includedSessionIdx: new Set(t.sessions.map((_, i) => i)),
        }))
      );
      setParseErrors(result.parseErrors);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that CSV");
      setPhase("select");
    }
  };

  // SessionReviewEditor's own "apply to all sessions?" propagation only
  // covers inline field edits — resolving an exercise via the library
  // picker (map to existing, or create new) never propagates to sibling
  // exercises of the same name. That matters far more here than for a
  // single notes-paste, since the same exercise name is likely to recur
  // across many session rows in one CSV. Detect a newly-matched exercise
  // by diffing against the pre-update state, then propagate it to every
  // other unmatched exercise sharing that name across ALL templates.
  const handleTemplateSessionsChange = (templateIdx: number, updated: ImportReviewSession[]) => {
    setTemplates((prev) => {
      const current = prev[templateIdx];
      const newlyMatched: { name: string; libraryId: string | null; video_url: string; tempo: string }[] = [];
      updated.forEach((sess, si) => {
        sess.exercises.forEach((ex, ei) => {
          const before = current.sessions[si]?.exercises[ei];
          if (ex.matched && before && !before.matched) {
            newlyMatched.push({ name: ex.name, libraryId: ex.libraryId, video_url: ex.video_url, tempo: ex.tempo });
          }
        });
      });

      let next = prev.map((t, i) => (i === templateIdx ? { ...t, sessions: updated } : t));

      for (const match of newlyMatched) {
        next = next.map((t) => ({
          ...t,
          sessions: t.sessions.map((sess) => ({
            ...sess,
            exercises: sess.exercises.map((ex) =>
              !ex.matched && ex.name.toLowerCase() === match.name.toLowerCase()
                ? { ...ex, matched: true, libraryId: match.libraryId, video_url: match.video_url, tempo: ex.tempo || match.tempo }
                : ex
            ),
          })),
        }));
      }
      return next;
    });
  };

  const handleLibraryEntryCreated = (entry: LibraryEntry) => {
    setLibrary((prev) => [...prev, entry]);
  };

  const toggleTemplateIncluded = (ti: number) => {
    setTemplates((prev) => prev.map((t, i) => (i === ti ? { ...t, included: !t.included } : t)));
  };

  const toggleSessionIncluded = (ti: number, si: number) => {
    setTemplates((prev) =>
      prev.map((t, i) => {
        if (i !== ti) return t;
        const next = new Set(t.includedSessionIdx);
        if (next.has(si)) next.delete(si);
        else next.add(si);
        return { ...t, includedSessionIdx: next };
      })
    );
  };

  const setTemplateName = (ti: number, name: string) => {
    setTemplates((prev) => prev.map((t, i) => (i === ti ? { ...t, name } : t)));
  };

  const hasUnresolved = templates.some(
    (t) =>
      t.included &&
      t.sessions.some((sess, si) => t.includedSessionIdx.has(si) && sess.exercises.some((e) => !e.matched))
  );
  const includedTemplateCount = templates.filter((t) => t.included).length;

  const handleSave = async () => {
    if (hasUnresolved) return;
    setPhase("saving");
    const outcomes: DoneResult[] = [];

    for (const t of templates) {
      if (!t.included) continue;
      const includedSessions = t.sessions.filter((_, si) => t.includedSessionIdx.has(si));
      if (!includedSessions.length) continue;

      let templateId: string | null = null;
      try {
        const created = await createTemplate();
        templateId = created.id;
        const def0 = created.defs![0];

        await updateTemplateDef(def0.id, {
          name: includedSessions[0].name,
          type: includedSessions[0].type as SessionType,
          days: includedSessions[0].days,
          exercises: includedSessions[0].exercises.map(stripExercise),
        });

        for (let i = 1; i < includedSessions.length; i++) {
          const sess = includedSessions[i];
          const def = await addTemplateDef(templateId, i);
          await updateTemplateDef(def.id, {
            name: sess.name,
            type: sess.type as SessionType,
            days: sess.days,
            exercises: sess.exercises.map(stripExercise),
          });
        }

        await updateTemplate(templateId, { name: t.name });
        outcomes.push({ name: t.name, ok: true, sessionCount: includedSessions.length });
      } catch (e) {
        if (templateId) {
          try {
            await deleteTemplate(templateId);
          } catch {
            // best-effort rollback — leave the partial template for manual cleanup
          }
        }
        outcomes.push({
          name: t.name,
          ok: false,
          sessionCount: includedSessions.length,
          error: e instanceof Error ? e.message : "Import failed",
        });
      }
    }

    setResults(outcomes);
    setPhase("done");
  };

  return (
    <>
      <style>{`@keyframes tcsv-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      <div style={s.overlay} onClick={onClose}>
        <div style={s.modal} onClick={(e) => e.stopPropagation()}>
          <div style={s.header}>
            <span style={s.title}>📄 Import templates from CSV</span>
            <button style={s.closeBtn} onClick={onClose}>×</button>
          </div>
          {error && <div style={s.errorBox}>{error}</div>}

          {phase === "select" && (
            <>
              <p style={s.hint}>
                Import one or more programme templates from a single CSV. Required columns: Template
                Name, Session Name, Exercise Name. Optional: Week, Days (e.g. &quot;Mon,Wed,Fri&quot;),
                Type, Order (e.g. &quot;1A&quot;/&quot;1B&quot; for supersets), Sets, Reps, Rest, Tempo,
                Load, RPE, %1RM, Each Side, Notes, Video URL.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/comma-separated-values,application/csv,application/vnd.ms-excel"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <button
                style={{ ...s.primaryBtn, opacity: libraryLoading ? 0.5 : 1 }}
                disabled={libraryLoading}
                onClick={() => fileRef.current?.click()}
              >
                {libraryLoading ? "Loading library…" : "Choose CSV file…"}
              </button>
            </>
          )}

          {phase === "parsing" && (
            <div style={s.centre}>
              <div style={s.spinner}>⟳</div>
              <div style={s.spinLabel}>Reading CSV…</div>
            </div>
          )}

          {phase === "review" && (
            <>
              {parseErrors.length > 0 && (
                <div style={s.parseErrorsBox}>
                  <div style={s.parseErrorsTitle}>
                    {parseErrors.length} row{parseErrors.length !== 1 ? "s" : ""} need attention
                  </div>
                  <ul style={s.parseErrorsList}>
                    {parseErrors.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}

              {templates.map((t, ti) => (
                <div key={ti} style={s.templateBlock}>
                  <div style={s.templateHeader}>
                    <label style={s.checkboxLabel}>
                      <input type="checkbox" checked={t.included} onChange={() => toggleTemplateIncluded(ti)} />
                    </label>
                    <input
                      value={t.name}
                      onChange={(e) => setTemplateName(ti, e.target.value)}
                      style={{ ...s.input, flex: 1, opacity: t.included ? 1 : 0.5 }}
                    />
                    <span style={s.templateMeta}>
                      {t.sessions.length} session{t.sessions.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {t.included && (
                    <>
                      {t.sessions.length > 1 && (
                        <div style={s.sessionToggleRow}>
                          {t.sessions.map((sess, si) => (
                            <label key={si} style={s.sessionToggle}>
                              <input
                                type="checkbox"
                                checked={t.includedSessionIdx.has(si)}
                                onChange={() => toggleSessionIncluded(ti, si)}
                              />
                              {sess.name}
                            </label>
                          ))}
                        </div>
                      )}
                      <SessionReviewEditor
                        sessions={t.sessions}
                        onChange={(updated) => handleTemplateSessionsChange(ti, updated as ImportReviewSession[])}
                        library={library}
                        onLibraryEntryCreated={handleLibraryEntryCreated}
                      />
                    </>
                  )}
                </div>
              ))}

              <div style={s.actions}>
                <button
                  style={s.ghostBtn}
                  onClick={() => {
                    setPhase("select");
                    setTemplates([]);
                    setParseErrors([]);
                  }}
                >
                  Start over
                </button>
                <button
                  style={{
                    ...s.primaryBtn,
                    flex: 2,
                    opacity: hasUnresolved || !includedTemplateCount ? 0.45 : 1,
                    cursor: hasUnresolved || !includedTemplateCount ? "not-allowed" : "pointer",
                  }}
                  disabled={hasUnresolved || !includedTemplateCount}
                  onClick={handleSave}
                >
                  ✓ Import {includedTemplateCount} template{includedTemplateCount !== 1 ? "s" : ""}
                </button>
              </div>
            </>
          )}

          {phase === "saving" && (
            <div style={s.centre}>
              <div style={s.spinner}>⟳</div>
              <div style={s.spinLabel}>Importing templates…</div>
            </div>
          )}

          {phase === "done" && (
            <>
              <div style={s.doneList}>
                {results.map((r, i) => (
                  <div key={i} style={s.doneRow}>
                    <span style={{ color: r.ok ? "var(--good)" : "#FF6B6B" }}>{r.ok ? "✓" : "✗"}</span>
                    <span style={{ flex: 1 }}>{r.name}</span>
                    <span style={s.templateMeta}>
                      {r.ok ? `${r.sessionCount} session${r.sessionCount !== 1 ? "s" : ""}` : r.error}
                    </span>
                  </div>
                ))}
              </div>
              <button style={s.primaryBtn} onClick={onCreated}>
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--text)" },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 22, cursor: "pointer", padding: "0 4px" },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  hint: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5, margin: 0 },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", width: "100%" },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  centre: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 0", textAlign: "center" },
  spinner: { fontSize: 28, color: "var(--accent)", display: "inline-block", animation: "tcsv-spin 0.9s linear infinite" },
  spinLabel: { fontSize: 14, color: "var(--mute)", fontWeight: 600 },
  input: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14 },
  parseErrorsBox: { background: "#1a1200", border: "1px solid #f5a62344", color: "#f5a623", borderRadius: 8, padding: "10px 12px", fontSize: 12 },
  parseErrorsTitle: { fontWeight: 700, marginBottom: 4 },
  parseErrorsList: { margin: 0, paddingLeft: 18, lineHeight: 1.6 },
  templateBlock: { display: "flex", flexDirection: "column", gap: 10, border: "1px solid var(--line)", borderRadius: 12, padding: 12 },
  templateHeader: { display: "flex", alignItems: "center", gap: 8 },
  checkboxLabel: { display: "flex", alignItems: "center" },
  templateMeta: { fontSize: 11, color: "var(--mute)", whiteSpace: "nowrap" as const },
  sessionToggleRow: { display: "flex", flexWrap: "wrap" as const, gap: 10 },
  sessionToggle: { display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--mute)" },
  actions: { display: "flex", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 14 },
  doneList: { display: "flex", flexDirection: "column", gap: 6 },
  doneRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--line)" },
};
