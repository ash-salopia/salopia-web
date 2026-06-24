export default function NotFound() {
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
      <div style={{ fontSize: 48 }}>404</div>
      <h1 style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 28,
        fontWeight: 700,
        color: "var(--text)",
        margin: 0,
      }}>
        Page not found
      </h1>
      <p style={{ fontSize: 14, color: "var(--mute)", margin: 0 }}>
        The page you are looking for does not exist.
      </p>
      <a href="/" style={{
        marginTop: 8,
        fontSize: 14,
        color: "var(--accent)",
        textDecoration: "none",
        fontWeight: 600,
      }}>
        Go home
      </a>
    </div>
  );
}
