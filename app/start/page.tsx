// Public marketing/signup landing page - the shareable link for
// getting new coaches to sign up, since /login itself is a bare
// email-and-org-name form with no context for a cold visitor. See
// middleware.ts's skipsAuthCheck for why this route is public.

const FEATURES = [
  {
    title: "Rapid programming",
    desc: "Build sessions from notes, voice, or by importing a PDF or CSV - no re-typing a programme that already exists somewhere else.",
  },
  {
    title: "Rapid reporting",
    desc: "Visual charts, % changes, and AI-written summaries - generated in seconds, not built by hand.",
  },
  {
    title: "Testing & normative reporting",
    desc: "Log physical testing data and get advanced reports benchmarked against normative data, with AI summaries.",
  },
  {
    title: "Coach dashboard",
    desc: "See programmes expiring, reports due, athlete compliance, and comments - all at a glance, not buried in a spreadsheet.",
  },
  {
    title: "Live group / whiteboard",
    desc: "Log data for a whole group session in real time as you move around the room - no laptop, no writing it up afterwards.",
  },
];

const EXTRAS = [
  "Video exercise library with 1-click YouTube upload",
  "Community: athlete PBs, competitions, likes & comments",
  "Group and athlete chats",
  "Documents section",
  "Fully customisable settings, including your own branding",
];

export default function StartPage() {
  return (
    <div style={s.page}>
      <div style={s.hero}>
        <div style={s.title}>VIS BUILD</div>
        <div style={s.tagline}>Coaching software for coaches who train people, not spreadsheets.</div>
        <p style={s.subtext}>
          Everything below, in one place. Currently free while in trial.
        </p>
        <div style={s.ctaRow}>
          <a href="/login?signup=1" style={s.primaryBtn}>Start your free trial</a>
          <a href="/login" style={s.ghostBtn}>Already have an account? Sign in</a>
        </div>
      </div>

      <div style={s.features}>
        {FEATURES.map((f) => (
          <div key={f.title} style={s.featureCard}>
            <div style={s.featureTitle}>{f.title}</div>
            <div style={s.featureDesc}>{f.desc}</div>
          </div>
        ))}
      </div>

      <div style={s.extras}>
        <div style={s.extrasTitle}>Also included</div>
        <div style={s.extrasList}>
          {EXTRAS.map((e) => (
            <div key={e} style={s.extraItem}>{e}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0F1418",
    color: "#E8EDF1",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "64px 20px 48px",
  },
  hero: {
    width: "100%",
    maxWidth: 560,
    textAlign: "center" as const,
    marginBottom: 48,
  },
  title: {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 700,
    fontSize: 34,
    letterSpacing: 3,
    color: "#3B8BEB",
    marginBottom: 10,
  },
  tagline: {
    fontSize: 18,
    fontWeight: 600,
    color: "#E8EDF1",
    marginBottom: 12,
    lineHeight: 1.4,
  },
  subtext: {
    fontSize: 14,
    color: "#8593A0",
    lineHeight: 1.6,
    margin: "0 0 28px",
  },
  ctaRow: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 10,
  },
  primaryBtn: {
    display: "inline-block",
    background: "#3B8BEB",
    color: "#0a1420",
    borderRadius: 10,
    padding: "13px 28px",
    fontSize: 15,
    fontWeight: 700,
    textDecoration: "none",
  },
  ghostBtn: {
    display: "inline-block",
    color: "#8593A0",
    fontSize: 13,
    textDecoration: "underline",
  },
  features: {
    width: "100%",
    maxWidth: 720,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 14,
  },
  featureCard: {
    background: "#171D23",
    border: "1px solid #2A343D",
    borderRadius: 12,
    padding: "18px 20px",
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#E8EDF1",
    marginBottom: 6,
  },
  featureDesc: {
    fontSize: 13,
    color: "#8593A0",
    lineHeight: 1.5,
  },
  extras: {
    width: "100%",
    maxWidth: 720,
    marginTop: 32,
    paddingTop: 28,
    borderTop: "1px solid #2A343D",
  },
  extrasTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: "#8593A0",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: 12,
    textAlign: "center" as const,
  },
  extrasList: {
    display: "flex",
    flexWrap: "wrap" as const,
    justifyContent: "center",
    gap: 8,
  },
  extraItem: {
    background: "#171D23",
    border: "1px solid #2A343D",
    borderRadius: 20,
    padding: "7px 14px",
    fontSize: 12,
    color: "#B8C2CC",
  },
};
