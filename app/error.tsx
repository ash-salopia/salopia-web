"use client";

// Named ErrorBoundary (not GlobalError) to avoid confusion with the
// separate app/global-error.tsx, which is a different Next.js
// convention — this one catches errors within the root layout's
// content; that one catches errors in the root layout itself.

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Sentry.captureException is a no-op with no DSN configured — real
  // error monitoring once NEXT_PUBLIC_SENTRY_DSN is set. The
  // /api/client-error POST is a zero-config fallback that works either
  // way, logging to Vercel's Runtime Logs so a crash a beta coach hits
  // doesn't just disappear into their own browser console. Both are
  // fire-and-forget: a logging failure must never block the error UI.
  useEffect(() => {
    Sentry.captureException(error);
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
