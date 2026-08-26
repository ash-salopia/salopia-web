"use client";

import { useEffect, useState } from "react";
import {
  listChallenges, createChallenge, updateChallenge, deleteChallenge, listChallengeResults, logChallengeResultAsCoach,
  type Challenge,
} from "@/lib/data/challenges";
import { listGroups, listGroupMembers } from "@/lib/data/groups";
import type { ChallengeResultRow } from "@/lib/challenges";
import ChallengeForm from "@/components/ChallengeForm";
import ChallengeLeaderboard, { type ChallengeLeaderboardGroup } from "@/components/ChallengeLeaderboard";
import { EQUIPMENT_META, METRIC_META } from "@/lib/cardio-metrics";

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [groups, setGroups] = useState<ChallengeLeaderboardGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Challenge | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [results, setResults] = useState<ChallengeResultRow[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [logValues, setLogValues] = useState<Record<string, string>>({});
  const [logGroupId, setLogGroupId] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [challengeData, groupData] = await Promise.all([listChallenges(), listGroups()]);
      setChallenges(challengeData);
      const withMembers = await Promise.all(
        groupData.map(async (g): Promise<ChallengeLeaderboardGroup> => {
          const members = await listGroupMembers(g.id).catch(() => []);
          return {
            id: g.id,
            name: g.name,
            members: members.map((m) => ({ athleteId: m.athlete_id, athleteName: m.athlete?.name ?? "Athlete" })),
          };
        })
      );
      setGroups(withMembers);
      if (withMembers.length) setLogGroupId(withMembers[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load challenges");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selected) { setResults([]); return; }
    setResultsLoading(true);
    listChallengeResults(selected.id)
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setResultsLoading(false));
  }, [selected]);

  const handleDelete = async (challenge: Challenge) => {
    if (!confirm(`Delete "${challenge.name}"? This also removes every logged result for it.`)) return;
    try {
      await deleteChallenge(challenge.id);
      setChallenges((prev) => prev.filter((c) => c.id !== challenge.id));
      if (selected?.id === challenge.id) setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete challenge");
    }
  };

  const handleSave = async (values: Parameters<typeof createChallenge>[0]) => {
    try {
      if (selected) {
        await updateChallenge(selected.id, values);
        const updated = { ...selected, ...values };
        setChallenges((prev) => prev.map((c) => (c.id === selected.id ? updated : c)));
        setSelected(updated);
      } else {
        const created = await createChallenge(values);
        setChallenges((prev) => [created, ...prev]);
        setSelected(created);
      }
      setFormOpen(false);
      setFlash(`"${values.name}" saved`);
      setTimeout(() => setFlash(""), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save challenge");
    }
  };

  const handleLogResult = async (athleteId: string) => {
    if (!selected) return;
    const raw = logValues[athleteId];
    const value = parseFloat(raw);
    if (!raw || isNaN(value)) return;
    try {
      await logChallengeResultAsCoach(selected.id, athleteId, value);
      const fresh = await listChallengeResults(selected.id);
      setResults(fresh);
      setLogValues((prev) => ({ ...prev, [athleteId]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log result");
    }
  };

  const filtered = query.trim()
    ? challenges.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : challenges;
  const savedChallenges = filtered.filter((c) => c.is_saved);
  const oneOffChallenges = filtered.filter((c) => !c.is_saved);

  const logGroup = groups.find((g) => g.id === logGroupId) ?? groups[0] ?? null;

  return (
    <div style={styles.page}>
      <div style={styles.layout}>
        <div style={styles.listPane}>
          <div style={styles.headerRow}>
            <h1 style={styles.title}>Challenges</h1>
            <button
              style={styles.primaryBtn}
              onClick={() => {
                setSelected(null);
                setFormOpen(true);
              }}
            >
              + New
            </button>
          </div>

          {flash && <div style={styles.flashBox}>{flash}</div>}
          {error && <div style={styles.errorBox}>{error}</div>}

          {challenges.length > 0 && (
            <input
              placeholder="Search challenges…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ ...styles.input, marginBottom: 14 }}
            />
          )}

          {loading ? (
            <div style={styles.empty}>Loading…</div>
          ) : !challenges.length ? (
            <div style={styles.empty}>
              No challenges yet - save one (e.g. "SkiErg 30 Second Sprint") to reuse, or create a one-off
              from Live Group during a session.
            </div>
          ) : (
            <>
              {savedChallenges.length > 0 && (
                <div style={styles.list}>
                  {savedChallenges.map((c) => (
                    <ChallengeRow key={c.id} challenge={c} active={selected?.id === c.id} onSelect={() => { setSelected(c); setFormOpen(false); }} onDelete={() => handleDelete(c)} />
                  ))}
                </div>
              )}
              {oneOffChallenges.length > 0 && (
                <>
                  <div style={styles.sectionLabel}>One-off</div>
                  <div style={styles.list}>
                    {oneOffChallenges.map((c) => (
                      <ChallengeRow key={c.id} challenge={c} active={selected?.id === c.id} onSelect={() => { setSelected(c); setFormOpen(false); }} onDelete={() => handleDelete(c)} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {formOpen && (
          <ChallengeForm
            key={selected?.id ?? "new"}
            challenge={selected}
            onSave={handleSave}
            onClose={() => setFormOpen(false)}
          />
        )}

        {!formOpen && selected && (
          <div style={styles.detailPane}>
            <div style={styles.headerRow}>
              <div>
                <h2 style={styles.detailTitle}>{selected.name}</h2>
                <div style={styles.detailSub}>
                  {METRIC_META[selected.metric_key].label}
                  {selected.equipment ? ` · ${EQUIPMENT_META[selected.equipment].label}` : ""}
                  {selected.duration_cap_seconds ? ` · ${selected.duration_cap_seconds}s` : ""}
                  {" · "}{selected.direction === "lower" ? "lower is better" : "higher is better"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={styles.ghostBtn} onClick={() => setFormOpen(true)}>Edit</button>
                <button style={styles.closeBtn} onClick={() => setSelected(null)}>×</button>
              </div>
            </div>

            <div style={styles.detailSectionLabel}>Log a result</div>
            {groups.length > 1 && (
              <select value={logGroupId} onChange={(e) => setLogGroupId(e.target.value)} style={{ ...styles.input, marginBottom: 8 }}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
            {!logGroup || logGroup.members.length === 0 ? (
              <div style={styles.empty}>No athletes in this squad yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {logGroup.members.map((m) => (
                  <div key={m.athleteId} style={styles.logRow}>
                    <span style={styles.logName}>{m.athleteName}</span>
                    <input
                      value={logValues[m.athleteId] ?? ""}
                      onChange={(e) => setLogValues((prev) => ({ ...prev, [m.athleteId]: e.target.value.replace(/[^0-9.]/g, "") }))}
                      placeholder={METRIC_META[selected.metric_key].placeholder}
                      style={styles.logInput}
                      inputMode="decimal"
                    />
                    <button style={styles.logSaveBtn} onClick={() => handleLogResult(m.athleteId)}>Save</button>
                  </div>
                ))}
              </div>
            )}

            <div style={styles.detailSectionLabel}>Leaderboard</div>
            {resultsLoading ? (
              <div style={styles.empty}>Loading…</div>
            ) : (
              <ChallengeLeaderboard metricKey={selected.metric_key} direction={selected.direction} results={results} groups={groups} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChallengeRow({
  challenge, active, onSelect, onDelete,
}: {
  challenge: Challenge; active: boolean; onSelect: () => void; onDelete: () => void;
}) {
  return (
    <div style={{ ...styles.row, ...(active ? styles.rowActive : {}) }} onClick={onSelect}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.rowName}>{challenge.name}</div>
        <div style={styles.rowTypes}>
          {METRIC_META[challenge.metric_key].label}
          {challenge.equipment ? ` · ${EQUIPMENT_META[challenge.equipment].label}` : ""}
          {challenge.duration_cap_seconds ? ` · ${challenge.duration_cap_seconds}s` : ""}
        </div>
      </div>
      <button style={styles.deleteBtn} onClick={(e) => { e.stopPropagation(); onDelete(); }}>×</button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000 },
  layout: { display: "flex", gap: 20 },
  listPane: { flex: 1, minWidth: 0 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, margin: 0 },
  primaryBtn: {
    background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10,
    padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  ghostBtn: {
    background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 10,
    padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer" },
  flashBox: {
    background: "var(--good-dim)", border: "1px solid var(--good)", color: "var(--good)",
    borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16,
  },
  errorBox: {
    background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B",
    borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16,
  },
  empty: { color: "var(--mute)", fontSize: 14, padding: "24px 0", textAlign: "center" },
  input: {
    width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)",
    borderRadius: 8, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" as const,
  },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "16px 0 8px" },
  list: { display: "flex", flexDirection: "column", gap: 6 },
  row: {
    display: "flex", alignItems: "center", gap: 10, background: "var(--panel)", border: "1px solid var(--line)",
    borderRadius: 10, padding: 10, cursor: "pointer",
  },
  rowActive: { boxShadow: "inset 0 0 0 1px var(--accent)" },
  rowName: { fontWeight: 700, fontSize: 14, color: "var(--text)" },
  rowTypes: { fontSize: 11, color: "var(--mute)", marginTop: 2 },
  deleteBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 16, cursor: "pointer" },
  detailPane: {
    width: 380, flexShrink: 0, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12,
    padding: 16, height: "fit-content", maxHeight: "min(85vh, 780px)", overflowY: "auto" as const,
  },
  detailTitle: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, margin: 0 },
  detailSub: { fontSize: 12, color: "var(--mute)", marginTop: 4 },
  detailSectionLabel: { fontSize: 12, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "16px 0 8px" },
  logRow: { display: "flex", alignItems: "center", gap: 8 },
  logName: { flex: 1, fontSize: 13, color: "var(--text)" },
  logInput: {
    width: 80, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)",
    borderRadius: 8, padding: "6px 8px", fontSize: 13,
  },
  logSaveBtn: {
    background: "var(--accent-dim)", border: "1px solid var(--accent)", color: "var(--accent)",
    borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
};
