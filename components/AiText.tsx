"use client";

// Small presentational helpers for AI summary panels — a shimmer
// placeholder while the model call is in flight, and a typewriter
// reveal once the text lands so a 1–3s generation reads as "live"
// rather than a blob appearing after a dead spinner.

import { useEffect, useRef, useState } from "react";

export function AiShimmer({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-label="Generating…" style={{ display: "flex", flexDirection: "column", gap: 7, padding: "2px 0" }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 10,
            width: i === lines - 1 ? "55%" : "100%",
            borderRadius: 5,
            background:
              "linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.14) 37%, rgba(255,255,255,0.06) 63%)",
            backgroundSize: "400% 100%",
            animation: "ai-shimmer 1.3s ease-in-out infinite",
          }}
        />
      ))}
      <style>{`@keyframes ai-shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}`}</style>
    </div>
  );
}

// Reveals `text` a few characters per tick. If `text` grows (streamed
// updates) it keeps going from where it was; a shrink/replace restarts.
export function Typewriter({ text, style, speed = 22 }: { text: string; style?: React.CSSProperties; speed?: number }) {
  const [shown, setShown] = useState(0);
  const prev = useRef("");

  useEffect(() => {
    if (!text.startsWith(prev.current)) setShown(0);
    prev.current = text;
  }, [text]);

  useEffect(() => {
    if (shown >= text.length) return;
    const step = Math.max(1, Math.round(text.length / 60)); // finish in ~60 ticks regardless of length
    const t = setTimeout(() => setShown((s) => Math.min(text.length, s + step)), speed);
    return () => clearTimeout(t);
  }, [shown, text, speed]);

  const done = shown >= text.length;
  return (
    <span style={style}>
      {text.slice(0, shown)}
      {!done && <span style={{ opacity: 0.5 }}>▍</span>}
    </span>
  );
}
