"use client";

// Shared mic-button voice-note recorder for chat (group and direct
// messages, coach and athlete side) - same getUserMedia/MediaRecorder
// pattern already used for voice-to-text elsewhere (VoiceSessionModal.tsx),
// but here the raw audio is kept (uploaded via the `upload` prop) rather
// than transcribed-and-discarded. Tap to start, tap to stop, then
// uploads and sends immediately - no separate preview/confirm step,
// matching ordinary chat-app voice-note UX (re-recording is just
// tapping the mic again).
//
// Decoupled from *how* the blob gets uploaded/sent - the coach and
// athlete sides use different API routes (coach has an auth session,
// athlete has a share_token), so this component just takes two
// callbacks rather than knowing about either.

import { useState, useRef } from "react";

function getBestMimeType(): string {
  return ["audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function formatTime(s: number): string {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

interface Props {
  upload: (blob: Blob) => Promise<{ path: string }>;
  onSend: (audioPath: string, durationSeconds: number) => Promise<void>;
  disabled?: boolean;
}

export default function VoiceNoteRecorder({ upload, onSend, disabled }: Props) {
  const [phase, setPhase] = useState<"idle" | "recording" | "uploading">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);

  const startRecording = async () => {
    setError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Could not access microphone - please allow permission and try again.");
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
      const duration = elapsedRef.current;
      const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      if (duration < 1) { setPhase("idle"); return; } // accidental tap, nothing worth sending
      setPhase("uploading");
      try {
        const { path } = await upload(blob);
        await onSend(path, duration);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not send voice note");
      } finally {
        setPhase("idle");
      }
    };
    recorder.onerror = () => { setError("Recording error - please try again."); setPhase("idle"); };
    recorder.start();
    setPhase("recording");
    setElapsed(0);
    elapsedRef.current = 0;
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
  };

  const stopRecording = () => {
    timerRef.current && clearInterval(timerRef.current);
    timerRef.current = null;
    recorderRef.current?.stop();
  };

  return (
    <div style={s.wrap}>
      {phase === "recording" ? (
        <button style={{ ...s.btn, ...s.btnRecording }} onClick={stopRecording} title="Stop recording">
          ⏹ {formatTime(elapsed)}
        </button>
      ) : (
        <button
          style={{ ...s.btn, opacity: disabled || phase === "uploading" ? 0.5 : 1 }}
          disabled={disabled || phase === "uploading"}
          onClick={startRecording}
          title="Record a voice note"
        >
          {phase === "uploading" ? "…" : "🎤"}
        </button>
      )}
      {error && <div style={s.error}>{error}</div>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { position: "relative" },
  btn: {
    width: 40, height: 40, background: "var(--panel2)", color: "var(--text)", border: "1px solid var(--line)",
    borderRadius: 10, fontSize: 16, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
  },
  btnRecording: {
    background: "#2a0c0c", borderColor: "#ff4444", color: "#ff4444", fontSize: 12, fontWeight: 700,
    width: "auto", padding: "0 10px", gap: 4,
  },
  error: {
    position: "absolute", bottom: "100%", right: 0, marginBottom: 6, background: "#2a0c0c",
    border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "6px 10px",
    fontSize: 11, whiteSpace: "nowrap" as const, zIndex: 5,
  },
};
