"use client";

// ─────────────────────────────────────────────────────────────────────────────
// VoiceSessionModal — Whisper edition
//
// Modes:
//   "new"       — creates a new Session on the athlete's calendar
//   "add"       — appends exercises to an existing session
//   "template"  — creates a new Template in the template library
//   "programme" — creates a new Programme in the programme library
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { createSession } from "@/lib/data/sessions";
import { createTemplate, addTemplateDef, updateTemplateDef } from "@/lib/data/templates";
import { createProgramme, addProgrammeSession } from "@/lib/data/programmes";
import { listLibrary } from "@/lib/data/library";
import { todayISO } from "@/lib/date-utils";
import SessionReviewEditor, {
  enrichWithLibrary,
  type ReviewSession,
} from "@/components/SessionReviewEditor";
import type { Session, SessionExercise, LibraryEntry } from "@/types";

export interface ParsedExercise {
  name: string;
  sets: number;
  reps: string;
  rest: string;
  target_load: string;
  tempo: string;
  notes: string;
  time: string;
  each_side: boolean;
}

type ConvMessage = { role: "user" | "assistant"; content: string };
type Phase = "idle" | "recording" | "transcribing" | "parsing" | "review" | "saving";

interface Props {
  mode: "new" | "add" | "template" | "programme";
  // mode="new"
  athleteId?: string;
  sessionCount?: number;
  onCreated?: (session: Session) => void;
  // mode="add"
  sessionId?: string;
  exerciseCount?: number;
  onAdded?: (exercises: SessionExercise[]) => void;
  // shared
  onClose: () => void;
}

