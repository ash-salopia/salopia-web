// Shared avatar renderer — a photo if avatar_url is set, otherwise
// the first letter of the name on an accent-tinted background (the
// initials placeholder already used across the app before profile
// pictures existed).

export default function Avatar({
  name,
  avatarUrl,
  size = 38,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const radius = Math.round(size * 0.26);
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: "var(--accent-dim)",
        color: "var(--accent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.round(size * 0.42),
        flexShrink: 0,
      }}
    >
      {(name || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}
