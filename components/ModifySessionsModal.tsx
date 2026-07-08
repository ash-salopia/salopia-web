"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ModifySessionsModal
//
// Coach describes changes to an athlete's upcoming sessions via voice or text.
// Claude proposes specific changes. Coach reviews each one (accept / skip).
// Accepted changes are applied to session_exercises in Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { Session } from "@/types";

interface SessionChange {
  session_id: string;
  session_name: string;
  exercise_id: string;
  exercise_name: string;
  field: string;
  old_value: string;
  new_value: string;
  reason: string;
}

type ConvMessage = { role: "user" | "assistant"; content: string };
type Phase = "input" | "recording" | "transcribing" | "parsing" | "review" | "saving";

interface Props {
  upcomingSessions: Session[];
  onApplied: () => void; // parent should refresh sessions
  onClose: () => void;
}

function formatTime(s: number): string {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

function getBestMimeType(): string {
  return ["audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

const FIELD_LABELS: Record<string, string> = {
  name: "Exercise", sets: "Sets", reps: "Reps", target_load: "Load",
  rest: "Rest", tempo: "Tempo", notes: "Notes",
};

export default function ModifySessionsModal({ upcomingSessions, onApplied, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("input");
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [textInstruction, setTextInstruction] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [changes, setChanges] = useState<SessionChange[]>([]);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [aiMessage, setAiMessage] = useState("");
  const [history, setHistory] = useState<ConvMessage[]>([]);
  const [error, setError] = useState("");
  const [corrText, setCorrText] = useState("");
  const [correcting, setCorrecting] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      timerRef.current && clearInterval(timerRef.current);
      recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Accept all by default when changes arrive
  const setChangesAndAcceptAll = (newChanges: SessionChange[]) => {
    setChanges(newChanges);
    setAccepted(new Set(newChanges.map((_, i) => i)));
  };

  const callModify = async (instruction: string, convHistory: ConvMessage[]) => {
    const res = await fetch("/api/session-modify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction, sessions: upcomingSessions, history: convHistory }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not process instruction");
    return data as { changes: SessionChange[]; message: string; history: ConvMessage[] };
  };

  // ── Text input ──────────────────────────────────────────────────────────────

  const handleTextSubmit = async () => {
    if (!textInstruction.trim()) return;
    setPhase("parsing");
    setError("");
    try {
      const result = await callModify(textInstruction, []);
      setChangesAndAcceptAll(result.changes);
      setAiMessage(result.message);
      setHistory(result.history);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not process instruction");
      setPhase("input");
    }
  };

  // ── Voice input ─────────────────────────────────────────────────────────────

  const startVoice = async () => {
    setError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Could not access microphone — please allow permission.");
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const mimeType = getBestMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setPhase("transcribing");
      const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      const form = new FormData();
      form.append("audio", blob, "recording.webm");

      let transcript: string;
      try {
        const res = await fetch("/api/voice-transcribe", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        transcript = data.transcript ?? "";
      } catch (e) {
        setError(e instanceof Error ? e.message : "Transcription failed");
        setPhase("input");
        return;
      }

      if (!transcript.trim()) {
        setError("No speech detected — try again.");
        setPhase("input");
        return;
      }

      setPhase("parsing");
      try {
        const result = await callModify(transcript, []);
        setChangesAndAcceptAll(result.changes);
        setAiMessage(result.message);
        setHistory(result.history);
        setPhase("review");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not process instruction");
        setPhase("input");
      }
    };

    recorder.start();
    setPhase("recording");
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
  };

  const stopVoice = () => {
    timerRef.current && clearInterval(timerRef.current);
    timerRef.current = null;
    recorderRef.current?.stop();
  };

  // ── Text correction in review ───────────────────────────────────────────────

  const handleCorrection = async () => {
    if (!corrText.trim()) return;
    const capturedHistory = history;
    setCorrecting(true);
    setError("");
    try {
      const result = await callModify(corrText, capturedHistory);
      setChangesAndAcceptAll(result.changes);
      setAiMessage(result.message);
      setHistory(result.history);
      setCorrText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply correction");
    } finally {
      setCorrecting(false);
    }
  };

  // ── Save accepted changes ───────────────────────────────────────────────────

  const handleSave = async () => {
    const toApply = changes.filter((_, i) => accepted.has(i));
    if (!toApply.length) { onClose(); return; }

    setPhase("saving");
    setError("");
    const supabase = createClient();

    try {
      for (const change of toApply) {
        const value = change.field === "sets"
          ? parseInt(change.new_value, 10) || 3
          : change.new_value;

        const { error: updateErr } = await supabase
          .from("session_exercises")
          .update({ [change.field]: value })
          .eq("id", change.exercise_id);

        if (updateErr) throw updateErr;
      }
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save changes");
      setPhase("review");
    }
  };

  const toggleAccepted = (i: number) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const acceptedCount = accepted.size;

  return (
    <>
      <style>{`
        @keyframes mod-pulse { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes mod-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
      <div style={s.overlay} onClick={onClose}>
        <div style={s.modal} onClick={(e) => e.stopPropagation()}>
          <div style={s.header}>
            <span style={s.title}>✏️ Modify upcoming sessions</span>
            <button style={s.closeBtn} onClick={onClose}>×</button>
          </div>

          {error && <div style={s.errorBox}>{error}</div>}

          {/* INPUT */}
          {phase === "input" && (
            <>
              <p style={s.hint}>
                Describe what you want to change across {upcomingSessions.length} upcoming session{upcomingSessions.length !== 1 ? "s" : ""}.
                Claude will propose specific changes for you to review before anything is saved.
              </p>
              <p style={s.example}>
                e.g. <em>"Reduce squat volume by 20% this week"</em> · <em>"Add 5kg to all pressing movements"</em> · <em>"Cut rest periods to 90 seconds"</em>
              </p>

              <div style={s.modeToggle}>
                <button style={{ ...s.modeBtn, ...(inputMode === "text" ? s.modeBtnActive : {}) }}
                  onClick={() => setInputMode("text")}>⌨️ Type</button>
                <button style={{ ...s.modeBtn, ...(inputMode === "voice" ? s.modeBtnActive : {}) }}
                  onClick={() => setInputMode("voice")}>🎤 Voice</button>
              </div>

              {inputMode === "text" ? (
                <>
                  <textarea
                    value={textInstruction}
                    onChange={(e) => setTextInstruction(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); } }}
                    placeholder="Describe your changes…"
                    style={s.textarea}
                    autoFocus
                  />
                  <button style={{ ...s.primaryBtn, opacity: !textInstruction.trim() ? 0.5 : 1 }}
                    disabled={!textInstruction.trim()} onClick={handleTextSubmit}>
                    Analyse changes
                  </button>
                </>
              ) : (
                <div style={s.centre}>
                  <button style={s.micBtn} onClick={startVoice}>🎤 Tap to record</button>
                </div>
              )}
            </>
          )}

          {/* RECORDING */}
          {phase === "recording" && (
            <div style={s.centre}>
              <div style={{ fontSize: 32, color: "#ff4444", animation: "mod-pulse 1s ease-in-out infinite" }}>●</div>
              <div style={s.spinLabel}>Recording…</div>
              <div style={s.timer}>{formatTime(elapsed)}</div>
              <button style={s.stopBtn} onClick={stopVoice}>■ Stop</button>
            </div>
          )}

          {/* TRANSCRIBING / PARSING */}
          {(phase === "transcribing" || phase === "parsing") && (
            <div style={s.centre}>
              <div style={{ fontSize: 28, color: "var(--accent)", animation: "mod-spin 0.9s linear infinite", display: "inline-block" }}>⟳</div>
              <div style={s.spinLabel}>{phase === "transcribing" ? "Transcribing…" : "Analysing sessions…"}</div>
            </div>
          )}

          {/* REVIEW */}
          {phase === "review" && (
            <>
              {aiMessage && <div style={s.aiMsg}>{aiMessage}</div>}

              {changes.length === 0 ? (
                <div style={s.empty}>
                  No specific changes could be identified for these sessions. Try being more specific.
                </div>
              ) : (
                <div style={s.changeList}>
                  <div style={s.changeListHeader}>
                    <span style={s.changeListTitle}>Proposed changes</span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={s.selectAllBtn} onClick={() => setAccepted(new Set(changes.map((_, i) => i)))}>
                        Accept all
                      </button>
                      <button style={s.selectAllBtn} onClick={() => setAccepted(new Set())}>
                        Skip all
                      </button>
                    </div>
                  </div>
                  {changes.map((change, i) => (
                    <div key={i} style={{ ...s.changeCard, ...(accepted.has(i) ? s.changeCardAccepted : s.changeCardSkipped) }}>
                      <div style={s.changeTop}>
                        <div style={s.changeInfo}>
                          <div style={s.changeExercise}>{change.exercise_name}</div>
                          <div style={s.changeSession}>{change.session_name}</div>
                          <div style={s.changeDiff}>
                            <span style={s.fieldLabel2}>{FIELD_LABELS[change.field] ?? change.field}</span>
                            <span style={s.oldValue}>{change.old_value}</span>
                            <span style={s.arrow}>→</span>
                            <span style={s.newValue}>{change.new_value}</span>
                          </div>
                          <div style={s.changeReason}>{change.reason}</div>
                        </div>
                        <button
                          style={{ ...s.toggleBtn, ...(accepted.has(i) ? s.toggleBtnAccepted : s.toggleBtnSkipped) }}
                          onClick={() => toggleAccepted(i)}
                        >
                          {accepted.has(i) ? "✓ Accept" : "✗ Skip"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Text correction */}
              <div style={s.corrArea}>
                <div style={s.corrRow}>
                  <input
                    value={corrText}
                    onChange={(e) => setCorrText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && corrText.trim()) handleCorrection(); }}
                    placeholder='Refine: "also reduce bench reps to 6"'
                    style={s.corrInput}
                    disabled={correcting}
                  />
                  <button
                    style={{ ...s.corrApplyBtn, opacity: !corrText.trim() || correcting ? 0.5 : 1 }}
                    disabled={!corrText.trim() || correcting}
                    onClick={handleCorrection}
                  >
                    {correcting ? "…" : "Apply"}
                  </button>
                </div>
              </div>

              <div style={s.actions}>
                <button style={s.resetBtn} onClick={() => { setPhase("input"); setChanges([]); setHistory([]); setTextInstruction(""); }}>
                  Start over
                </button>
                <button
                  style={{ ...s.saveBtn, opacity: acceptedCount === 0 ? 0.45 : 1, cursor: acceptedCount === 0 ? "not-allowed" : "pointer" }}
                  disabled={acceptedCount === 0}
                  onClick={handleSave}
                >
                  ✓ Apply {acceptedCount} change{acceptedCount !== 1 ? "s" : ""}
                </button>
              </div>
            </>
          )}

          {/* SAVING */}
          {phase === "saving" && (
            <div style={s.centre}>
              <div style={{ fontSize: 28, color: "var(--accent)", animation: "mod-spin 0.9s linear infinite", display: "inline-block" }}>⟳</div>
              <div style={s.spinLabel}>Applying changes…</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--text)" },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 22, cursor: "pointer", padding: "0 4px", lineHeight: 1 },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  hint: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5, margin: 0 },
  example: { fontSize: 12, color: "var(--mute)", margin: 0, opacity: 0.8 },
  modeToggle: { display: "flex", gap: 6, background: "var(--ink)", borderRadius: 10, padding: 4 },
  modeBtn: { flex: 1, background: "transparent", border: "none", color: "var(--mute)", borderRadius: 8, padding: "8px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  modeBtnActive: { background: "var(--panel)", color: "var(--text)", boxShadow: "0 1px 3px rgba(0,0,0,.3)" },
  textarea: { width: "100%", minHeight: 80, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "10px 12px", fontSize: 14, resize: "vertical" as const, fontFamily: "inherit" },
  primaryBtn: { width: "100%", background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  centre: { display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "10px 0", textAlign: "center" },
  micBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 12, padding: "14px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  spinLabel: { fontSize: 14, color: "var(--mute)", fontWeight: 600 },
  timer: { fontSize: 28, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" },
  stopBtn: { background: "transparent", border: "1px solid #ff4444", color: "#ff4444", borderRadius: 10, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  aiMsg: { fontSize: 13, color: "var(--accent)", background: "var(--accent-dim)", borderRadius: 8, padding: "8px 12px", lineHeight: 1.4 },
  empty: { fontSize: 13, color: "var(--mute)", fontStyle: "italic", textAlign: "center", padding: "12px 0" },
  changeList: { display: "flex", flexDirection: "column", gap: 8 },
  changeListHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  changeListTitle: { fontSize: 13, fontWeight: 700, color: "var(--text)" },
  selectAllBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" },
  changeCard: { borderRadius: 10, padding: "10px 12px", border: "1px solid var(--line)" },
  changeCardAccepted: { background: "#0a1a0a", borderColor: "#1a4a1a" },
  changeCardSkipped: { background: "var(--ink)", opacity: 0.5 },
  changeTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  changeInfo: { flex: 1 },
  changeExercise: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  changeSession: { fontSize: 11, color: "var(--mute)", marginBottom: 6 },
  changeDiff: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const },
  fieldLabel2: { fontSize: 11, background: "var(--panel2)", color: "var(--mute)", borderRadius: 4, padding: "1px 6px", fontWeight: 600 },
  oldValue: { fontSize: 13, color: "var(--mute)", textDecoration: "line-through" },
  arrow: { fontSize: 13, color: "var(--mute)" },
  newValue: { fontSize: 13, fontWeight: 700, color: "var(--good)" },
  changeReason: { fontSize: 11, color: "var(--mute)", marginTop: 4, fontStyle: "italic" },
  toggleBtn: { borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", flexShrink: 0 },
  toggleBtnAccepted: { background: "var(--good)", color: "#0a1420" },
  toggleBtnSkipped: { background: "var(--panel2)", color: "var(--mute)" },
  corrArea: { borderTop: "1px solid var(--line)", paddingTop: 12 },
  corrRow: { display: "flex", gap: 8 },
  corrInput: { flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 13 },
  corrApplyBtn: { background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  actions: { display: "flex", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 14 },
  resetBtn: { flex: 1, background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  saveBtn: { flex: 2, background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" },
};
