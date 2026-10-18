// Shared page heading for the athlete share-link app. Title only - the
// app no longer uses emoji in headings, for a cleaner, professional look
// (`emoji` is still accepted so older call sites compile, but ignored).

export default function AthletePageHeading({
  title,
  style,
}: {
  emoji?: string;
  title: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ padding: "16px 16px 4px", ...style }}>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 700, color: "var(--text)", lineHeight: 1.15 }}>
        {title}
      </div>
    </div>
  );
}
