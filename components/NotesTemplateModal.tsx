"use client";

// Generates a template (with one or more template_defs) from pasted notes or
// an uploaded .txt / .xlsx file. Reuses /api/notes-parse for parsing,
// SessionReviewEditor for review/edit, then saves to the template library.

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createTemplate, addTemplateDef, updateTemplateDef } from "@/lib/data/templates";
import { listLibrary } from "@/lib/data/library";
import { enrichWithLibrary, type ReviewSession } from "@/components/SessionReviewEditor";
import SessionReviewEditor from "@/components/SessionReviewEditor";
import type { LibraryEntry } from "@/types";

type ConvMessage = { role: "user" | "assistant"; content: string };
type Phase = "input" | "parsing" | "review" | "saving";

async function readTextFile(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = (e) => res(e.target?.result as string ?? "");
    r.onerror = () => rej(new Error("Could not read file"));
    r.readAsText(file);
  });
}

async function readXlsxFile(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: "array" });
        const text = wb.SheetNames.map((n) => {
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[n]);
          return csv.replace(/,/g, "").trim() ? `Sheet: ${n}\n${csv}` : "";
        }).filter(Boolean).join("\n\n");
        res(text);
      } catch { rej(new Error("Could not parse Excel file")); }
    };
    r.onerror = () => rej(new Error("Could not read file"));
    r.readAsArrayBuffer(file);
  });
}

