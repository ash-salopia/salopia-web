"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AthletePageHeading from "@/components/AthletePageHeading";

// The athlete's programme library (0124): programmes they've bought or
// been given, each started when they're ready (sessions land on their
// calendar from the chosen date), plus their coach's store to buy more.

interface LibraryItem {
  id: string;
  title: string;
  status: "ready" | "active" | "completed";
  startDate: string | null;
  weeks: number;
  sessions: number;
}
interface StoreProduct {
  id: string;
  title: string;
  description: string;
  price: string;
  weeks: number;
  sessions: number;
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function nextMonday(): string {
  const d = new Date();
  const add = ((8 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + add);
  return iso(d);
}
function fmt(isoDate: string) {
  return new Date(isoDate + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export default function AthleteProgrammesPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [store, setStore] = useState<{ name: string; products: StoreProduct[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(iso(new Date()));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ text: string; startDate: string } | null>(null);
  const viewCalendar = (date: string) => router.push(`/a/${token}?week=${date}`);

  const load = useCallback(() => {
    fetch(`/api/athlete-link/programmes?token=${token}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setLibrary(d.library ?? []);
        setStore(d.store ?? null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const start = async (item: LibraryItem) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/athlete-link/programmes/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token, id: item.id, startDate }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't start the programme.");
      setDone({ text: `${item.title} starts ${fmt(startDate)} - ${json.sessions} sessions are on your calendar.`, startDate });
      setStarting(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the programme.");
    } finally {
      setBusy(false);
    }
  };

  const buy = async (productId: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/store/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token, productId }),
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
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => router.push(`/a/${token}`)}>← Back</button>
        <div style={s.brand}>VIS BUILD</div>
        <div style={{ width: 60 }} />
      </div>
      <AthletePageHeading title="My Programmes" />

      <div style={s.content}>
        {error && <div style={s.errorBox}>{error}</div>}
        {done && (
          <div style={s.okBox}>
            <div>✓ {done.text}</div>
            <button style={{ ...s.primary, marginTop: 10, width: "100%" }} onClick={() => viewCalendar(done.startDate)}>
              View calendar
            </button>
          </div>
        )}

        {loading ? (
          <div style={s.muted}>Loading…</div>
        ) : library.length === 0 ? (
          <div style={s.empty}>
            
            <div style={{ fontWeight: 700 }}>No programmes yet</div>
            <div style={s.muted}>Programmes you buy will appear here, ready to start whenever you are.</div>
          </div>
        ) : (
          library.map((item) => (
            <div key={item.id} style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={s.cardTitle}>{item.title}</div>
                  <div style={s.muted}>
                    {item.weeks ? `${item.weeks} week${item.weeks === 1 ? "" : "s"} · ` : ""}
                    {item.sessions} sessions
                  </div>
                </div>
                <span style={{ ...s.pill, color: item.status === "ready" ? "var(--accent)" : "#1baf7a", borderColor: item.status === "ready" ? "var(--accent)" : "#1baf7a" }}>
                  {item.status === "ready" ? "Ready" : item.status === "active" ? "In progress" : "Completed"}
                </span>
              </div>

              {item.status === "active" && item.startDate && (
                <>
                  <div style={{ ...s.muted, marginTop: 8 }}>Started {fmt(item.startDate)} - your sessions are on your calendar.</div>
                  <button style={{ ...s.ghost, marginTop: 10, width: "100%" }} onClick={() => viewCalendar(item.startDate!)}>
                    View calendar
                  </button>
                </>
              )}

              {item.status === "ready" &&
                (starting === item.id ? (
                  <div style={s.startBox}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>When do you want to start?</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[
                        ["Today", iso(new Date())],
                        ["Next Monday", nextMonday()],
                      ].map(([label, d]) => (
                        <button key={label} style={{ ...s.chip, ...(startDate === d ? s.chipOn : {}) }} onClick={() => setStartDate(d)}>
                          {label}
                        </button>
                      ))}
                      <input type="date" value={startDate} min={iso(new Date())} onChange={(e) => setStartDate(e.target.value)} style={s.date} />
                    </div>
                    <div style={s.muted}>Every session will be added to your calendar from {fmt(startDate)}.</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={{ ...s.primary, flex: 1, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={() => start(item)}>
                        {busy ? "Adding sessions…" : "Start programme"}
                      </button>
                      <button style={s.ghost} onClick={() => setStarting(null)} disabled={busy}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button style={{ ...s.primary, marginTop: 12, width: "100%" }} onClick={() => { setStarting(item.id); setDone(null); setStartDate(iso(new Date())); }}>
                    Start when ready
                  </button>
                ))}
            </div>
          ))
        )}

        {store && store.products.length > 0 && (
          <>
            <div style={s.sectionLabel}>More from {store.name}</div>
            {store.products.map((p) => (
              <div key={p.id} style={s.card}>
                <div style={s.cardTitle}>{p.title}</div>
                <div style={s.muted}>
                  {p.weeks ? `${p.weeks} week${p.weeks === 1 ? "" : "s"} · ` : ""}
                  {p.sessions} sessions
                </div>
                {p.description && <div style={{ fontSize: 13, color: "var(--text)", marginTop: 6, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{p.description}</div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700 }}>{p.price}</div>
                  <button style={{ ...s.primary, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={() => buy(p.id)}>Buy</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" },
  header: { height: 56, background: "var(--ink)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0 },
  brand: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18, color: "var(--accent)" },
  backBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" },
  content: { padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 480, width: "100%" },
  errorBox: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  okBox: { background: "rgba(27,175,122,.12)", color: "#1baf7a", border: "1px solid rgba(27,175,122,.35)", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 600 },
  muted: { fontSize: 12, color: "var(--mute)", lineHeight: 1.45 },
  empty: { textAlign: "center", padding: "32px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "var(--text)" },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 3 },
  pill: { fontSize: 10, fontWeight: 800, textTransform: "uppercase", border: "1px solid", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" },
  startBox: { marginTop: 12, display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 12 },
  chip: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 999, padding: "7px 12px", fontSize: 13, cursor: "pointer" },
  chipOn: { borderColor: "var(--accent)", background: "var(--accent-dim)", color: "var(--accent)", fontWeight: 700 },
  date: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "6px 8px", fontSize: 13 },
  primary: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 14, fontWeight: 800, cursor: "pointer" },
  ghost: { background: "transparent", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 9, padding: "10px 14px", fontSize: 14, cursor: "pointer" },
  sectionLabel: { fontSize: 11, fontWeight: 800, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 10 },
};
