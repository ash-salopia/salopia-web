"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

// After Stripe Checkout. Confirms the payment with the server (which
// fulfils it if the webhook hasn't yet) and hands over the training-app
// link. Polls briefly, since a payment can take a moment to settle.

type Result = { status: "paid" | "pending" | "failed"; athleteToken?: string; programmeTitle?: string; reason?: string };

export default function StoreThanks() {
  const params = useSearchParams();
  const sessionId = params.get("session_id") ?? "";
  const orgId = params.get("o") ?? "";
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const check = async () => {
      tries++;
      try {
        const res = await fetch("/api/store/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ sessionId, organisationId: orgId }),
        });
        const json: Result = await res.json();
        if (cancelled) return;
        if (json.status === "pending" && tries < 8) {
          setTimeout(check, 2000);
          return;
        }
        setResult(json);
      } catch {
        if (!cancelled) setResult({ status: "pending" });
      }
    };
    if (sessionId && orgId) check();
    else setResult({ status: "failed", reason: "Missing payment details." });
    return () => {
      cancelled = true;
    };
  }, [sessionId, orgId]);

  return (
    <div style={s.page}>
      <div style={s.card}>
        {!result ? (
          <>
            <div style={s.big}>⏳</div>
            <h1 style={s.title}>Confirming your payment…</h1>
            <p style={s.text}>This only takes a moment.</p>
          </>
        ) : result.status === "paid" ? (
          <>
            <div style={s.big}>✅</div>
            <h1 style={s.title}>You&apos;re in!</h1>
            <p style={s.text}>
              <b>{result.programmeTitle}</b> is waiting in your training app. Open it, go to <b>My Programmes</b> and press <b>Start</b> when
              you&apos;re ready - every session lands on your calendar from that day.
            </p>
            {result.athleteToken && (
              <a href={`/a/${result.athleteToken}/programmes`} style={s.btn}>
                Open my training app
              </a>
            )}
            <p style={s.small}>We&apos;ve also emailed you the link. Bookmark it or add it to your home screen - it&apos;s your personal login, so keep it to yourself.</p>
          </>
        ) : result.status === "pending" ? (
          <>
            <div style={s.big}>⏳</div>
            <h1 style={s.title}>Payment still processing</h1>
            <p style={s.text}>Your payment is taking a little longer to confirm. You&apos;ll get an email with your app link as soon as it does.</p>
          </>
        ) : (
          <>
            <div style={s.big}>⚠️</div>
            <h1 style={s.title}>We couldn&apos;t complete your purchase</h1>
            <p style={s.text}>{result.reason?.includes("SEAT") ? "The coach can't take new athletes right now." : "Something went wrong setting up your programme."} If you were charged, it has been refunded in full.</p>
          </>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: "28px 24px", maxWidth: 460, width: "100%", textAlign: "center" },
  big: { fontSize: 42 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 700, margin: "10px 0 8px" },
  text: { fontSize: 15, lineHeight: 1.6, color: "var(--text)", margin: "0 0 18px" },
  btn: { display: "inline-block", background: "var(--accent)", color: "#0a1420", borderRadius: 10, padding: "12px 20px", fontWeight: 800, fontSize: 15, textDecoration: "none" },
  small: { fontSize: 12, color: "var(--mute)", lineHeight: 1.5, marginTop: 18 },
};
