export default function Loading() {
  return (
    <div style={{ padding: 24 }}>
      <div style={shimmer} />
      <div style={{ ...shimmer, width: "60%", marginTop: 12 }} />
      <div style={{ ...shimmer, width: "80%", marginTop: 12 }} />
      <div style={{ ...shimmer, marginTop: 24, height: 80 }} />
      <div style={{ ...shimmer, marginTop: 10, height: 80 }} />
      <div style={{ ...shimmer, marginTop: 10, height: 80 }} />
    </div>
  );
}

const shimmer: React.CSSProperties = {
  height: 20,
  background: "var(--panel)",
  borderRadius: 8,
  width: "100%",
  animation: "shimmer 1.4s ease-in-out infinite",
};
