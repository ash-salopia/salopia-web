"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  unlockAudio,
  stopKeepAlive,
  playCountdownBeep,
  playDing,
  playDoneBeep,
  setSoundMuted,
} from "@/lib/timer-audio";

type Phase = "idle" | "work" | "rest" | "done" | "paused";

interface TimerState {
  phase: Phase;
  timeLeft: number;
  round: number;
  // The phase to return to on resume (work or rest) — tracked
  // separately from `phase` itself, since `phase` becomes "paused"
  // while paused and would otherwise lose this information.
  resumePhase: "work" | "rest";
}

interface Props {
  workSec: number;
  restSec: number;
  totalRounds: number;
  label?: string;
  onClose: () => void;
}

// Interval/circuit-style work-rest timer. This is the proven, debugged
// core timer engine from the prototype — see lib/timer-audio.ts for
// the audio system notes, and the comments below for why the beep
// sequencing is structured the way it is. The Hyrox-specific variants
// (cycling supersets, EMOM, fixed-step workouts) build on this same
// tick logic with different round/phase derivations and aren't all
// ported yet — this covers interval and circuit timing, the most
// commonly used types.
export default function HyroxTimer({ workSec, restSec, totalRounds, label, onClose }: Props) {
  useEffect(() => () => stopKeepAlive(), []);

  const [display, setDisplay] = useState<TimerState>({
    phase: "idle",
    timeLeft: workSec || 60,
    round: 1,
    resumePhase: "work",
  });
  const [muted, setMuted] = useState(false);
  const stateRef = useRef<TimerState>({
    phase: "idle",
    timeLeft: workSec || 60,
    round: 1,
    resumePhase: "work",
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => setSoundMuted(muted), [muted]);

  const setState = (patch: Partial<TimerState>) => {
    stateRef.current = { ...stateRef.current, ...patch };
    setDisplay({ ...stateRef.current });
  };

  // Plays the correct countdown beep for whatever number is CURRENTLY
  // showing on screen, without changing any state. Called both from
  // the interval tick AND immediately whenever a new phase begins, so
  // short phases (<=3s) never silently skip their first beep while
  // waiting for setInterval's initial 1-second delay. This was the
  // fix for the "missing 3 beep" bug found during prototype testing.
  const beepForCurrentNumber = useCallback((timeLeft: number) => {
    if (timeLeft <= 3 && timeLeft >= 1) playCountdownBeep();
  }, []);

  const tick = useCallback(() => {
    const s = stateRef.current;
    if (s.phase === "idle" || s.phase === "done" || s.phase === "paused") return;

    if (s.timeLeft > 1) {
      const next = s.timeLeft - 1;
      setState({ timeLeft: next });
      beepForCurrentNumber(next); // beep for the number we just moved TO
      return;
    }

    // timeLeft is at 1 and about to become 0 -> phase transition + single ding
    if (s.phase === "work") {
      if (s.round < totalRounds) {
        setState({ phase: "rest", timeLeft: restSec, round: s.round, resumePhase: "rest" });
        playDing();
        beepForCurrentNumber(restSec);
      } else {
        setState({ phase: "done", timeLeft: 0 });
        if (intervalRef.current) clearInterval(intervalRef.current);
        playDoneBeep();
      }
    } else if (s.phase === "rest") {
      setState({ phase: "work", timeLeft: workSec || 60, round: s.round + 1, resumePhase: "work" });
      playDing();
      beepForCurrentNumber(workSec || 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workSec, restSec, totalRounds, beepForCurrentNumber]);

  const startTimer = () => {
    unlockAudio(); // must be called directly from this tap handler
    playDing();
    setState({ phase: "work", timeLeft: workSec || 60, round: 1, resumePhase: "work" });
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, 1000);
  };

  const pauseTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    // resumePhase already holds the correct phase to return to, set
    // whenever we last entered "work" or "rest" — phase itself becomes
    // "paused" here, but resumePhase is left untouched.
    setState({ phase: "paused" });
  };

  const resumeTimer = () => {
    unlockAudio();
    setState({ phase: stateRef.current.resumePhase });
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, 1000);
  };

  const stopTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    stopKeepAlive();
    setState({ phase: "idle", timeLeft: workSec || 60, round: 1, resumePhase: "work" });
  };

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const { phase, timeLeft, round } = display;
  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");
  const phaseColor = phase === "work" ? "var(--good)" : phase === "rest" ? "#ff6b6b" : "var(--mute)";
  const paused = phase === "paused";

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.headerRow}>
          <div style={styles.label}>{label || "Timer"}</div>
          <button style={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        <div style={{ ...styles.phaseLabel, color: phaseColor }}>
          {paused ? "PAUSED" : phase === "idle" ? "READY" : phase === "done" ? "DONE" : phase.toUpperCase()}
        </div>

        <div style={{ ...styles.clock, color: phaseColor }}>
          {mm}:{ss}
        </div>

        {phase !== "idle" && phase !== "done" && (
          <div style={styles.roundLabel}>
            Round {round} / {totalRounds}
          </div>
        )}

        <div style={styles.controls}>
          {phase === "idle" && (
            <button style={styles.startBtn} onClick={startTimer}>
              ▶ Start
            </button>
          )}
          {(phase === "work" || phase === "rest") && (
            <button style={styles.pauseBtn} onClick={pauseTimer}>
              ⏸ Pause
            </button>
          )}
          {paused && (
            <button style={styles.startBtn} onClick={resumeTimer}>
              ▶ Resume
            </button>
          )}
          {phase !== "idle" && (
            <button style={styles.stopBtn} onClick={stopTimer}>
              ⏹ Stop
            </button>
          )}
        </div>

        <label style={styles.muteRow}>
          <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
          Mute sound
        </label>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(6,9,12,.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 60,
    padding: 16,
  },
  modal: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 18,
    padding: 28,
    width: "100%",
    maxWidth: 360,
    textAlign: "center",
  },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  label: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 22, cursor: "pointer" },
  phaseLabel: { fontSize: 14, fontWeight: 700, letterSpacing: 2, marginBottom: 6 },
  clock: {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: 72,
    fontWeight: 700,
    lineHeight: 1,
    marginBottom: 8,
  },
  roundLabel: { fontSize: 13, color: "var(--mute)", marginBottom: 20 },
  controls: { display: "flex", gap: 10, justifyContent: "center", marginTop: 20 },
  startBtn: {
    background: "var(--good)",
    color: "#06251a",
    border: "none",
    borderRadius: 12,
    padding: "14px 28px",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
  pauseBtn: {
    background: "var(--warn)",
    color: "#3a2c10",
    border: "none",
    borderRadius: 12,
    padding: "14px 28px",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
  stopBtn: {
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--mute)",
    borderRadius: 12,
    padding: "14px 22px",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
  muteRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
    fontSize: 12,
    color: "var(--mute)",
    cursor: "pointer",
  },
};
