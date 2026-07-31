"use client";

import { useEffect, useRef, useState } from "react";
import { RECOVERY_COLOR } from "@/lib/recovery-constants";

// Plain visual countdown, deliberately no audio-cue engine (Hyrox/
// Cardio's Web Audio beep timer is out of scope for v1 — see the
// Recovery feature plan). Auto-fires onDone once it reaches zero.
export default function RecoveryCountdown({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const start = () => {
    setRunning(true);
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setRunning(false);
          onDone();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;

  return (
    <div style={s.wrap}>
      <div style={s.time}>{mm}:{String(ss).padStart(2, "0")}</div>
      {!running && remaining > 0 && (
        <button style={s.btn} onClick={start}>▶ Start</button>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", alignItems: "center", gap: 12 },
  time: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, color: RECOVERY_COLOR, fontVariantNumeric: "tabular-nums" as const },
  btn: { background: "transparent", border: `1px solid ${RECOVERY_COLOR}`, color: RECOVERY_COLOR, borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
};
