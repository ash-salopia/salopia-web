"use client";

// Catches errors thrown in the root layout itself — the one class of
// crash app/error.tsx can't handle, since that boundary lives *inside*
// the root layout and can't recover if the layout itself is what
// broke. Didn't exist before this: a root-layout crash previously had
// no handling at all (Next's own bare fallback, unstyled, unreported).
//
// Next.js requires this file to render its own <html>/<body> — it
// fully replaces the root layout when it fires, so app/globals.css and
// anything else layout.tsx normally provides isn't available here.
// Kept deliberately minimal/inline-styled for that reason.

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
        boundary: "global-error",
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          background: "#0F1418",
          color: "#E8EDF1",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 40 }}>!</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Something went wrong</h1>
        <p style={{ fontSize: 14, color: "#8593A0", margin: 0, maxWidth: 320 }}>
          VIS BUILD hit an unexpected error loading the page. Try reloading — if it keeps
          happening, contact support.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: 8,
            background: "#3B8BEB",
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
      </body>
    </html>
  );
}
