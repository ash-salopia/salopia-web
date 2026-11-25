"use client";

// Athlete app -> Settings: the weights at the athlete's own gym, so the
// quick-pick load buttons offer weights that exist there (e.g. dumbbells
// every 2.5kg). Off = the coach's default.

import { useEffect, useState } from "react";
import GymIncrementsPicker from "@/components/GymIncrementsPicker";
import { resolveIncrements, type LoadIncrements } from "@/lib/load-increments";

export default function MyGymWeights({ token }: { token: string }) {
  const [own, setOwn] = useState<LoadIncrements | null>(null);
  const [coach, setCoach] = useState<LoadIncrements>(resolveIncrements(null, null));
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch(`/api/athlete-link/load-increments?token=${token}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setCoach(d.coach);
        setOwn(d.own ? resolveIncrements(d.own, d.coach) : null);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [token]);

  const save = async (next: LoadIncrements | null) => {
    const before = own;
    setOwn(next);
    setStatus("Saving…");
    try {
      const res = await fetch("/api/athlete-link/load-increments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, increments: next }),
        cache: "no-store",
      });
      const d = await res.json();
      if (d.error) setOwn(before); // not saved - put it back as it was
      setStatus(d.error ? d.error : "Saved");
    } catch {
      setOwn(before);
      setStatus("Could not save - check your connection");
    }
    setTimeout(() => setStatus(""), 2500);
  };

  if (!loaded) return null;
  return (
    <div style={s.card}>
      <div style={s.title}>My gym&apos;s weights</div>
      <div style={s.desc}>
        When you tap a kg box, quick-pick buttons offer the weight one step lighter, the same and one step heavier. Set how
        your gym&apos;s weights go up so the steps match what&apos;s on the rack.
      </div>
      <label style={s.check}>
        <input type="checkbox" checked={!!own} onChange={(e) => save(e.target.checked ? { ...coach } : null)} style={{ accentColor: "var(--accent)", width: 18, height: 18 }} />
        I train at a different gym (set my own weights)
      </label>
      <GymIncrementsPicker value={own ?? coach} onChange={(next) => save(next)} disabled={!own} />
      {!own && <div style={s.desc}>Using your coach&apos;s settings.</div>}
      {status && <div style={{ ...s.desc, color: status === "Saved" ? "var(--good)" : "var(--mute)" }}>{status}</div>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10, marginTop: 16 },
  title: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  desc: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5 },
  check: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--text)", cursor: "pointer" },
};
