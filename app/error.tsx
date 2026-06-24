"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
