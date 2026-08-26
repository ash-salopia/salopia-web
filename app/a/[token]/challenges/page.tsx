"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { MetricBoxes } from "@/components/MetricBoxes";
import ChallengeLeaderboard, { type ChallengeLeaderboardGroup } from "@/components/ChallengeLeaderboard";
import { METRIC_META, parseMetricNumber, type MetricValues } from "@/lib/cardio-metrics";
import type { ChallengeResultRow } from "@/lib/challenges";
import type { Challenge } from "@/lib/data/challenges";

export default function AthleteChallengesPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [groups, setGroups] = useState<ChallengeLeaderboardGroup[]>([]);
  const [results, setResults] = useState<ChallengeResultRow[]>([]);
  const [challengesEnabled, setChallengesEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [entryValues, setEntryValues] = useState<Record<string, MetricValues>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [flash, setFlash] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/athlete-link/challenges?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setChallengesEnabled(data.challengesEnabled !== false);
        setChallenges(data.challenges ?? []);
        setGroups(data.groups ?? []);
        setResults(data.results ?? []);
      })
      .catch((e) => setError(e?.message ?? "Could not load challenges"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (challenge: Challenge) => {
    const values = entryValues[challenge.id] ?? {};
    const raw = values[challenge.metric_key];
    const value = parseMetricNumber(raw);
    if (value == null) return;
    setSaving(challenge.id);
    setError("");
    try {
      const res = await fetch("/api/athlete-link/challenge-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, challengeId: challenge.id, value }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setResults((prev) => [
        { id: `local-${Date.now()}`, challenge_id: challenge.id, athlete_id: "", value, logged_by: "athlete", logged_at: new Date().toISOString() },
        ...prev,
      ]);
      setEntryValues((prev) => ({ ...prev, [challenge.id]: {} }));
      setFlash("Result logged");
      setTimeout(() => setFlash(""), 3000);
    } catch (e: any) {
      setError(e?.message ?? "Could not save result");
    } finally {
      setSaving(null);
    }
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
        <div style={s.pageTitle}>🏆 Challenges</div>

        {error && <div style={s.errorBox}>{error}</div>}
        {flash && <div style={s.flashBox}>{flash}</div>}

        {loading ? (
          <div style={s.loading}>Loading…</div>
        ) : !challengesEnabled ? (
          <div style={s.emptyState}>
            <div style={s.emptyIcon}>🏆</div>
            <div style={s.emptyText}>Challenges aren&apos;t switched on right now.</div>
          </div>
        ) : challenges.length === 0 ? (
          <div style={s.emptyState}>
            <div style={s.emptyIcon}>🏆</div>
            <div style={s.emptyText}>No challenges yet.</div>
            <div style={s.emptySubtext}>Your coach hasn&apos;t set any up - check back after your next session.</div>
          </div>
        ) : (
          challenges.map((c) => {
            const isOpen = expanded === c.id;
            const challengeResults = results.filter((r) => r.challenge_id === c.id);
            return (
              <div key={c.id} style={s.card}>
                <button style={s.cardHeader} onClick={() => setExpanded(isOpen ? null : c.id)}>
                  <div>
                    <div style={s.cardLabel}>{c.name}</div>
                    <div style={s.cardSub}>
                      {METRIC_META[c.metric_key].label}
                      {c.duration_cap_seconds ? ` · ${c.duration_cap_seconds}s` : ""}
                    </div>
                  </div>
                  <div style={s.chevron}>{isOpen ? "▾" : "▸"}</div>
                </button>

                {isOpen && (
                  <div style={s.cardBody}>
                    <div style={s.fieldLabel}>Log a result</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                      <div style={{ flex: 1 }}>
                        <MetricBoxes
                          tracked={[c.metric_key]}
                          values={entryValues[c.id] ?? {}}
                          onChange={(next) => setEntryValues((prev) => ({ ...prev, [c.id]: next }))}
                        />
                      </div>
                      <button
                        style={{ ...s.saveBtn, opacity: saving === c.id ? 0.6 : 1 }}
                        disabled={saving === c.id}
                        onClick={() => handleSubmit(c)}
                      >
                        {saving === c.id ? "Saving…" : "Save"}
                      </button>
                    </div>

                    <div style={{ ...s.fieldLabel, marginTop: 14 }}>Leaderboard</div>
                    <ChallengeLeaderboard metricKey={c.metric_key} direction={c.direction} results={challengeResults} groups={groups} />
                  </div>
                )}
              </div>
            );
          })
        )}
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
  pageTitle: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, color: "var(--text)", marginBottom: 4 },
  errorBox: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  flashBox: { background: "var(--good-dim)", color: "var(--good)", border: "1px solid var(--good)", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  loading: { fontSize: 14, color: "var(--mute)", padding: "20px 0" },
  emptyState: { textAlign: "center", padding: "32px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  emptySubtext: { fontSize: 13, color: "var(--mute)", maxWidth: 280 },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", padding: 0, width: "100%", cursor: "pointer", textAlign: "left" as const },
  cardLabel: { fontSize: 15, fontWeight: 700, color: "var(--text)", lineHeight: 1.3 },
  cardSub: { fontSize: 12, color: "var(--mute)", marginTop: 3 },
  chevron: { fontSize: 14, color: "var(--mute)", flexShrink: 0 },
  cardBody: { display: "flex", flexDirection: "column", gap: 4, borderTop: "1px solid var(--line)", paddingTop: 10 },
  fieldLabel: { fontSize: 11, color: "var(--mute)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 },
  saveBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 },
};
