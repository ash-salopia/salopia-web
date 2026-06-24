export default function AthleteNotFound() {
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
      <div style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 700,
        fontSize: 20,
        letterSpacing: 2,
        color: "var(--accent)",
        marginBottom: 8,
      }}>
        AthletiQ
      </div>
      <div style={{ fontSize: 36 }}>?</div>
      <h1 style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 26,
        fontWeight: 700,
        color: "var(--text)",
        margin: 0,
      }}>
        Link not found
      </h1>
      <p style={{ fontSize: 14, color: "var(--mute)", margin: 0, maxWidth: 300, lineHeight: 1.6 }}>
        This link may have expired or is invalid. Please ask your coach to share a new link with you.
      </p>
    </div>
  );
}