function formatTime(s: number): string {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

function getBestMimeType(): string {
  return ["audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

const TITLE: Record<Props["mode"], string> = {
  new: "🎤 New session by voice",
  add: "🎤 Add exercises by voice",
  template: "🎤 New template by voice",
  programme: "🎤 New programme by voice",
};

export default function VoiceSessionModal({
  mode, athleteId, sessionCount = 0, onCreated,
  sessionId, exerciseCount = 0, onAdded, onClose,
}: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [history, setHistory] = useState<ConvMessage[]>([]);
  const [aiMessage, setAiMessage] = useState("");
  const [error, setError] = useState("");
  const [sessionName, setSessionName] = useState(`Session ${sessionCount + 1}`);
  const [sessionDate, setSessionDate] = useState(todayISO());
  const [correcting, setCorrecting] = useState(false);
  const [corrElapsed, setCorrElapsed] = useState(0);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [detectedType, setDetectedType] = useState<string>("strength");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const corrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    listLibrary().then(setLibrary).catch(() => {});
    return () => {
      timerRef.current && clearInterval(timerRef.current);
      corrTimerRef.current && clearInterval(corrTimerRef.current);
      recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toReviewSessions = (exercises: ParsedExercise[]): ReviewSession[] => [{
    name: sessionName,
    dayOffset: 0,
    weekNumber: 1,
    exercises: enrichWithLibrary(exercises, library),
  }];

  const transcribeBlob = async (blob: Blob): Promise<string> => {
    const form = new FormData();
    form.append("audio", blob, "recording.webm");
    const res = await fetch("/api/voice-transcribe", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Transcription failed");
    return data.transcript ?? "";
  };

  const callParse = async (transcript: string, convHistory: ConvMessage[]) => {
    const res = await fetch("/api/voice-parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, history: convHistory }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Parse failed");
    return data as { exercises: ParsedExercise[]; session_type?: string; history: ConvMessage[]; message: string };
  };

  const startMediaRecorder = async (
    onStop: (blob: Blob) => Promise<void>,
    onErr: (msg: string) => void
  ): Promise<MediaRecorder | null> => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onErr("Could not access microphone — please allow microphone permission and try again.");
      return null;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    const mimeType = getBestMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      await onStop(new Blob(chunksRef.current, { type: mimeType || "audio/webm" }));
    };
    recorder.onerror = () => onErr("Recording error — please try again.");
    recorder.start();
    return recorder;
  };

  const startRecording = async () => {
    setError("");
    const recorder = await startMediaRecorder(
      async (blob) => {
        setPhase("transcribing");
        let transcript: string;
        try { transcript = await transcribeBlob(blob); }
        catch (e) { setError(e instanceof Error ? e.message : "Transcription failed"); setPhase("idle"); return; }
        if (!transcript.trim()) { setError("No speech detected — please try again."); setPhase("idle"); return; }
        setPhase("parsing");
        try {
          const result = await callParse(`Parse this ${mode === "template" ? "template" : mode === "programme" ? "programme" : "strength & conditioning session"}: ${transcript}`, []);
          setSessions(toReviewSessions(result.exercises));
          setHistory(result.history);
          setAiMessage(result.message);
          if (result.session_type) setDetectedType(result.session_type);
          setPhase("review");
        } catch (e) { setError(e instanceof Error ? e.message : "Could not parse"); setPhase("idle"); }
      },
      (msg) => { setError(msg); setPhase("idle"); }
    );
    if (!recorder) return;
    setPhase("recording");
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
  };

  const stopRecording = () => {
    timerRef.current && clearInterval(timerRef.current);
    timerRef.current = null;
    recorderRef.current?.stop();
  };

  const startCorrection = async () => {
    setError("");
    const capturedHistory = history;
    const capturedExercises = sessions[0]?.exercises ?? [];
    const recorder = await startMediaRecorder(
      async (blob) => {
        setCorrecting(false);
        corrTimerRef.current && clearInterval(corrTimerRef.current);
        let transcript: string;
        try { transcript = await transcribeBlob(blob); }
        catch (e) { setError(e instanceof Error ? e.message : "Transcription failed"); return; }
        if (!transcript.trim()) return;
        setPhase("parsing");
        try {
          const result = await callParse(`Correction: ${transcript}\n\nCurrent exercises: ${JSON.stringify(capturedExercises)}`, capturedHistory);
          setSessions(toReviewSessions(result.exercises));
          setHistory(result.history);
          setAiMessage(result.message);
          setPhase("review");
        } catch (e) { setError(e instanceof Error ? e.message : "Could not apply correction"); setPhase("review"); }
      },
      (msg) => { setCorrecting(false); corrTimerRef.current && clearInterval(corrTimerRef.current); setError(msg); }
    );
    if (!recorder) return;
    setCorrecting(true);
    setCorrElapsed(0);
    corrTimerRef.current = setInterval(() => setCorrElapsed((t) => t + 1), 1000);
  };

  const stopCorrection = () => {
    corrTimerRef.current && clearInterval(corrTimerRef.current);
    corrTimerRef.current = null;
    recorderRef.current?.stop();
  };

  const hasUnresolved = sessions.some((s) => s.exercises.some((e) => !e.matched));

  const handleSave = async () => {
    if (hasUnresolved) return;
    setPhase("saving");
    setError("");
    const exercises = sessions[0]?.exercises ?? [];
    const exInputs = [...exercises]
      .sort((a, b) => String(a.order ?? "").localeCompare(String(b.order ?? ""), undefined, { numeric: true }))
      .map((e) => ({
        name: e.name, order: e.order ?? "", sets: e.sets, reps: e.reps, rest: e.rest,
        target_load: e.target_load, tempo: e.tempo || "2-0-2",
        notes: e.notes, time: e.time, each_side: e.each_side, video_url: e.video_url,
      }));

    try {
      if (mode === "new") {
        const session = await createSession(
          athleteId!, (detectedType as any) || "strength", sessionDate,
          sessionName.trim() || `Session ${sessionCount + 1}`, exInputs
        );
        onCreated?.(session);

      } else if (mode === "add") {
        const supabase = createClient();
        const rows = exInputs.map((e, i) => ({
          session_id: sessionId!, name: e.name, order: "", sets: e.sets,
          reps: e.reps, time: e.time, rest: e.rest, target_load: e.target_load,
          tempo: e.tempo, each_side: e.each_side, notes: e.notes,
          video_url: e.video_url, session_notes: "", progress: "" as const,
          progress_reminder: false, sort_order: exerciseCount + i,
          log: Array.from({ length: e.sets }, () => ({ weight: "", done: false, reps: "" })),
        }));
        const { data: inserted, error: insertErr } = await supabase
          .from("session_exercises").insert(rows).select();
        if (insertErr) throw insertErr;
        onAdded?.(inserted ?? []);

      } else if (mode === "template") {
        const template = await createTemplate();
        await updateTemplateDef(template.defs![0].id, {
          name: sessionName.trim() || "Session 1",
          exercises: exInputs.map((e, i) => ({ ...e, order: String(i + 1) })) as any,
        });
        router.push(`/templates/${template.id}`);
        onClose();

      } else if (mode === "programme") {
        const programme = await createProgramme();
        const ps = await addProgrammeSession(programme.id, 0);
        await createClient()
          .from("programme_sessions")
          .update({
            name: sessionName.trim() || "Session 1",
            exercises: exInputs.map((e, i) => ({ ...e, order: String(i + 1) })),
          })
          .eq("id", ps.id);
        router.push(`/programmes/${programme.id}`);
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setPhase("review");
    }
  };

  const handleReset = () => {
    timerRef.current && clearInterval(timerRef.current);
    corrTimerRef.current && clearInterval(corrTimerRef.current);
    recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setPhase("idle"); setElapsed(0); setSessions([]); setHistory([]);
    setAiMessage(""); setError(""); setCorrecting(false);
  };

  return (
    <>
      <style>{`
        @keyframes athletiq-pulse { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes athletiq-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
      <div style={s.overlay} onClick={onClose}>
        <div style={s.modal} onClick={(e) => e.stopPropagation()}>
          <div style={s.header}>
            <span style={s.title}>{TITLE[mode]}</span>
            <button style={s.closeBtn} onClick={onClose}>×</button>
          </div>

          {error && <div style={s.errorBox}>{error}</div>}

          {phase === "idle" && (
            <div style={s.centre}>
              <p style={s.hint}>
                {mode === "template"
                  ? "Speak your template — exercises, sets, reps, load, rest. I'll structure it ready to review."
                  : mode === "programme"
                  ? "Speak your programme sessions — I'll structure them ready to review."
                  : "Speak your session naturally — exercises, sets, reps, load, rest periods."}
              </p>
              <button style={s.micBtn} onClick={startRecording}>🎤 Tap to record</button>
            </div>
          )}

          {phase === "recording" && (
            <div style={s.centre}>
              <div style={{ fontSize: 32, color: "#ff4444", animation: "athletiq-pulse 1s ease-in-out infinite" }}>●</div>
              <div style={s.spinLabel}>Recording…</div>
              <div style={s.timer}>{formatTime(elapsed)}</div>
              <button style={s.stopBtn} onClick={stopRecording}>■ Stop recording</button>
            </div>
          )}

          {(phase === "transcribing" || phase === "parsing") && (
            <div style={s.centre}>
              <div style={{ fontSize: 28, color: "var(--accent)", animation: "athletiq-spin 0.9s linear infinite", display: "inline-block" }}>⟳</div>
              <div style={s.spinLabel}>{phase === "transcribing" ? "Transcribing…" : "Parsing…"}</div>
            </div>
          )}

          {phase === "review" && (
            <>
              {(mode === "new" || mode === "template" || mode === "programme") && (
                <div style={s.metaRow}>
                  <div style={{ flex: 2 }}>
                    <div style={s.fieldLabel}>
                      {mode === "template" ? "Template name" : mode === "programme" ? "Programme name" : "Session name"}
                    </div>
                    <input value={sessionName} onChange={(e) => setSessionName(e.target.value)} style={s.metaInput} />
                  </div>
                  {mode === "new" && (
                    <div style={{ flex: 1 }}>
                      <div style={s.fieldLabel}>Date</div>
                      <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} style={s.metaInput} />
                    </div>
                  )}
                </div>
              )}

              {aiMessage && <div style={s.aiMsg}>{aiMessage}</div>}
              {detectedType && detectedType !== "strength" && (
                <div style={{ fontSize: 12, color: "#A855F7", background: "#A855F715", border: "1px solid #A855F744", borderRadius: 6, padding: "5px 10px" }}>
                  Detected as <strong>{detectedType.replace("_", " / ")}</strong> session
                </div>
              )}

              <SessionReviewEditor
                sessions={sessions}
                onChange={setSessions}
                library={library}
                onLibraryEntryCreated={(entry) => setLibrary((prev) => [...prev, entry])}
              />

              <div style={s.corrArea}>
                {correcting ? (
                  <div style={s.corrListening}>
                    <div style={{ fontSize: 14, color: "#ff4444", animation: "athletiq-pulse 1s ease-in-out infinite" }}>●</div>
                    <span style={{ fontSize: 13, color: "var(--mute)", flex: 1 }}>Recording correction… {formatTime(corrElapsed)}</span>
                    <button style={s.corrStopBtn} onClick={stopCorrection}>Stop</button>
                  </div>
                ) : (
                  <button style={s.corrBtn} onClick={startCorrection}>🎤 Say a correction</button>
                )}
              </div>

              <div style={s.actions}>
                <button style={s.resetBtn} onClick={handleReset}>Start over</button>
                <button
                  style={{ ...s.saveBtn, opacity: hasUnresolved || !sessions[0]?.exercises.length ? 0.45 : 1, cursor: hasUnresolved ? "not-allowed" : "pointer" }}
                  disabled={hasUnresolved || !sessions[0]?.exercises.length}
                  onClick={handleSave}
                >
                  ✓ Save {sessions[0]?.exercises.length ?? 0} exercise{sessions[0]?.exercises.length !== 1 ? "s" : ""}
                </button>
              </div>
            </>
          )}

          {phase === "saving" && (
            <div style={s.centre}>
              <div style={{ fontSize: 28, color: "var(--accent)", animation: "athletiq-spin 0.9s linear infinite", display: "inline-block" }}>⟳</div>
              <div style={s.spinLabel}>Saving…</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--text)" },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 22, cursor: "pointer", padding: "0 4px", lineHeight: 1 },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  centre: { display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "10px 0 6px", textAlign: "center" },
  hint: { fontSize: 14, color: "var(--mute)", lineHeight: 1.5, maxWidth: 380, margin: 0 },
  micBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 12, padding: "14px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 6 },
  spinLabel: { fontSize: 14, color: "var(--mute)", fontWeight: 600 },
  timer: { fontSize: 28, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" },
  stopBtn: { background: "transparent", border: "1px solid #ff4444", color: "#ff4444", borderRadius: 10, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  metaRow: { display: "flex", gap: 10 },
  fieldLabel: { fontSize: 11, color: "var(--mute)", fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 4 },
  metaInput: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14 },
  aiMsg: { fontSize: 13, color: "var(--accent)", background: "var(--accent-dim)", borderRadius: 8, padding: "8px 12px", lineHeight: 1.4 },
  corrArea: { borderTop: "1px solid var(--line)", paddingTop: 12 },
  corrBtn: { width: "100%", background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  corrListening: { display: "flex", alignItems: "center", gap: 10, background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px" },
  corrStopBtn: { background: "transparent", border: "1px solid #ff4444", color: "#ff4444", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  actions: { display: "flex", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 14 },
  resetBtn: { flex: 1, background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  saveBtn: { flex: 2, background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" },
};