export default function NotesTemplateModal({ onCreated, onClose }: {
  onCreated: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("input");
  const [notes, setNotes] = useState("");
  const [fileName, setFileName] = useState("");
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [sessionNames, setSessionNames] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState("New template");
  const [aiMessage, setAiMessage] = useState("");
  const [history, setHistory] = useState<ConvMessage[]>([]);
  const [corrText, setCorrText] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listLibrary().then(setLibrary).catch(() => {}).finally(() => setLibraryLoading(false));
  }, []);

  const handleFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    try {
      const text = ext === "xlsx" || ext === "xls"
        ? await readXlsxFile(file)
        : await readTextFile(file);
      if (!text.trim()) { setError("File appears empty"); return; }
      setNotes(text);
      setFileName(file.name);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read file"); }
  };

  const callParse = async (text: string, convHistory: ConvMessage[]) => {
    const res = await fetch("/api/notes-parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, libraryNames: library.map((l) => l.name), history: convHistory }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Parse failed");
    return data;
  };

  const handleParse = async () => {
    if (!notes.trim()) { setError("Paste notes or upload a file first"); return; }
    setPhase("parsing");
    setError("");
    try {
      const result = await callParse(`Parse these template sessions:\n\n${notes}`, []);
      setSessions(result.sessions.map((s: any) => ({
        name: s.name, dayOffset: s.dayOffset, weekNumber: s.weekNumber,
        exercises: enrichWithLibrary(s.exercises, library),
      })));
      setSessionNames(result.sessions.map((s: any) => s.name));
      setAiMessage(result.message);
      setHistory(result.history);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse");
      setPhase("input");
    }
  };

  const handleCorrection = async () => {
    if (!corrText.trim()) return;
    setCorrecting(true);
    try {
      const result = await callParse(`Correction: ${corrText}\n\nCurrent sessions: ${JSON.stringify(sessions)}`, history);
      setSessions(result.sessions.map((s: any) => ({
        name: s.name, dayOffset: s.dayOffset, weekNumber: s.weekNumber,
        exercises: enrichWithLibrary(s.exercises, library),
      })));
      setAiMessage(result.message);
      setHistory(result.history);
      setCorrText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply correction");
    } finally { setCorrecting(false); }
  };

  const hasUnresolved = sessions.some((s) => s.exercises.some((e) => !e.matched));

  const handleSave = async () => {
    if (hasUnresolved) return;
    setPhase("saving");
    setError("");
    try {
      const template = await createTemplate();
      // Update first def
      await updateTemplateDef(template.defs![0].id, {
        name: sessionNames[0] ?? sessions[0]?.name ?? "Session 1",
        exercises: (sessions[0]?.exercises ?? []).map((e, i) => ({ ...e, order: String(i + 1) })) as any,
      });
      // Add additional defs
      for (let i = 1; i < sessions.length; i++) {
        const def = await addTemplateDef(template.id, i);
        await updateTemplateDef(def.id, {
          name: sessionNames[i] ?? sessions[i].name,
          exercises: sessions[i].exercises.map((e, j) => ({ ...e, order: String(j + 1) })) as any,
        });
      }
      // Update template name
      const supabase = (await import("@/lib/supabase-browser")).createClient();
      await supabase.from("templates").update({ name: templateName }).eq("id", template.id);
      onCreated();
      router.push(`/templates/${template.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save template");
      setPhase("review");
    }
  };

  return (
    <>
      <style>{`@keyframes nt-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      <div style={s.overlay} onClick={onClose}>
        <div style={s.modal} onClick={(e) => e.stopPropagation()}>
          <div style={s.header}>
            <span style={s.title}>📝 New template from notes</span>
            <button style={s.closeBtn} onClick={onClose}>×</button>
          </div>
          {error && <div style={s.errorBox}>{error}</div>}

          {phase === "input" && (
            <>
              <p style={s.hint}>Paste a training plan or upload an Excel file. Claude will detect sessions and structure them into a reusable template.</p>
              <input ref={fileRef} type="file" accept=".txt,.xlsx,.xls,.csv" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
              <div style={s.uploadRow}>
                <button style={s.ghostBtn} onClick={() => fileRef.current?.click()}>📎 Upload .txt or .xlsx</button>
                {fileName && <span style={{ fontSize: 12, color: "var(--accent)" }}>{fileName}
                  <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--mute)", fontSize: 14 }}
                    onClick={() => { setNotes(""); setFileName(""); }}>×</button>
                </span>}
              </div>
              <textarea value={notes} onChange={(e) => { setNotes(e.target.value); setFileName(""); }}
                placeholder={"Paste your template here…\n\ne.g.\nUpper A\nBench Press 4x6 @ 80kg\nBent Row 4x8\n\nLower A\nSquat 4x6 @ 100kg\nRDL 3x10"}
                style={s.textarea} />
              <button style={{ ...s.primaryBtn, opacity: !notes.trim() || libraryLoading ? 0.5 : 1 }}
                disabled={!notes.trim() || libraryLoading} onClick={handleParse}>
                {libraryLoading ? "Loading library…" : "✨ Generate template"}
              </button>
            </>
          )}

          {phase === "parsing" && (
            <div style={s.centre}>
              <div style={{ fontSize: 28, color: "var(--accent)", animation: "nt-spin 0.9s linear infinite", display: "inline-block" }}>⟳</div>
              <div style={s.spinLabel}>Parsing…</div>
            </div>
          )}

          {phase === "review" && (
            <>
              <div style={s.metaRow}>
                <div style={{ flex: 1 }}>
                  <div style={s.fieldLabel}>Template name</div>
                  <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} style={s.input} />
                </div>
              </div>
              {sessions.length > 1 && (
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                  <div style={s.fieldLabel}>{sessions.length} sessions detected — names editable</div>
                  {sessions.map((s2, i) => (
                    <input key={i} value={sessionNames[i] ?? s2.name}
                      onChange={(e) => setSessionNames((prev) => { const n = [...prev]; n[i] = e.target.value; return n; })}
                      style={s.input} />
                  ))}
                </div>
              )}
              {aiMessage && <div style={s.aiMsg}>{aiMessage}</div>}
              <SessionReviewEditor sessions={sessions} onChange={setSessions}
                library={library} onLibraryEntryCreated={(e) => setLibrary((p) => [...p, e])} />
              <div style={s.corrRow}>
                <input value={corrText} onChange={(e) => setCorrText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && corrText.trim()) handleCorrection(); }}
                  placeholder='Correct something, e.g. "session 1 exercise 2 should be 5 sets"'
                  style={{ ...s.input, flex: 1 }} disabled={correcting} />
                <button style={{ ...s.ghostBtn, opacity: !corrText.trim() || correcting ? 0.5 : 1 }}
                  disabled={!corrText.trim() || correcting} onClick={handleCorrection}>
                  {correcting ? "…" : "Apply"}
                </button>
              </div>
              <div style={s.actions}>
                <button style={s.ghostBtn} onClick={() => { setPhase("input"); setSessions([]); setHistory([]); }}>Start over</button>
                <button style={{ ...s.primaryBtn, flex: 2, opacity: hasUnresolved ? 0.45 : 1, cursor: hasUnresolved ? "not-allowed" : "pointer" }}
                  disabled={hasUnresolved} onClick={handleSave}>
                  ✓ Save template ({sessions.length} session{sessions.length !== 1 ? "s" : ""})
                </button>
              </div>
            </>
          )}

          {phase === "saving" && (
            <div style={s.centre}>
              <div style={{ fontSize: 28, color: "var(--accent)", animation: "nt-spin 0.9s linear infinite", display: "inline-block" }}>⟳</div>
              <div style={s.spinLabel}>Saving template…</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--text)" },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 22, cursor: "pointer", padding: "0 4px" },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  hint: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5, margin: 0 },
  uploadRow: { display: "flex", alignItems: "center", gap: 10 },
  textarea: { width: "100%", minHeight: 160, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "10px 12px", fontSize: 13, lineHeight: 1.6, resize: "vertical" as const, fontFamily: "inherit" },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", width: "100%" },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  centre: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 0", textAlign: "center" },
  spinLabel: { fontSize: 14, color: "var(--mute)", fontWeight: 600 },
  metaRow: { display: "flex", gap: 10 },
  fieldLabel: { fontSize: 11, color: "var(--mute)", fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 4 },
  input: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14 },
  aiMsg: { fontSize: 13, color: "var(--accent)", background: "var(--accent-dim)", borderRadius: 8, padding: "8px 12px" },
  corrRow: { display: "flex", gap: 8 },
  actions: { display: "flex", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 14 },
};
