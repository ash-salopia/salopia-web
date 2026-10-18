"use client";

import { useState } from "react";
import type { ResolvedBranding } from "@/types/branding";

// Public Programme Store page (/store/<slug>). Pick a programme, enter
// name + email, pay on Stripe Checkout, land on the thank-you page with
// a link to the training app.

export interface StoreProductView {
  id: string;
  title: string;
  description: string;
  price: string;
  weeks: number;
  sessions: number;
}

export default function StoreView({
  store,
  branding,
}: {
  store: { slug: string; name: string; description: string; canSell: boolean; products: StoreProductView[] };
  branding: ResolvedBranding;
}) {
  const [buying, setBuying] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const checkout = async (productId: string) => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/store/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ slug: store.slug, productId, name, email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error || "Couldn't start checkout.");
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start checkout.");
      setBusy(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.wrap}>
        <header style={s.header}>
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.displayName} style={{ height: 40, maxWidth: 200, objectFit: "contain" }} />
          ) : (
            <div style={{ ...s.brand, color: branding.primaryColor }}>{branding.displayName}</div>
          )}
          <h1 style={s.title}>{store.name}</h1>
          {store.description && <p style={s.desc}>{store.description}</p>}
        </header>

        {!store.canSell && <div style={s.notice}>This store isn&apos;t taking orders right now. Please check back soon.</div>}

        {store.products.length === 0 ? (
          <div style={s.empty}>No programmes listed yet.</div>
        ) : (
          <div style={s.grid}>
            {store.products.map((p) => {
              const open = buying === p.id;
              return (
                <div key={p.id} style={s.card}>
                  <div style={s.meta}>
                    {p.weeks ? `${p.weeks} week${p.weeks === 1 ? "" : "s"}` : "Programme"}
                    {p.sessions ? ` · ${p.sessions} sessions` : ""}
                  </div>
                  <h2 style={s.cardTitle}>{p.title}</h2>
                  {p.description && <p style={s.cardDesc}>{p.description}</p>}
                  <div style={s.buyRow}>
                    <div style={s.price}>{p.price}</div>
                    {!open && (
                      <button style={{ ...s.buyBtn, opacity: store.canSell ? 1 : 0.5 }} disabled={!store.canSell} onClick={() => { setBuying(p.id); setError(""); }}>
                        Buy now
                      </button>
                    )}
                  </div>
                  {open && (
                    <form
                      style={s.form}
                      onSubmit={(e) => {
                        e.preventDefault();
                        checkout(p.id);
                      }}
                    >
                      <label style={s.label}>
                        Your name
                        <input style={s.input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={80} />
                      </label>
                      <label style={s.label}>
                        Email
                        <input style={s.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                      </label>
                      <div style={s.small}>We&apos;ll email your link to the training app here. You&apos;ll pay securely with Stripe on the next page.</div>
                      {error && <div style={s.error}>{error}</div>}
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <button type="submit" style={{ ...s.buyBtn, flex: 1, opacity: busy ? 0.7 : 1 }} disabled={busy}>
                          {busy ? "Opening checkout…" : `Continue to payment · ${p.price}`}
                        </button>
                        <button type="button" style={s.ghost} onClick={() => setBuying(null)} disabled={busy}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <footer style={s.footer}>
          After you buy, the programme waits in your training app until you press Start - then every session lands on your calendar.
          <div style={{ marginTop: 8 }}>Powered by VIS BUILD</div>
        </footer>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "var(--bg)", color: "var(--text)", padding: "32px 16px 48px" },
  wrap: { maxWidth: 880, margin: "0 auto" },
  header: { marginBottom: 24 },
  brand: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: 2 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 40, fontWeight: 700, margin: "14px 0 6px", lineHeight: 1.05 },
  desc: { fontSize: 15, color: "var(--mute)", lineHeight: 1.6, margin: 0, maxWidth: 640, whiteSpace: "pre-wrap" },
  notice: { background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.4)", color: "#F59E0B", borderRadius: 10, padding: "10px 14px", fontSize: 14, marginBottom: 16 },
  empty: { color: "var(--mute)", fontSize: 14, padding: "24px 0" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: 18, display: "flex", flexDirection: "column" },
  meta: { fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.06em" },
  cardTitle: { fontSize: 20, fontWeight: 800, margin: "8px 0 6px", lineHeight: 1.2 },
  cardDesc: { fontSize: 14, color: "var(--mute)", lineHeight: 1.55, margin: 0, whiteSpace: "pre-wrap", flex: 1 },
  buyRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 16 },
  price: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700 },
  buyBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "11px 18px", fontSize: 14, fontWeight: 800, cursor: "pointer" },
  ghost: { background: "transparent", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 14px", fontSize: 14, cursor: "pointer" },
  form: { display: "flex", flexDirection: "column", gap: 10, marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 },
  label: { display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: "var(--mute)" },
  input: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 9, padding: "11px 12px", fontSize: 15 },
  small: { fontSize: 12, color: "var(--mute)", lineHeight: 1.45 },
  error: { fontSize: 13, color: "#FF6B6B", background: "#2a0c0c", border: "1px solid #FF6B6B44", borderRadius: 8, padding: "8px 10px" },
  footer: { marginTop: 32, fontSize: 12, color: "var(--mute)", textAlign: "center", lineHeight: 1.5 },
};
