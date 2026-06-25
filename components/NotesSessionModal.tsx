"use client";

import { useState, useRef, useEffect } from "react";
import { createSession } from "@/lib/data/sessions";
import { listLibrary } from "@/lib/data/library";
import { todayISO, addDaysISO } from "@/lib/date-utils";
import SessionReviewEditor, {
  enrichWithLibrary,
  type ReviewSession,
} from "@/components/SessionReviewEditor";
import type { Session, LibraryEntry } from "@/types";

type ConvMessage = { role: "user" | "assistant"; content: string };
type Phase = "input" | "parsing" | "review" | "saving";

interface ParsedSessionFromAPI {
  name: string;
  exercises: Array<{
    name: string;
    order: string;
    matched: boolean;
    sets: number;
    reps: string;
    rest: string;
    target_load: string;
    tempo: string;
    notes: string;
    time: string;
    each_side: boolean;
  }>;
  type?: string;       // detected session type
  date?: string;       // ISO date if AI detected a specific date in the notes
  dayOffset: number;
  weekNumber: number;
}

interface Props {
  athleteId: string;
  sessionCount: number;
  onCreated: (sessions: Session[]) => void;
  onClose: () => void;
  // Optional "add to existing session" mode
  mode?: "create" | "add";
  sessionId?: string;
  onAdded?: (exercises: any[]) => void;
}

function sessionDate(startDate: string, weekNumber: number, dayOffset: number): string {
  return addDaysISO(startDate, (weekNumber - 1) * 7 + dayOffset);
}

async function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string ?? "");
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsText(file);
  });
}

async function readXlsxFile(file: File): Promise<string> {
  let XLSX: typeof import("xlsx");
  try { XLSX = await import("xlsx"); } catch {
    throw new Error('Run "npm install xlsx" in your project root first');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const text = wb.SheetNames.map((name) => {
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
          if (!csv.replace(/,/g, "").trim()) return "";
          return `Sheet: ${name}\n${csv}`;
        }).filter(Boolean).join("\n\n");
        resolve(text);
      } catch { reject(new Error("Could not parse Excel file — check it isn't password protected")); }
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsArrayBuffer(file);
  });
}

