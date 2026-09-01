"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import PushNotificationToggle from "@/components/PushNotificationToggle";
import type { ComputedZone } from "@/lib/training-zones";
import { rtpMeta } from "@/lib/rtp";

export default function AthleteSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [hidePBs, setHidePBs] = useState(false);
  // Matches the DB default for newly created athletes (0063) - purely
  // cosmetic, overwritten the moment the real fetched value lands.
  const [firstNameOnly, setFirstNameOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [zoneData, setZoneData] = useState<{ enabled: boolean; hasProfile: boolean; usesReserve: boolean; zones: ComputedZone[] } | null>(null);
  const [availability, setAvailability] = useState<{ status: string; note: string | null; since: string | null } | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/athlete-link/training-zones?token=${token}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setZoneData(d); })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/athlete-link/visibility-settings?token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setHidePBs(!!d.hide_pbs_from_feed);
        setFirstNameOnly(!!d.feed_first_name_only);
        setAvailability(d.availability ?? null);
      })
      .catch((e) => setError(e?.message ?? "Could not load settings"))
      .finally(() => setLoading(false));
  }, [token]);

  const save = async (patch: { hide_pbs_from_feed?: boolean; feed_first_name_only?: boolean }) => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/athlete-link/visibility-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...patch }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      // Roll back the toggle that failed
      if (typeof patch.hide_pbs_from_feed === "boolean") setHidePBs((v) => !v);
      if (typeof patch.feed_first_name_only === "boolean") setFirstNameOnly((v) => !v);
    } finally {
      setSaving(false);
    }
  };

  const toggleHidePBs = () => {
    const next = !hidePBs;
    setHidePBs(next);
    save({ hide_pbs_from_feed: next });
  };

  const toggleFirstNameOnly = () => {
    const next = !firstNameOnly;
    setFirstNameOnly(next);
    save({ feed_first_name_only: next });
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.brand}>VIS BUILD</div>
        <button style={s.backBtn} onClick={() => router.push(`/a/${token}`)}>
          ← Sessions
        </button>
      </div>

      <div style={s.content}>
        <div style={s.pageTitle}>🔒 Privacy</div>
        <div style={s.pageSubtitle}>
          Controls how you appear to other athletes in the Community feed. Your coach can
          always see everything, regardless of these settings.
        </div>

        {error && <div style={s.errorBox}>{error}</div>}

        {token && <PushNotificationToggle mode="athlete" token={token} />}

        {availability && (() => {
          const m = rtpMeta(availability.status);
          return (
            <>
              <div style={{ ...s.pageTitle, marginTop: 28 }}>🩹 Your availability</div>
              <div style={s.pageSubtitle}>Set by your coach. Follow this until they change it.</div>
              <div style={{ ...s.card, border: `1px solid ${m.color}66`, background: `${m.color}12` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#0a1420", background: m.color, borderRadius: 5, padding: "3px 9px", textTransform: "uppercase" as const, letterSpacing: "0.03em" }}>{m.label}</span>
                  {availability.since && <span style={{ fontSize: 12, color: "var(--mute)" }}>since {availability.since}</span>}
                </div>
                {availability.note
                  ? <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.5, marginTop: 8, whiteSpace: "pre-wrap" as const }}>{availability.note}</div>
                  : <div style={{ ...s.rowDesc, marginTop: 8 }}>No specific guidance yet — check with your coach about what you can do.</div>}
              </div>
            </>
          );
        })()}

        {loading ? (
          <div style={s.loading}>Loading…</div>
        ) : (
          <div style={s.card}>
            <div style={s.row}>
              <div style={{ flex: 1 }}>
                <div style={s.rowLabel}>Hide my PBs from the feed</div>
                <div style={s.rowDesc}>
                  Your PBs won&apos;t appear in other athletes&apos; Community feed. You&apos;ll still
                  see your own PBs, and your coach still sees everything.
                </div>
              </div>
              <button
                style={{ ...s.toggleSwitch, background: hidePBs ? "var(--accent)" : "var(--panel2)" }}
                onClick={toggleHidePBs}
                disabled={saving}
              >
                <div style={{ ...s.toggleThumb, transform: hidePBs ? "translateX(20px)" : "translateX(0)" }} />
              </button>
            </div>

            <div style={{ ...s.row, borderTop: "1px solid var(--line)", paddingTop: 16, marginTop: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={s.rowLabel}>Only show my first name</div>
                <div style={s.rowDesc}>
                  Other athletes will see just your first name on PBs, comments, reactions,
                  group chat, and competitions. Your coach still sees your full name everywhere.
                </div>
              </div>
              <button
                style={{ ...s.toggleSwitch, background: firstNameOnly ? "var(--accent)" : "var(--panel2)" }}
                onClick={toggleFirstNameOnly}
                disabled={saving}
              >
                <div style={{ ...s.toggleThumb, transform: firstNameOnly ? "translateX(20px)" : "translateX(0)" }} />
              </button>
            </div>

            {saved && <div style={s.savedMsg}>✓ Saved</div>}
          </div>
        )}

        {zoneData?.enabled !== false && <>
        <div style={{ ...s.pageTitle, marginTop: 28 }}>🫀 Training zones</div>
        <div style={s.pageSubtitle}>
          Your heart-rate and pace targets for each conditioning zone. Set by your coach.
        </div>
        <div style={s.card}>
          {!zoneData ? (
            <div style={s.loading}>Loading…</div>
          ) : !zoneData.hasProfile ? (
            <div style={s.rowDesc}>Your coach hasn&apos;t added your Max HR or MAS yet — ask them to set it up so your zones show here.</div>
          ) : (
            <>
              <table style={s.zoneTable}>
                <thead>
                  <tr>
                    <th style={{ ...s.zTh, textAlign: "left" }}>Zone</th>
                    <th style={s.zTh}>Heart rate</th>
                    <th style={s.zTh}>Pace /km</th>
                    <th style={s.zTh}>Speed</th>
                  </tr>
                </thead>
                <tbody>
                  {zoneData.zones.map((z) => (
                    <tr key={z.n}>
                      <td style={{ ...s.zTd, textAlign: "left" }}><strong style={{ color: "var(--text)" }}>Z{z.n}</strong> {z.name}</td>
                      <td style={s.zTd}>{z.hr ? `${z.hr.low}–${z.hr.high}` : "—"}</td>
                      <td style={s.zTd}>{z.pace ? `${z.pace.low}–${z.pace.high}` : "—"}</td>
                      <td style={s.zTd}>{z.speed ? `${z.speed.low}–${z.speed.high} km/h` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ ...s.rowDesc, marginTop: 8 }}>
                {zoneData.usesReserve
                  ? "HR bands use your heart-rate reserve (resting to max)."
                  : "HR bands are a percentage of your max HR."}
              </div>
            </>
          )}
        </div>
        </>}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" },
  header: { height: 56, background: "var(--ink)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0 },
  brand: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: 2, color: "var(--accent)" },
  backBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" },
  content: { padding: 16, display: "flex", flexDirection: "column", gap: 12, maxWidth: 480, width: "100%" },
  pageTitle: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, color: "var(--text)", marginBottom: -4 },
  pageSubtitle: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5 },
  errorBox: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  loading: { fontSize: 14, color: "var(--mute)", padding: "20px 0" },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 4 },
  row: { display: "flex", alignItems: "flex-start", gap: 14 },
  rowLabel: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  rowDesc: { fontSize: 12, color: "var(--mute)", marginTop: 3, lineHeight: 1.45 },
  toggleSwitch: { width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative" as const, flexShrink: 0, transition: "background 0.2s" },
  toggleThumb: { position: "absolute" as const, top: 3, left: 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "transform 0.2s" },
  savedMsg: { fontSize: 12, color: "var(--good)", fontWeight: 600, marginTop: 10 },
  zoneTable: { width: "100%", borderCollapse: "collapse" as const, fontSize: 12 },
  zTh: { textAlign: "center" as const, fontSize: 10, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.03em", padding: "0 6px 6px", borderBottom: "1px solid var(--line)" },
  zTd: { textAlign: "center" as const, padding: "7px 6px", color: "var(--mute)", borderBottom: "1px solid var(--line)" },
};
