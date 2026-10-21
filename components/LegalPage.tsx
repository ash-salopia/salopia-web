import Link from "next/link";

// Shared layout for the public /privacy and /terms pages. Plain server
// component, same palette as /start (these pages sit outside the coach
// shell, so the theme variables aren't guaranteed).

export type LegalSection = { heading: string; body: (string | string[])[] };

export default function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <div style={s.page}>
      <div style={s.wrap}>
        <Link href="/start" style={s.brand}>VIS BUILD</Link>
        <h1 style={s.title}>{title}</h1>
        <div style={s.updated}>Last updated {updated}</div>
        <p style={s.p}>{intro}</p>
        {sections.map((sec, i) => (
          <section key={sec.heading} style={{ marginTop: 28 }}>
            <h2 style={s.h2}>
              {i + 1}. {sec.heading}
            </h2>
            {sec.body.map((b, j) =>
              Array.isArray(b) ? (
                <ul key={j} style={s.ul}>
                  {b.map((li) => (
                    <li key={li} style={s.li}>{li}</li>
                  ))}
                </ul>
              ) : (
                <p key={j} style={s.p}>{b}</p>
              )
            )}
          </section>
        ))}
        <div style={s.footer}>
          <Link href="/privacy" style={s.link}>Privacy policy</Link>
          <span>·</span>
          <Link href="/terms" style={s.link}>Terms of use</Link>
          <span>·</span>
          <a href="mailto:support@visbuild.co.uk" style={s.link}>support@visbuild.co.uk</a>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#0F1418", color: "#E8EDF1", padding: "48px 16px 64px" },
  wrap: { maxWidth: 720, margin: "0 auto" },
  brand: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: 2, color: "#3B8BEB", textDecoration: "none" },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 34, fontWeight: 700, margin: "20px 0 4px" },
  updated: { fontSize: 13, color: "#8593A0", marginBottom: 20 },
  h2: { fontSize: 17, fontWeight: 700, margin: "0 0 8px" },
  p: { fontSize: 14.5, lineHeight: 1.7, color: "#C9D2DA", margin: "0 0 12px" },
  ul: { margin: "0 0 12px", paddingLeft: 22 },
  li: { fontSize: 14.5, lineHeight: 1.7, color: "#C9D2DA", marginBottom: 4 },
  footer: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 40, paddingTop: 16, borderTop: "1px solid #2A343D", fontSize: 13, color: "#8593A0" },
  link: { color: "#3B8BEB", textDecoration: "none" },
};
