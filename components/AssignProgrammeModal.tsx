"use client";

// ─────────────────────────────────────────────────────────────────────────────
// AssignProgrammeModal
//
// Two input modes:
//   Visual — pick programme from dropdown + set start date + spacing
//   Voice/Text — speak or type "Start 8-week strength programme this Monday"
//                Claude extracts programme name + date, shows preview
//
// On confirm: assigns the programme to the athlete AND loads all sessions
// onto the calendar using loadProgrammeSessionForAthlete().
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { listProgrammes, assignProgrammeToAthlete, loadProgrammeSessionForAthlete } from "@/lib/data/programmes";
import { todayISO, addDaysISO } from "@/lib/date-utils";
import type { Programme } from "@/types";

type Phase = "input" | "parsing" | "preview" | "saving";
type InputMode = "visual" | "text" | "voice";

interface ScheduledSession {
  name: string;
  date: string;
  sortOrder: number;
}

interface Props {
  athleteId: string;
  athleteName: string;
  onScheduled: (count: number) => void;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function formatTime(s: number): string {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

function scheduleSessions(
  programme: Programme,
  startDate: string,
  spacingDays: number
): ScheduledSession[] {
  const sessions = programme.sessions ?? [];
  return sessions.map((s, i) => ({
    name: s.name,
    date: addDaysISO(startDate, i * spacingDays),
    sortOrder: s.sort_order,
  }));
}

export default function AssignProgrammeModal({
  athleteId, athleteName, onScheduled, onClose,
}: Props) {
  const [phase, setPhase] = useState<Phase>("input");
  const [inputMode, setInputMode] = useState<InputMode>("visual");
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Visual mode state
  const [selectedProgrammeId, setSelectedProgrammeId] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [spacingDays, setSpacingDays] = useState(2);

  // Voice/text state
  const [textInstruction, setTextInstruction] = useState("");
  const [voiceElapsed, setVoiceElapsed] = useState(0);
  const [voiceRecording, setVoiceRecording] = useState(false);

  // Preview state
  const [selectedProgramme, setSelectedProgramme] = useState<Programme | null>(null);
  const [scheduledSessions, setScheduledSessions] = useState<ScheduledSession[]>([]);

  const recorderRef = { current: null as any };
  const streamRef = { current: null as any };
  const chunksRef = { current: [] as Blob[] };
  const timerRef = { current: null as any };

  useEffect(() => {
    listProgrammes()
      .then((p) => { setProgrammes(p); if (p.length) setSelectedProgrammeId(p[0].id); })
      .catch(() => setError("Could not load programmes"))
      .finally(() => setLoading(false));
  }, []);

  // ── Visual mode: build preview ──────────────────────────────────────────────

  const handleVisualPreview = () => {
    const prog = programmes.find((p) => p.id === selectedProgrammeId);
    if (!prog) { setError("Select a programme first"); return; }
    if (!(prog.sessions ?? []).length) { setError("This programme has no sessions"); return; }
    setSelectedProgramme(prog);
    setScheduledSessions(scheduleSessions(prog, startDate, spacingDays));
    setPhase("preview");
  };

  // ── Text/voice mode: parse instruction with Claude ─────────────────────────

  const parseInstruction = async (instruction: string) => {
    setPhase("parsing");
    setError("");
    try {
      const res = await fetch("/api/programme-assign-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          programmeNames: programmes.map((p) => ({ id: p.id, name: p.name })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not parse instruction");

      const prog = programmes.find((p) => p.id === data.programmeId);
      if (!prog) throw new Error(`Could not find programme "${data.programmeName}" — try selecting it manually`);
      if (!(prog.sessions ?? []).length) throw new Error("This programme has no sessions yet");

      setSelectedProgramme(prog);
      setStartDate(data.startDate || todayISO());
      setSpacingDays(data.spacingDays || 2);
      setScheduledSessions(scheduleSessions(prog, data.startDate || todayISO(), data.spacingDays || 2));
      setPhase("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse instruction");
      setPhase("input");
    }
  };

  const handleTextSubmit = () => {
    if (!textInstruction.trim()) return;
    parseInstruction(textInstruction);
  };

  // ── Voice recording ─────────────────────────────────────────────────────────

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
    const mimeType = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      timerRef.current && clearInterval(timerRef.current);
      setVoiceRecording(false);

      const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      setPhase("parsing");

      try {
        const res = await fetch("/api/voice-transcribe", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const transcript = data.transcript?.trim();
        if (!transcript) { setError("No speech detected — try again."); setPhase("input"); return; }
        await parseInstruction(transcript);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Transcription failed");
        setPhase("input");
      }
    };
    recorder.start();
    setVoiceRecording(true);
    setVoiceElapsed(0);
    timerRef.current = setInterval(() => setVoiceElapsed((t) => t + 1), 1000);
  };

  const stopVoice = () => {
    timerRef.current && clearInterval(timerRef.current);
    recorderRef.current?.stop();
  };

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleConfirm = async () => {
    if (!selectedProgramme) return;
    setPhase("saving");
    setError("");
    try {
      await assignProgrammeToAthlete(selectedProgramme.id, athleteId);
      const sessions = selectedProgramme.sessions ?? [];
      for (let i = 0; i < sessions.length; i++) {
        const s = scheduledSessions[i];
        if (!s) continue;
        await loadProgrammeSessionForAthlete(sessions[i], athleteId, s.date);
      }
      onScheduled(sessions.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not schedule programme");
      setPhase("preview");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const endDate = scheduledSessions.length
    ? scheduledSessions[scheduledSessions.length - 1].date
    : null;

  return (
    <>
      <style>{`
        @keyframes ap-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes ap-pulse { 0%,100%{opacity:1} 50%{opacity:0.2} }
      `}</style>
      <div style={s.overlay} onClick={onClose}>
        <div style={s.modal} onClick={(e) => e.stopPropagation()}>

          <div style={s.header}>
            <span style={s.title}>📅 Assign programme to {athleteName}</span>
            <button style={s.closeBtn} onClick={onClose}>×</button>
          </div>

          {error && <div style={s.errorBox}>{error}</div>}

          {/* ── INPUT ── */}
          {phase === "input" && (
            <>
              {loading ? (
                <div style={s.loadingMsg}>Loading programmes…</div>
              ) : programmes.length === 0 ? (
                <div style={s.empty}>No programmes yet — create one in the Programmes page first.</div>
              ) : (
                <>
                  <div style={s.modeToggle}>
                    {(["visual", "text", "voice"] as InputMode[]).map((m) => (
                      <button
                        key={m}
                        style={{ ...s.modeBtn, ...(inputMode === m ? s.modeBtnActive : {}) }}
                        onClick={() => setInputMode(m)}
                      >
                        {m === "visual" ? "🖱️ Pick" : m === "text" ? "⌨️ Type" : "🎤 Voice"}
                      </button>
                    ))}
                  </div>

                  {/* Visual picker */}
                  {inputMode === "visual" && (
                    <>
                      <div>
                        <div style={s.fieldLabel}>Programme</div>
                        <select
                          value={selectedProgrammeId}
                          onChange={(e) => setSelectedProgrammeId(e.target.value)}
                          style={s.select}
                        >
                          {programmes.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({(p.sessions ?? []).length} sessions)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={s.twoCol}>
                        <div>
                          <div style={s.fieldLabel}>Start date</div>
                          <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            style={s.input}
                          />
                        </div>
                        <div>
                          <div style={s.fieldLabel}>Session spacing</div>
                          <select
                            value={spacingDays}
                            onChange={(e) => setSpacingDays(Number(e.target.value))}
                            style={s.select}
                          >
                            <option value={1}>Every day</option>
                            <option value={2}>Every 2 days</option>
                            <option value={3}>Every 3 days</option>
                            <option value={7}>Weekly</option>
                          </select>
                        </div>
                      </div>
                      <button style={s.primaryBtn} onClick={handleVisualPreview}>
                        Preview schedule →
                      </button>
                    </>
                  )}

                  {/* Text input */}
                  {inputMode === "text" && (
                    <>
                      <p style={s.hint}>
                        Describe which programme and when to start. Claude will match it and build a preview.
                      </p>
                      <p style={s.example}>
                        e.g. <em>"Start the 8-week strength programme this coming Monday"</em> · <em>"Begin rugby pre-season from 1st January, every other day"</em>
                      </p>
                      <textarea
                        value={textInstruction}
                        onChange={(e) => setTextInstruction(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); } }}
                        placeholder="Describe the programme assignment…"
                        style={s.textarea}
                        autoFocus
                      />
                      <button
                        style={{ ...s.primaryBtn, opacity: !textInstruction.trim() ? 0.5 : 1 }}
                        disabled={!textInstruction.trim()}
                        onClick={handleTextSubmit}
                      >
                        Build preview →
                      </button>
                    </>
                  )}

                  {/* Voice input */}
                  {inputMode === "voice" && (
                    <div style={s.centre}>
                      {!voiceRecording ? (
                        <>
                          <p style={s.hint}>Say which programme and when to start.</p>
                          <button style={s.micBtn} onClick={startVoice}>🎤 Tap to record</button>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 32, color: "#ff4444", animation: "ap-pulse 1s ease-in-out infinite" }}>●</div>
                          <div style={s.spinLabel}>Recording… {formatTime(voiceElapsed)}</div>
                          <button style={s.stopBtn} onClick={stopVoice}>■ Stop</button>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── PARSING ── */}
          {phase === "parsing" && (
            <div style={s.centre}>
              <div style={{ fontSize: 28, color: "var(--accent)", animation: "ap-spin 0.9s linear infinite", display: "inline-block" }}>⟳</div>
              <div style={s.spinLabel}>Building schedule…</div>
            </div>
          )}

          {/* ── PREVIEW ── */}
          {phase === "preview" && selectedProgramme && (
            <>
              <div style={s.previewHeader}>
                <div>
                  <div style={s.previewProgramme}>{selectedProgramme.name}</div>
                  <div style={s.previewMeta}>
                    {scheduledSessions.length} sessions · {formatDate(startDate)} → {endDate ? formatDate(endDate) : ""}
                  </div>
                </div>
                <button style={s.changeBtn} onClick={() => setPhase("input")}>Change</button>
              </div>

              <div style={s.scheduleList}>
                {scheduledSessions.map((s2, i) => (
                  <div key={i} style={s.scheduleRow}>
                    <div style={s.scheduleNum}>{i + 1}</div>
                    <div style={s.scheduleName}>{s2.name}</div>
                    <div style={s.scheduleDate}>{formatDate(s2.date)}</div>
                  </div>
                ))}
              </div>

              <div style={s.actions}>
                <button style={s.resetBtn} onClick={() => setPhase("input")}>Back</button>
                <button style={s.saveBtn} onClick={handleConfirm}>
                  ✓ Confirm & schedule {scheduledSessions.length} sessions
                </button>
              </div>
            </>
          )}

          {/* ── SAVING ── */}
          {phase === "saving" && (
            <div style={s.centre}>
              <div style={{ fontSize: 28, color: "var(--accent)", animation: "ap-spin 0.9s linear infinite", display: "inline-block" }}>⟳</div>
              <div style={s.spinLabel}>Scheduling sessions…</div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(6,9,12,.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 16 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--text)" },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 22, cursor: "pointer", padding: "0 4px", lineHeight: 1 },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  loadingMsg: { fontSize: 14, color: "var(--mute)" },
  empty: { fontSize: 13, color: "var(--mute)", fontStyle: "italic" },
  modeToggle: { display: "flex", gap: 6, background: "var(--ink)", borderRadius: 10, padding: 4 },
  modeBtn: { flex: 1, background: "transparent", border: "none", color: "var(--mute)", borderRadius: 8, padding: "8px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  modeBtnActive: { background: "var(--panel)", color: "var(--text)", boxShadow: "0 1px 3px rgba(0,0,0,.3)" },
  fieldLabel: { fontSize: 11, color: "var(--mute)", fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 4 },
  select: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14 },
  input: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14 },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  hint: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5, margin: 0 },
  example: { fontSize: 12, color: "var(--mute)", margin: 0, opacity: 0.8 },
  textarea: { width: "100%", minHeight: 80, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "10px 12px", fontSize: 14, resize: "vertical" as const, fontFamily: "inherit" },
  primaryBtn: { width: "100%", background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  centre: { display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "10px 0", textAlign: "center" },
  micBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 12, padding: "14px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  stopBtn: { background: "transparent", border: "1px solid #ff4444", color: "#ff4444", borderRadius: 10, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  spinLabel: { fontSize: 14, color: "var(--mute)", fontWeight: 600 },
  previewHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" },
  previewProgramme: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  previewMeta: { fontSize: 12, color: "var(--mute)", marginTop: 3 },
  changeBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 },
  scheduleList: { display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto" },
  scheduleRow: { display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8 },
  scheduleNum: { width: 22, height: 22, borderRadius: 5, background: "var(--panel2)", color: "var(--mute)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 },
  scheduleName: { flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text)" },
  scheduleDate: { fontSize: 12, color: "var(--mute)", flexShrink: 0 },
  actions: { display: "flex", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 14 },
  resetBtn: { flex: 1, background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  saveBtn: { flex: 2, background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" },
};
