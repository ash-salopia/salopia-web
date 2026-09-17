"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Stopgap visibility until real error monitoring is wired up — logs
  // to Vercel's Runtime Logs server-side, not just this one browser's
  // console, so a crash a beta coach hits doesn't just disappear.
  // Fire-and-forget: a logging failure must never block the error UI.
  useEffect(() => {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: error.name,
        message: error.message,
        digest: error.digest,
        stack: error.stack,
        url: typeof window !== "undefined" ? window.location.href : undefined,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      padding: 24,
      background: "var(--bg)",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 40 }}>!</div>
      <h1 style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 28,
        fontWeight: 700,
        color: "var(--text)",
        margin: 0,
      }}>
        Something went wrong
      </h1>
      <p style={{ fontSize: 14, color: "var(--mute)", margin: 0, maxWidth: 320 }}>
        An unexpected error occurred. Try refreshing the page.
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: 8,
          background: "var(--accent)",
          color: "#0a1420",
          border: "none",
          borderRadius: 10,
          padding: "11px 24px",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
