"use client";

import { useEffect, useState } from "react";

// Rest timer for the athlete app - shared by strength sessions
// (AthleteSessionView) and power/speed sessions (PowerSpeedAthleteView).
// One timer at a time per session view: starting another exercise's
// rest replaces it.

// The coach's free-text rest prescription parsed into seconds for the
// rest timer: "90s", "90", "2min", "2 mins", "1:30", "2min30s", "2m 30s",
// "1.5min", and ranges ("60-90s", "2-3min", "2 to 3 mins") - a range
// uses the longer end, so the athlete gets the full rest. Returns null
// for anything unparseable so the timer button just doesn't show
// rather than starting at a nonsense duration.
export function parseRestSeconds(rest: string | null | undefined): number | null {
  const s = (rest ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  const range = s.match(/^(.+?)\s*(?:-|–|to)\s*(.+)$/);
  if (range) {
    const hi = parseOne(range[2]);
    if (hi == null) return null;
    // "2-3min": the unit sits on the second number only.
    const unit = range[2].replace(/^[\d.:\s]+/, "");
    const lo = parseOne(/^[\d.]+$/.test(range[1].trim()) && unit ? `${range[1].trim()}${unit}` : range[1]);
    return lo == null ? hi : Math.max(lo, hi);
  }
  return parseOne(s);
}

function parseOne(raw: string): number | null {
  const s = raw.trim();
  const colon = s.match(/^(\d+):(\d{1,2})$/);
  if (colon) return parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10);
  const minSec = s.match(/^(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes|m)\s*(?:(\d+)\s*(?:s|sec|secs|second|seconds)?)?$/);
  if (minSec) return Math.round(parseFloat(minSec[1]) * 60) + (minSec[2] ? parseInt(minSec[2], 10) : 0);
  const sec = s.match(/^(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)?$/);
  if (sec) return Math.round(parseFloat(sec[1]));
  return null;
}

export function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export interface RestTimerState {
  timer: { exerciseId: string; endAt: number; total: number } | null;
  remaining: number;
  start: (exerciseId: string, seconds: number) => void;
  stop: () => void;
}

// Counts down from an absolute end time rather than a decrementing
// counter so it stays accurate even if the tab is backgrounded for a
// while. Vibrates when done, then clears itself after 3s.
export function useRestTimer(): RestTimerState {
  const [timer, setTimer] = useState<RestTimerState["timer"]>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timer) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer?.exerciseId, timer?.endAt]);

  const remaining = timer ? Math.max(0, Math.ceil((timer.endAt - now) / 1000)) : 0;

  useEffect(() => {
    if (!timer || remaining > 0) return;
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([200, 100, 200]);
    const t = setTimeout(() => setTimer(null), 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining === 0, timer?.exerciseId]);

  return {
    timer,
    remaining,
    start: (exerciseId, seconds) => setTimer({ exerciseId, endAt: Date.now() + seconds * 1000, total: seconds }),
    stop: () => setTimer(null),
  };
}

/** "Start rest (90s)" button, or the running countdown for this exercise. */
export function RestTimerControl({ exerciseId, rest, rt }: { exerciseId: string; rest: string | null | undefined; rt: RestTimerState }) {
  const restSeconds = parseRestSeconds(rest);
  if (restSeconds == null || restSeconds <= 0) return null;
  if (rt.timer?.exerciseId !== exerciseId) {
    return (
      <button style={styles.startBtn} onClick={() => rt.start(exerciseId, restSeconds)}>
        Start rest ({rest})
      </button>
    );
  }
  const done = rt.remaining <= 0;
  const progressPct = Math.max(0, Math.min(100, (rt.remaining / rt.timer.total) * 100));
  return (
    <div style={{ ...styles.active, ...(done ? styles.activeDone : {}) }}>
      <div style={styles.barTrack}>
        <div style={{ ...styles.barFill, width: `${progressPct}%`, ...(done ? { background: "var(--good)" } : {}) }} />
      </div>
      <div style={styles.row}>
        <span style={{ ...styles.label, ...(done ? { color: "var(--good)" } : {}) }}>
          {done ? "✓ Rest complete" : `Resting… ${formatMMSS(rt.remaining)}`}
        </span>
        <button style={styles.skipBtn} onClick={rt.stop}>
          {done ? "Dismiss" : "Skip"}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  startBtn: {
    width: "100%", marginTop: 8, background: "var(--accent-dim)", border: "1px solid var(--accent)44",
    color: "var(--accent)", borderRadius: 8, padding: "9px 0", fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  active: {
    marginTop: 8, background: "var(--panel2)", border: "1px solid var(--accent)",
    borderRadius: 8, padding: 8, overflow: "hidden",
  },
  activeDone: { borderColor: "var(--good)" },
  barTrack: { height: 4, background: "var(--ink)", borderRadius: 2, overflow: "hidden", marginBottom: 6 },
  barFill: { height: "100%", background: "var(--accent)" },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  label: { fontSize: 13, fontWeight: 700, color: "var(--accent)" },
  skipBtn: {
    background: "transparent", border: "1px solid var(--line)", color: "var(--mute)",
    borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0,
  },
};
