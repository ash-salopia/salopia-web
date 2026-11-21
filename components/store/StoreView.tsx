"use client";

import { useState } from "react";
import type { ResolvedBranding } from "@/types/branding";
import type { StoreSeller } from "@/lib/store/server";
import CheckoutConsent from "@/components/store/CheckoutConsent";
import ProgrammeFinder, { EMPTY_ANSWERS } from "@/components/store/ProgrammeFinder";
import {
  EQUIPMENT, GOALS, TAGS, ageFits, ageRangeLabel, equipmentLabel, goalLabel, hasAttributes, levelLabel,
  missingEquipment, rankProgrammes, tagLabel, type FinderAnswers, type MatchResult, type MatchableProduct,
} from "@/lib/store/match";

// Public Programme Store page (/store/<slug>). Pick a programme, enter
// name + email, pay on Stripe Checkout, land on the thank-you page with
// a link to the training app.

export interface StoreProductView extends MatchableProduct {
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
  store: { slug: string; name: string; description: string; canSell: boolean; seller: StoreSeller; products: StoreProductView[] };
  branding: ResolvedBranding;
}) {
  const [buying, setBuying] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Filters (0131). Empty = no filter.
  const [fAge, setFAge] = useState("");
  const [fEquip, setFEquip] = useState("");
  const [fGoal, setFGoal] = useState("");
  const [fTag, setFTag] = useState("");
  // "Find your ideal programme": null = not answered yet.
  const [finderOpen, setFinderOpen] = useState(false);
  const [answers, setAnswers] = useState<FinderAnswers | null>(null);

  const checkout = async (productId: string) => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/store/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ slug: store.slug, productId, name, email, acceptTerms: agreed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error || "Couldn't start checkout.");
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start checkout.");
      setBusy(false);
    }
  };

  const products = store.products;
  // Only offer filters/questions the coach has actually filled in.
  const uses = {
    any: products.some(hasAttributes),
    age: products.some((p) => p.ageMin != null || p.ageMax != null),
    equipment: products.some((p) => p.equipment.length > 0),
    goals: GOALS.filter((g) => products.some((p) => p.goals.includes(g.key))),
    tags: TAGS.filter((t) => products.some((p) => p.tags.includes(t.key))),
  };
  const ageNum = parseInt(fAge, 10);
  const filtered = products.filter((p) =>
    (!Number.isFinite(ageNum) || ageFits(p, ageNum)) &&
    (!fEquip || missingEquipment(p.equipment, [fEquip]).length === 0) &&
    (!fGoal || p.goals.includes(fGoal)) &&
    (!fTag || p.tags.includes(fTag))
  );
  const filtering = !!(fAge || fEquip || fGoal || fTag);
  const clearFilters = () => { setFAge(""); setFEquip(""); setFGoal(""); setFTag(""); };
  const ranked = answers ? rankProgrammes(products, answers) : null;
  const fitting = ranked?.filter((r) => r.match.fits) ?? [];
  const notFitting = ranked?.filter((r) => !r.match.fits) ?? [];

  const card = (p: StoreProductView, match?: MatchResult, best?: boolean) => {
    const open = buying === p.id;
    const pills = [
      ageRangeLabel(p),
      p.level ? levelLabel(p.level) : null,
      ...(p.equipment.length ? p.equipment.map(equipmentLabel) : []),
      ...p.tags.map(tagLabel),
    ].filter((x): x is string => !!x);
    return (
      <div key={p.id} style={{ ...s.card, ...(best ? s.bestCard : null), ...(match && !match.fits ? { opacity: 0.7 } : null) }}>
        {best && <div style={s.bestBadge}>Best match</div>}
        <div style={s.meta}>
          {p.weeks ? `${p.weeks} week${p.weeks === 1 ? "" : "s"}` : "Programme"}
          {p.sessions ? ` · ${p.sessions} sessions` : ""}
        </div>
        <h2 style={s.cardTitle}>{p.title}</h2>
        {pills.length > 0 && (
          <div style={s.pills}>
            {pills.map((x) => <span key={x} style={s.pill}>{x}</span>)}
          </div>
        )}
        {p.goals.length > 0 && <div style={s.goals}>{p.goals.map(goalLabel).join(" · ")}</div>}
        {match && (match.reasons.length > 0 || match.warnings.length > 0) && (
          <div style={s.matchBox}>
            {match.reasons.map((r) => <div key={r} style={s.reason}>✓ {r}</div>)}
            {match.warnings.map((w) => <div key={w} style={s.warning}>! {w}</div>)}
          </div>
        )}
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
            <CheckoutConsent storeName={store.seller.tradingName || store.name} refundPolicy={store.seller.refundPolicy} checked={agreed} onChange={setAgreed} />
            {error && <div style={s.error}>{error}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button type="submit" style={{ ...s.buyBtn, flex: 1, opacity: busy || !agreed ? 0.6 : 1 }} disabled={busy || !agreed}>
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

        {products.length === 0 ? (
          <div style={s.empty}>No programmes listed yet.</div>
        ) : (
          <>
            {uses.any && products.length > 1 && (
              <div style={s.finderBanner}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 17 }}>Not sure which programme is right for you?</div>
                  <div style={{ fontSize: 14, color: "var(--mute)", marginTop: 2 }}>Answer 6 quick questions and we&apos;ll point you to the best fit.</div>
                </div>
                <button type="button" style={s.buyBtn} onClick={() => setFinderOpen(true)}>Find your ideal programme</button>
              </div>
            )}

            {ranked ? (
              <>
                <div style={s.resultsHead}>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>
                    {!fitting.length ? "No exact match - here's the closest"
                      : fitting[0].match.score > 0 ? `Your best match${fitting.length > 1 ? "es" : ""}`
                      : "Programmes that fit your answers"}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" style={s.ghostSm} onClick={() => setFinderOpen(true)}>Change answers</button>
                    <button type="button" style={s.ghostSm} onClick={() => setAnswers(null)}>Show all</button>
                  </div>
                </div>
                {!fitting.length && store.seller.email && (
                  <div style={s.notice}>
                    Nothing here fits everything you told us.{" "}
                    <a href={`mailto:${store.seller.email}`} style={{ color: "inherit", fontWeight: 700 }}>Get in touch</a> and we can point you in the right direction.
                  </div>
                )}
                <div style={s.grid}>{(fitting.length ? fitting : ranked.slice(0, 3)).map((r, idx) => card(r.product, r.match, idx === 0 && fitting.length > 0 && r.match.score > 0))}</div>
                {fitting.length > 0 && notFitting.length > 0 && (
                  <>
                    <div style={{ ...s.resultsHead, marginTop: 28 }}><div style={{ fontWeight: 800, fontSize: 16, color: "var(--mute)" }}>Other programmes</div></div>
                    <div style={s.grid}>{notFitting.map((r) => card(r.product, r.match))}</div>
                  </>
                )}
              </>
            ) : (
              <>
                {uses.any && (
                  <div style={s.filters}>
                    <span style={s.filterLabel}>Filter by</span>
                    {uses.age && (
                      <input style={{ ...s.filterInput, width: 90 }} inputMode="numeric" placeholder="Age" aria-label="Age" value={fAge} onChange={(e) => setFAge(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} />
                    )}
                    {uses.equipment && (
                      <select style={s.filterInput} value={fEquip} onChange={(e) => setFEquip(e.target.value)} aria-label="Equipment I have">
                        <option value="">Any equipment</option>
                        {EQUIPMENT.map((x) => <option key={x.key} value={x.key}>{x.key === "none" ? "No equipment" : `I have: ${x.label}`}</option>)}
                      </select>
                    )}
                    {uses.goals.length > 0 && (
                      <select style={s.filterInput} value={fGoal} onChange={(e) => setFGoal(e.target.value)} aria-label="Goal">
                        <option value="">Any goal</option>
                        {uses.goals.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                      </select>
                    )}
                    {uses.tags.length > 0 && (
                      <select style={s.filterInput} value={fTag} onChange={(e) => setFTag(e.target.value)} aria-label="Suitable for">
                        <option value="">Suitable for anyone</option>
                        {uses.tags.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                      </select>
                    )}
                    {filtering && <button type="button" style={s.ghostSm} onClick={clearFilters}>Clear</button>}
                  </div>
                )}
                {filtered.length === 0 ? (
                  <div style={s.empty}>
                    No programmes match those filters. <button type="button" style={s.linkBtn} onClick={clearFilters}>Clear filters</button>
                  </div>
                ) : (
                  <div style={s.grid}>{filtered.map((p) => card(p))}</div>
                )}
              </>
            )}
          </>
        )}

        <p style={s.afterBuy}>After you buy, the programme waits in your training app until you press Start - then every session lands on your calendar.</p>

        <section style={{ ...s.seller, marginTop: 12 }}>
          <div style={s.sellerTitle}>Seller details</div>
          <div style={s.sellerText}>
            {[store.seller.tradingName || store.name, store.seller.address].filter(Boolean).join(" · ")}
            {store.seller.email && (
              <>
                <br />
                <a href={`mailto:${store.seller.email}`} style={{ color: "var(--accent)" }}>{store.seller.email}</a>
                {store.seller.phone ? ` · ${store.seller.phone}` : ""}
              </>
            )}
          </div>
          {store.seller.refundPolicy && (
            <details style={{ marginTop: 10 }}>
              <summary style={s.summary}>Refund policy</summary>
              <div style={{ ...s.sellerText, whiteSpace: "pre-wrap", marginTop: 8 }}>{store.seller.refundPolicy}</div>
            </details>
          )}
        </section>

        <footer style={s.footer}>
          <div>
            Powered by VIS BUILD ·{" "}
            <a href="/privacy" style={{ color: "var(--mute)" }}>Privacy</a>
          </div>
        </footer>
      </div>
      {finderOpen && (
        <ProgrammeFinder
          initial={answers ?? EMPTY_ANSWERS}
          onClose={() => setFinderOpen(false)}
          onDone={(a) => {
            setAnswers(a);
            setFinderOpen(false);
            clearFilters();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
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
  seller: { marginTop: 32, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: "16px 18px" },
  sellerTitle: { fontSize: 11, fontWeight: 800, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 },
  sellerText: { fontSize: 13, color: "var(--text)", lineHeight: 1.55 },
  summary: { fontSize: 13, fontWeight: 700, color: "var(--accent)", cursor: "pointer" },
  bestCard: { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" },
  bestBadge: { alignSelf: "flex-start", background: "var(--accent)", color: "#0a1420", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", borderRadius: 6, padding: "3px 8px", marginBottom: 8 },
  pills: { display: "flex", flexWrap: "wrap", gap: 5, margin: "2px 0 8px" },
  pill: { fontSize: 11, fontWeight: 700, color: "var(--text)", background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 999, padding: "3px 9px" },
  goals: { fontSize: 12, color: "var(--accent)", fontWeight: 700, marginBottom: 8 },
  matchBox: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", marginBottom: 10, display: "flex", flexDirection: "column", gap: 3 },
  reason: { fontSize: 13, color: "#22C55E", fontWeight: 600 },
  warning: { fontSize: 13, color: "#F59E0B", fontWeight: 600 },
  finderBanner: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", background: "var(--panel)", border: "1px solid var(--accent)", borderRadius: 14, padding: "14px 16px", marginBottom: 16 },
  filters: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 },
  filterLabel: { fontSize: 12, fontWeight: 800, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.06em" },
  filterInput: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 9, padding: "9px 10px", fontSize: 14, maxWidth: "100%" },
  ghostSm: { background: "transparent", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 9, padding: "8px 12px", fontSize: 13, cursor: "pointer" },
  linkBtn: { background: "none", border: "none", color: "var(--accent)", fontWeight: 700, cursor: "pointer", fontSize: 14, padding: 0 },
  resultsHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 },
  afterBuy: { margin: "32px 0 0", fontSize: 13, color: "var(--mute)", textAlign: "center", lineHeight: 1.5 },
  footer: { marginTop: 32, fontSize: 12, color: "var(--mute)", textAlign: "center", lineHeight: 1.5 },
};
