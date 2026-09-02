// Shared page heading for the athlete share-link app — the emoji sits on
// its own line above the title, so every page header reads the same on a
// phone.

export default function AthletePageHeading({
  emoji,
  title,
  style,
}: {
  emoji: string;
  title: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ padding: "14px 16px 4px", ...style }}>
      <div style={{ fontSize: 20, lineHeight: 1.1 }} aria-hidden>{emoji}</div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, color: "var(--text)", lineHeight: 1.15, marginTop: 2 }}>
        {title}
      </div>
    </div>
  );
}