export default function NotesSessionModal({ athleteId, sessionCount, onCreated, onClose, mode = "create", sessionId, onAdded }: Props) {
  const [phase, setPhase] = useState<Phase>("input");
  const [notes, setNotes] = useState("");
  const [fileName, setFileName] = useState("");
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [sessionNames, setSessionNames] = useState<string[]>([]);
  const [aiMessage, setAiMessage] = useState("");
  const [history, setHistory] = useState<ConvMessage[]>([]);
  const [startDate, setStartDate] = useState(todayISO());
  const [correctionText, setCorrectionText] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listLibrary().then(setLibrary).catch(() => setLibrary([])).finally(() => setLibraryLoading(false));
  }, []);

  const handleFile = async (file: File) => {
    setError("");
    const ext = file.name.split(".").pop()?.toLowerCase();
    try {
      let text: string;
      if (ext === "xlsx" || ext === "xls") text = await readXlsxFile(file);
      else if (ext === "txt" || ext === "csv") text = await readTextFile(file);
      else { setError("Unsupported file type — upload a .txt or .xlsx file"); return; }
      if (!text.trim()) { setError("File appears to be empty"); return; }
      setNotes(text);
      setFileName(file.name);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read file"); }
  };

  // Convert API response sessions into ReviewSession[] with library enrichment
  const toReviewSessions = (parsed: ParsedSessionFromAPI[]): ReviewSession[] =>
    parsed.map((s) => ({
      name: s.name,
      date: s.date,
      type: s.type ?? "strength",
      dayOffset: s.dayOffset,
      weekNumber: s.weekNumber,
      exercises: enrichWithLibrary(s.exercises, library),
    }));

  const callParse = async (text: string, convHistory: ConvMessage[]) => {
    const res = await fetch("/api/notes-parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, libraryNames: library.map((e) => e.name), history: convHistory }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Parse failed");
    return data as { sessions: ParsedSessionFromAPI[]; unmatchedExercises: string[]; message: string; history: ConvMessage[] };
  };

  const handleParse = async () => {
    if (!notes.trim()) { setError("Please paste some notes or upload a file first"); return; }
    setPhase("parsing");
    setError("");
    try {
      const result = await callParse(`Parse these coaching notes into training sessions:\n\n${notes}`, []);
      const reviewSessions = toReviewSessions(result.sessions);
      setSessions(reviewSessions);
      setSessionNames(result.sessions.map((s) => s.name));
      setAiMessage(result.message);
      setHistory(result.history);
      // If AI detected a specific date for a single session, pre-fill the date picker
      if (result.sessions.length === 1 && result.sessions[0].date) {
        setStartDate(result.sessions[0].date);
      }
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse notes");
      setPhase("input");
    }
  };

  const handleCorrection = async () => {
    if (!correctionText.trim()) return;
    const capturedHistory = history;
    const capturedSessions = sessions;
    setCorrecting(true);
    setError("");
    try {
      const msg = `Correction: ${correctionText}\n\nCurrent sessions: ${JSON.stringify(capturedSessions)}`;
      const result = await callParse(msg, capturedHistory);
      const reviewSessions = toReviewSessions(result.sessions);
      setSessions(reviewSessions);
      setSessionNames(result.sessions.map((s, i) => sessionNames[i] ?? s.name));
      setAiMessage(result.message);
      setHistory(result.history);
      setCorrectionText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply correction");
    } finally { setCorrecting(false); }
  };

  const hasUnresolved = sessions.some((s) => s.exercises.some((e) => !e.matched));

  const handleSave = async () => {
    if (hasUnresolved) return;
    setPhase("saving");
    setError("");

    // Build sorted exercise inputs from all sessions
    const allExInputs = sessions.flatMap((s) =>
      [...s.exercises]
        .sort((a, b) => String(a.order ?? "").localeCompare(String(b.order ?? ""), undefined, { numeric: true }))
        .map((e) => ({
          name: e.name,
          order: e.order ?? "",  // superset label stored in order field, not notes
          sets: e.sets,
          reps: e.reps,
          rest: e.rest,
          target_load: e.target_load,
          tempo: e.tempo || "2-0-2",
          notes: e.notes,        // clean notes — no [order] suffix
          time: e.time,
          each_side: e.each_side,
          video_url: e.video_url,
        }))
    );

    try {
      // "add" mode: add exercises to existing session
      if (mode === "add" && sessionId && onAdded) {
        const { addExercisesToSession } = await import("@/lib/data/sessions");
        const newExercises = await addExercisesToSession(sessionId, allExInputs);
        onAdded(newExercises);
        return;
      }

      // "create" mode: create new sessions
      const created: Session[] = [];
      for (let i = 0; i < sessions.length; i++) {
        const s = sessions[i];
        const date = (s as any).date ?? sessionDate(startDate, s.weekNumber, s.dayOffset);
        const name = sessionNames[i]?.trim() || s.name || `Session ${sessionCount + i + 1}`;
        const exInputs = [...s.exercises]
          .sort((a, b) => String(a.order ?? "").localeCompare(String(b.order ?? ""), undefined, { numeric: true }))
          .map((e) => ({
            name: e.name, order: e.order ?? "", sets: e.sets, reps: e.reps, rest: e.rest,
            target_load: e.target_load, tempo: e.tempo || "2-0-2",
            notes: e.notes,
            time: e.time, each_side: e.each_side, video_url: e.video_url,
          }));
        const sessionType = ((s as any).type ?? "strength") as any;
        const session = await createSession(athleteId, sessionType, date, name, exInputs);
        created.push(session);
      }
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save sessions");
      setPhase("review");
    }
  };

  const handleReset = () => {
    setPhase("input"); setNotes(""); setFileName(""); setSessions([]);
    setSessionNames([]); setAiMessage(""); setHistory([]);
    setCorrectionText(""); setError("");
  };

  const weekCount = sessions.length ? Math.max(...sessions.map((s) => s.weekNumber)) : 0;

  return (
    <>
      <style>{`@keyframes athletiq-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      <div style={s.overlay} onClick={onClose}>
        <div style={s.modal} onClick={(e) => e.stopPropagation()}>

          <div style={s.header}>
            <span style={s.title}>📝 Generate sessions from notes</span>
            <button style={s.closeBtn} onClick={onClose}>×</button>
          </div>

          {error && <div style={s.errorBox}>{error}</div>}

          {/* INPUT */}
          {phase === "input" && (
            <>
              <p style={s.hint}>Paste coaching notes, a training plan, or upload an Excel spreadsheet. Claude will detect how many sessions are described and structure them ready to review.</p>
              <input ref={fileRef} type="file" accept=".txt,.xlsx,.xls,.csv" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
              <div style={s.uploadRow}>
                <button style={s.uploadBtn} onClick={() => fileRef.current?.click()}>📎 Upload .txt or .xlsx</button>
                {fileName && (
                  <span style={s.fileName}>{fileName}
                    <button style={s.clearFile} onClick={() => { setNotes(""); setFileName(""); }}>×</button>
                  </span>
                )}
              </div>
              <textarea value={notes} onChange={(e) => { setNotes(e.target.value); setFileName(""); }}
                placeholder={"Paste your notes here…\n\ne.g.\nWeek 1 - Upper A\nBack Squat 4x6 @ 80kg, rest 3min\nBench Press 3x8 @ 60kg, rest 90s\n\nWeek 1 - Lower A\nDeadlift 4x4 @ 100kg, rest 3min"}
                style={s.textarea} />
              <button style={{ ...s.parseBtn, opacity: !notes.trim() || libraryLoading ? 0.5 : 1, cursor: !notes.trim() || libraryLoading ? "not-allowed" : "pointer" }}
                disabled={!notes.trim() || libraryLoading} onClick={handleParse}>
                {libraryLoading ? "Loading library…" : "✨ Generate sessions"}
              </button>
            </>
          )}

          {/* PARSING */}
          {phase === "parsing" && (
            <div style={s.centre}>
              <div style={{ fontSize: 28, color: "var(--accent)", animation: "athletiq-spin 0.9s linear infinite", display: "inline-block" }}>⟳</div>
              <div style={s.spinLabel}>Parsing your notes…</div>
            </div>
          )}

          {/* REVIEW */}
          {phase === "review" && (
            <>
              {/* Summary */}
              <div style={s.summaryBar}>
                <span style={s.summaryBadge}>{sessions.length} session{sessions.length !== 1 ? "s" : ""}{weekCount > 1 ? ` · ${weekCount} weeks` : ""}</span>
                {aiMessage && <span style={s.summaryMsg}>{aiMessage}</span>}
              </div>

              {/* Start date */}
              <div style={s.dateRow}>
                <div style={s.fieldLabel}>{sessions.length === 1 ? "Session date" : "Programme start date"}</div>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={s.dateInput} />
                {sessions.length > 1 && <span style={s.dateHint}>Sessions placed on their detected days from this date</span>}
              </div>

              {/* Session name editors (multi-session) */}
              {sessions.length > 1 && (
                <div style={s.sessionNameList}>
                  {sessions.map((sess, si) => (
                    <div key={si} style={s.sessionNameRow}>
                      <input
                        value={sessionNames[si] ?? sess.name}
                        onChange={(e) => setSessionNames((prev) => { const n = [...prev]; n[si] = e.target.value; return n; })}
                        style={s.sessionNameInput}
                      />
                      <span style={s.sessionDateLabel}>
                        {(sess as any).date ?? sessionDate(startDate, sess.weekNumber, sess.dayOffset)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Inline editor */}
              <SessionReviewEditor
                sessions={sessions}
                onChange={setSessions}
                library={library}
                onLibraryEntryCreated={(entry) => setLibrary((prev) => [...prev, entry])}
              />

              {/* Text correction */}
              <div style={s.corrArea}>
                <div style={s.fieldLabel}>Correct something</div>
                <div style={s.corrRow}>
                  <input value={correctionText} onChange={(e) => setCorrectionText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && correctionText.trim()) { e.preventDefault(); handleCorrection(); } }}
                    placeholder='e.g. "session 1 exercise 2 should be 5 sets not 3"'
                    style={s.corrInput} disabled={correcting} />
                  <button style={{ ...s.corrApplyBtn, opacity: !correctionText.trim() || correcting ? 0.5 : 1, cursor: !correctionText.trim() || correcting ? "not-allowed" : "pointer" }}
                    disabled={!correctionText.trim() || correcting} onClick={handleCorrection}>
                    {correcting ? <span style={{ animation: "athletiq-spin 0.9s linear infinite", display: "inline-block" }}>⟳</span> : "Apply"}
                  </button>
                </div>
              </div>

              <div style={s.actions}>
                <button style={s.resetBtn} onClick={handleReset}>Start over</button>
                <button
                  style={{ ...s.saveBtn, opacity: hasUnresolved || sessions.length === 0 ? 0.45 : 1, cursor: hasUnresolved ? "not-allowed" : "pointer" }}
                  disabled={hasUnresolved || sessions.length === 0}
                  onClick={handleSave}
                  title={hasUnresolved ? "Resolve all ⚠️ exercises first" : ""}
                >
                  ✓ Save {sessions.length} session{sessions.length !== 1 ? "s" : ""} to calendar
                </button>
              </div>
            </>
          )}

          {/* SAVING */}
          {phase === "saving" && (
            <div style={s.centre}>
              <div style={{ fontSize: 28, color: "var(--accent)", animation: "athletiq-spin 0.9s linear infinite", display: "inline-block" }}>⟳</div>
              <div style={s.spinLabel}>Saving {sessions.length} session{sessions.length !== 1 ? "s" : ""}…</div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--text)" },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 22, cursor: "pointer", padding: "0 4px", lineHeight: 1 },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  hint: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5, margin: 0 },
  uploadRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const },
  uploadBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  fileName: { fontSize: 12, color: "var(--accent)", display: "flex", alignItems: "center", gap: 6 },
  clearFile: { background: "transparent", border: "none", color: "var(--mute)", cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 },
  textarea: { width: "100%", minHeight: 180, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "12px 14px", fontSize: 13, lineHeight: 1.6, resize: "vertical" as const, fontFamily: "inherit" },
  parseBtn: { width: "100%", background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "13px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  centre: { display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "20px 0", textAlign: "center" },
  spinLabel: { fontSize: 14, color: "var(--mute)", fontWeight: 600 },
  summaryBar: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" as const },
  summaryBadge: { background: "var(--accent-dim)", color: "var(--accent)", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 700 },
  summaryMsg: { fontSize: 13, color: "var(--mute)" },
  dateRow: { display: "flex", flexDirection: "column" as const, gap: 4 },
  fieldLabel: { fontSize: 11, color: "var(--mute)", fontWeight: 600, textTransform: "uppercase" as const },
  dateInput: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14, alignSelf: "flex-start" },
  dateHint: { fontSize: 11, color: "var(--mute)", fontStyle: "italic" as const },
  sessionNameList: { display: "flex", flexDirection: "column" as const, gap: 6 },
  sessionNameRow: { display: "flex", alignItems: "center", gap: 10 },
  sessionNameInput: { flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontWeight: 700 },
  sessionDateLabel: { fontSize: 12, color: "var(--mute)", flexShrink: 0 },
  corrArea: { borderTop: "1px solid var(--line)", paddingTop: 12, display: "flex", flexDirection: "column" as const, gap: 6 },
  corrRow: { display: "flex", gap: 8 },
  corrInput: { flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 13 },
  corrApplyBtn: { background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  actions: { display: "flex", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 14 },
  resetBtn: { flex: 1, background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  saveBtn: { flex: 2, background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" },
};
