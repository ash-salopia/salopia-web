"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { listProgrammes } from "@/lib/data/programmes";
import {
  getStoreSettings,
  saveStoreSettings,
  listStoreProducts,
  saveStoreProduct,
  deleteStoreProduct,
  listPurchases,
  DEFAULT_REFUND_POLICY,
  type StoreSettingsForm,
  type StoreProductRow,
  type PurchaseRow,
} from "@/lib/data/store";
import type { Programme } from "@/types";

// Online Programme Store (0124) - coach admin. Connect Stripe (money goes
// straight to the coach's own account; VIS BUILD takes no fee), set up
// the public store page, list programmes for sale, see sales. Buyers
// become athletes and use a seat, so seat usage is shown up top.

type ConnectStatus = { connected: boolean; chargesEnabled: boolean; detailsSubmitted: boolean; requirementsDue?: number };

function weeksOf(p: Programme | undefined): number {
  const offs = (p?.sessions ?? []).map((s) => s.day_offset ?? 0);
  if (!offs.length) return 0;
  return Math.max(1, Math.ceil((Math.max(...offs) - Math.min(...offs) + 1) / 7));
}
const money = (pence: number, currency = "gbp") => new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(pence / 100);

export default function ShopPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connect, setConnect] = useState<ConnectStatus | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectLink, setConnectLink] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof getStoreSettings>> | null>(null);
  const [form, setForm] = useState<StoreSettingsForm>({
    store_slug: "",
    store_name: "",
    store_description: "",
    store_trading_name: "",
    store_contact_email: "",
    store_contact_phone: "",
    store_business_address: "",
    store_refund_policy: "",
  });
  const [savingStore, setSavingStore] = useState(false);
  const [storeMsg, setStoreMsg] = useState("");
  const [products, setProducts] = useState<StoreProductRow[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [editing, setEditing] = useState<Partial<StoreProductRow> & { price: string } | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const st = await getStoreSettings();
      setSettings(st);
      if (!st.canManage) return;
      const [prods, progs, sales, cs] = await Promise.all([
        listStoreProducts(),
        listProgrammes(),
        listPurchases(),
        fetch("/api/store/connect", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setForm({
        store_slug: st.store_slug ?? "",
        store_name: st.store_name ?? st.orgName,
        store_description: st.store_description,
        store_trading_name: st.store_trading_name,
        store_contact_email: st.store_contact_email,
        store_contact_phone: st.store_contact_phone,
        store_business_address: st.store_business_address,
        store_refund_policy: st.store_refund_policy,
      });
      setProducts(prods);
      setProgrammes(progs);
      setPurchases(sales);
      setConnect(cs.error ? null : cs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
      setError(/store_|programme_purchases|stripe_connect/.test(msg) ? "Run migration 0124 in Supabase to turn on the store." : msg);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  // Stripe opens in its own tab, so pick up the new status when the coach
  // comes back to this one.
  useEffect(() => {
    if (!connectLink) return;
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [connectLink, load]);

  const progById = useMemo(() => Object.fromEntries(programmes.map((p) => [p.id, p])), [programmes]);
  const prodById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const storeUrl = settings?.store_slug && typeof window !== "undefined" ? `${window.location.origin}/store/${settings.store_slug}` : "";
  const revenue = purchases.filter((p) => p.status === "paid").reduce((n, p) => n + p.amount_pence, 0);

  const startConnect = async (action?: "dashboard") => {
    // Open the tab during the click itself - browsers block tabs opened
    // after an await. Then point it at Stripe once the link is ready.
    const tab = window.open("", "_blank");
    setConnectBusy(true);
    setError("");
    setLinkCopied(false);
    try {
      const res = await fetch("/api/store/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || "Couldn't open Stripe.");
      if (tab) tab.location.href = json.url;
      if (action !== "dashboard") setConnectLink(json.url);
      else if (!tab) window.location.href = json.url;
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : "Couldn't open Stripe.");
    } finally {
      setConnectBusy(false);
    }
  };

  const copyConnectLink = async () => {
    try {
      await navigator.clipboard.writeText(connectLink);
      setLinkCopied(true);
    } catch {
      window.prompt("Copy this link:", connectLink);
    }
  };

  const saveStore = async () => {
    setSavingStore(true);
    setStoreMsg("");
    try {
      await saveStoreSettings(form);
      setSettings((s) => (s ? { ...s, ...form, store_slug: form.store_slug.trim().toLowerCase() } : s));
      setStoreMsg("Saved");
    } catch (e) {
      setStoreMsg(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSavingStore(false);
    }
  };

  const saveProduct = async () => {
    if (!editing?.programme_id) return setError("Pick a programme.");
    setSavingProduct(true);
    setError("");
    try {
      const saved = await saveStoreProduct({
        id: editing.id,
        programme_id: editing.programme_id,
        title: editing.title ?? "",
        description: editing.description ?? "",
        price_pence: Math.round(parseFloat(editing.price || "0") * 100),
        active: editing.active !== false,
      });
      setProducts((ps) => (editing.id ? ps.map((p) => (p.id === saved.id ? saved : p)) : [...ps, saved]));
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSavingProduct(false);
    }
  };

  const toggleActive = async (p: StoreProductRow) => {
    try {
      const saved = await saveStoreProduct({ ...p, active: !p.active });
      setProducts((ps) => ps.map((x) => (x.id === saved.id ? saved : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update");
    }
  };

  const remove = async (p: StoreProductRow) => {
    if (!confirm(`Remove "${p.title}" from your store? Buyers keep what they've bought.`)) return;
    try {
      await deleteStoreProduct(p.id);
      setProducts((ps) => ps.filter((x) => x.id !== p.id || x.active === false));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove");
    }
  };

  if (loading) return <div style={s.page}><div style={s.muted}>Loading…</div></div>;

  if (settings && !settings.canManage) {
    return (
      <div style={s.page}>
        <h1 style={s.title}>Online Store</h1>
        <section style={s.card}>
          <div style={s.cardTitle}>You don&apos;t have access to the store</div>
          <div style={s.text}>Sales and store listings are visible to the account owner. Ask them to switch on store access for you in Settings → Team.</div>
        </section>
      </div>
    );
  }

  const seats = settings ? { used: settings.athletesUsed, limit: settings.seat_limit } : null;
  const seatPct = seats?.limit ? seats.used / seats.limit : 0;
  const isOwner = settings?.isOwner ?? false;
  const missingDetails = settings
    ? [
        !settings.store_trading_name.trim() && "trading name",
        !settings.store_contact_email.trim() && "contact email",
        !settings.store_refund_policy.trim() && "refund policy",
      ].filter(Boolean) as string[]
    : [];
  const connectedFromStripe = searchParams.get("connect") === "done";

  return (
    <div style={s.page}>
      <h1 style={s.title}>Online Store</h1>
      <p style={s.lead}>Sell programmes online. Buyers pay you directly through Stripe, the programme lands in their training app, and they start it when they&apos;re ready.</p>
      {error && <div style={s.error}>{error}</div>}
      {settings && missingDetails.length > 0 && (
        <div style={s.warn}>Your store can&apos;t take payments yet - add your {missingDetails.join(", ")} under &quot;2 · Your store page&quot; and press Save.</div>
      )}

      {seats?.limit != null && (
        <div style={{ ...s.seatBar, borderColor: seatPct >= 1 ? "#E5484D" : seatPct >= 0.9 ? "#F59E0B" : "var(--line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <b>Athlete seats: {seats.used} of {seats.limit} used</b>
            <span style={s.muted}>Every new buyer becomes an athlete and uses a seat.</span>
          </div>
          <div style={s.track}><div style={{ ...s.fill, width: `${Math.min(seatPct, 1) * 100}%`, background: seatPct >= 1 ? "#E5484D" : seatPct >= 0.9 ? "#F59E0B" : "#1baf7a" }} /></div>
          {seatPct >= 1 ? (
            <div style={{ fontSize: 13, color: "#E5484D", fontWeight: 600 }}>You&apos;re full: new customers can&apos;t buy until you upgrade or archive athletes. Existing athletes can still buy.</div>
          ) : seatPct >= 0.9 ? (
            <div style={{ fontSize: 13, color: "#F59E0B", fontWeight: 600 }}>Nearly full - we&apos;ll email you before you run out.</div>
          ) : null}
        </div>
      )}

      {/* 1. Payments */}
      <section style={s.card}>
        <div style={s.cardHead}>
          <div style={s.cardTitle}>1 · Get paid</div>
          {connect?.chargesEnabled && <span style={{ ...s.pill, color: "#1baf7a", borderColor: "#1baf7a" }}>Connected</span>}
        </div>
        {!connect?.connected ? (
          <>
            <div style={s.text}>Connect your own Stripe account so payments go straight to you. It takes about 5 minutes (bank details and ID). VIS BUILD takes no fee - Stripe&apos;s standard card fee applies.</div>
            <button style={s.primary} disabled={!isOwner || connectBusy} onClick={() => startConnect()}>
              {connectBusy ? "Opening Stripe…" : "Connect Stripe"}
            </button>
            {!isOwner && <div style={s.muted}>Only the account owner can connect payments.</div>}
          </>
        ) : !connect.chargesEnabled ? (
          <>
            <div style={s.text}>{connectedFromStripe ? "Thanks - Stripe is checking your details. This can take a few minutes." : "Your Stripe setup isn't finished yet, so the store can't take payments."}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={s.primary} disabled={!isOwner || connectBusy} onClick={() => startConnect()}>
                {connectBusy ? "Opening Stripe…" : "Finish Stripe setup"}
              </button>
              <button style={s.ghost} onClick={() => load()}>Refresh</button>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ ...s.text, flex: 1 }}>Payments go to your Stripe account. Payouts, refunds and receipts are managed there.</div>
            {isOwner && (
              <button style={s.ghost} disabled={connectBusy} onClick={() => startConnect("dashboard")}>
                Open Stripe dashboard ↗
              </button>
            )}
          </div>
        )}
        {connectLink && !connect?.chargesEnabled && (
          <div style={s.linkBox}>
            <div style={s.muted}>Stripe opened in a new tab. To use a different browser, copy this link - it works once and expires after a few minutes (press the button again for a fresh one).</div>
            <div>
              <button style={s.ghost} onClick={copyConnectLink}>{linkCopied ? "Copied ✓" : "Copy link"}</button>
            </div>
          </div>
        )}
      </section>

      {/* 2. Store page */}
      <section style={s.card}>
        <div style={s.cardTitle}>2 · Your store page</div>
        <label style={s.label}>
          Store name
          <input style={s.input} value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} />
        </label>
        <label style={s.label}>
          Store address
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={s.muted}>{typeof window !== "undefined" ? window.location.host : ""}/store/</span>
            <input style={{ ...s.input, flex: 1 }} value={form.store_slug} placeholder="your-name" onChange={(e) => setForm({ ...form, store_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
          </div>
        </label>
        <label style={s.label}>
          About (shown at the top of your store)
          <textarea style={{ ...s.input, minHeight: 70, fontFamily: "inherit", resize: "vertical" }} value={form.store_description} onChange={(e) => setForm({ ...form, store_description: e.target.value })} />
        </label>

        <div style={s.subHead}>Seller details</div>
        <div style={s.muted}>
          Shown on your store page and in every buyer&apos;s receipt. UK law requires buyers to know who they&apos;re buying from and how to contact you.
          Your store can&apos;t take payments until the trading name, contact email and refund policy are filled in.
        </div>
        <div style={s.twoCol}>
          <label style={s.label}>
            Trading name *
            <input style={s.input} value={form.store_trading_name} onChange={(e) => setForm({ ...form, store_trading_name: e.target.value })} placeholder="e.g. Jane Smith Coaching Ltd" maxLength={120} />
          </label>
          <label style={s.label}>
            Contact email *
            <input style={s.input} type="email" value={form.store_contact_email} onChange={(e) => setForm({ ...form, store_contact_email: e.target.value })} placeholder="hello@yourname.co.uk" />
          </label>
          <label style={s.label}>
            Phone (optional)
            <input style={s.input} value={form.store_contact_phone} onChange={(e) => setForm({ ...form, store_contact_phone: e.target.value })} maxLength={40} />
          </label>
          <label style={s.label}>
            Business address
            <input style={s.input} value={form.store_business_address} onChange={(e) => setForm({ ...form, store_business_address: e.target.value })} placeholder="Town and postcode, or a business address" maxLength={400} />
          </label>
        </div>
        <label style={s.label}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
            Refund policy *
            {!form.store_refund_policy.trim() && (
              <button type="button" style={s.linkBtn} onClick={() => setForm({ ...form, store_refund_policy: DEFAULT_REFUND_POLICY })}>
                Use our suggested policy
              </button>
            )}
          </span>
          <textarea style={{ ...s.input, minHeight: 140, fontFamily: "inherit", resize: "vertical" }} value={form.store_refund_policy} onChange={(e) => setForm({ ...form, store_refund_policy: e.target.value })} maxLength={4000} placeholder="When can buyers get a refund, and how do they ask?" />
        </label>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button style={s.primary} disabled={savingStore} onClick={saveStore}>
            {savingStore ? "Saving…" : "Save"}
          </button>
          {storeMsg && <span style={{ fontSize: 13, color: storeMsg === "Saved" ? "#1baf7a" : "#FF6B6B" }}>{storeMsg}</span>}
          {storeUrl && (
            <>
              <button
                style={s.ghost}
                onClick={() => {
                  navigator.clipboard?.writeText(storeUrl).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? "Copied" : "Copy store link"}
              </button>
              <a style={{ ...s.ghost, textDecoration: "none" }} href={storeUrl} target="_blank" rel="noreferrer">
                View store ↗
              </a>
            </>
          )}
        </div>
      </section>

      {/* 3. Programmes for sale */}
      <section style={s.card}>
        <div style={s.cardHead}>
          <div style={s.cardTitle}>3 · Programmes for sale</div>
          {!editing && (
            <button style={s.primary} onClick={() => setEditing({ programme_id: "", title: "", description: "", price: "", active: true })} disabled={!programmes.length}>
              + Add programme
            </button>
          )}
        </div>
        {!programmes.length && <div style={s.muted}>Build a programme on the Programmes page first, then list it here.</div>}

        {editing && (
          <div style={s.editBox}>
            <label style={s.label}>
              Programme
              <select
                style={s.input}
                value={editing.programme_id ?? ""}
                onChange={(e) => {
                  const p = progById[e.target.value];
                  setEditing({ ...editing, programme_id: e.target.value, title: editing.title || p?.name || "", description: editing.description || p?.description || "" });
                }}
              >
                <option value="">Choose a programme…</option>
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({(p.sessions ?? []).length} sessions{weeksOf(p) ? `, ${weeksOf(p)} week${weeksOf(p) === 1 ? "" : "s"}` : ""})
                  </option>
                ))}
              </select>
            </label>
            <label style={s.label}>
              Title buyers see
              <input style={s.input} value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. 12-Week Rugby S&C" />
            </label>
            <label style={s.label}>
              Description
              <textarea style={{ ...s.input, minHeight: 80, fontFamily: "inherit", resize: "vertical" }} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Who it's for, what's included, equipment needed…" />
            </label>
            <label style={{ ...s.label, maxWidth: 160 }}>
              Price (£)
              <input style={s.input} inputMode="decimal" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="49.00" />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={s.primary} disabled={savingProduct} onClick={saveProduct}>{savingProduct ? "Saving…" : editing.id ? "Save changes" : "Add to store"}</button>
              <button style={s.ghost} onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        )}

        {products.map((p) => (
          <div key={p.id} style={{ ...s.row, opacity: p.active ? 1 : 0.55 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{p.title}</div>
              <div style={s.muted}>
                {progById[p.programme_id]?.name ?? "Programme"} · {(progById[p.programme_id]?.sessions ?? []).length} sessions
                {weeksOf(progById[p.programme_id]) ? ` · ${weeksOf(progById[p.programme_id])} week${weeksOf(progById[p.programme_id]) === 1 ? "" : "s"}` : ""}
                {!p.active ? " · hidden" : ""}
              </div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{money(p.price_pence, p.currency)}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={s.mini} onClick={() => setEditing({ ...p, price: (p.price_pence / 100).toFixed(2) })}>Edit</button>
              <button style={s.mini} onClick={() => toggleActive(p)}>{p.active ? "Hide" : "Show"}</button>
              <button style={{ ...s.mini, color: "#FF6B6B" }} onClick={() => remove(p)}>Remove</button>
            </div>
          </div>
        ))}
      </section>

      {/* 4. Sales */}
      <section style={s.card}>
        <div style={s.cardHead}>
          <div style={s.cardTitle}>Sales</div>
          <span style={s.muted}>{purchases.filter((p) => p.status === "paid").length} paid · {money(revenue)}</span>
        </div>
        {purchases.length === 0 ? (
          <div style={s.muted}>No sales yet. Share your store link to get started.</div>
        ) : (
          purchases.map((p) => (
            <div key={p.id} style={s.row}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{p.buyer_name || p.buyer_email || "Customer"}</div>
                <div style={s.muted}>
                  {(p.product_id && prodById[p.product_id]?.title) || "Programme"} · {new Date(p.paid_at ?? p.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  {p.buyer_email ? ` · ${p.buyer_email}` : ""}
                </div>
                {p.status !== "paid" && p.failure_reason && <div style={{ fontSize: 12, color: "#F59E0B" }}>{p.failure_reason.includes("SEAT") ? "Refunded - no free athlete seat" : `Refunded - ${p.failure_reason}`}</div>}
              </div>
              <span style={{ ...s.pill, color: p.status === "paid" ? "#1baf7a" : "var(--mute)", borderColor: p.status === "paid" ? "#1baf7a" : "var(--line)" }}>{p.status}</span>
              <div style={{ fontWeight: 700, minWidth: 64, textAlign: "right" }}>{money(p.amount_pence, p.currency)}</div>
              {p.athlete_id && (
                <a href={`/athletes/${p.athlete_id}`} style={{ ...s.mini, textDecoration: "none" }}>Athlete →</a>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  subHead: { fontSize: 13, fontWeight: 800, color: "var(--text)", marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--line)" },
  twoCol: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 },
  linkBtn: { background: "none", border: "none", padding: 0, color: "var(--accent)", fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "underline" },
  warn: { background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.4)", color: "#F59E0B", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 14 },
  page: { maxWidth: 820, display: "flex", flexDirection: "column", gap: 16 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 700, margin: 0 },
  lead: { fontSize: 14, color: "var(--mute)", margin: 0, lineHeight: 1.5 },
  error: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  seatBar: { background: "var(--panel)", border: "1px solid", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, fontSize: 14 },
  track: { height: 8, background: "var(--panel2)", borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 12 },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: 800, color: "var(--text)" },
  text: { fontSize: 14, color: "var(--text)", lineHeight: 1.5 },
  linkBox: { display: "flex", flexDirection: "column", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" },
  muted: { fontSize: 12, color: "var(--mute)", lineHeight: 1.45 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--mute)" },
  input: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 11px", fontSize: 14 },
  primary: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 14, fontWeight: 800, cursor: "pointer", alignSelf: "flex-start" },
  ghost: { background: "transparent", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center" },
  mini: { background: "transparent", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 7, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  pill: { fontSize: 10, fontWeight: 800, textTransform: "uppercase", border: "1px solid", borderRadius: 999, padding: "2px 8px" },
  row: { display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line)", flexWrap: "wrap" },
  editBox: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 },
};
