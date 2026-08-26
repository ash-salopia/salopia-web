"use client";

// "Launch Challenge" panel for Live Group - lets a coach pick (or quick-
// create) a challenge and log results for a real squad's members
// directly, in the room, the same way sets are already logged in Live
// Group today. Deliberately sourced from the structured groups/
// group_members tables (lib/data/groups.ts), not Live Group's own
// free-text athletes.group filter - the two are separate, unrelated
// grouping models in this app, and Challenges' squad-scoped leaderboards
// only work through the structured one. `matchGroupName` is a
// best-effort convenience to pre-select the group whose name matches
// whichever free-text group is currently active in Live Group, not a
// hard link between the two systems.

import { useEffect, useState } from "react";
import {
  listChallenges, createChallenge, listChallengeResults, logChallengeResultAsCoach, type Challenge,
} from "@/lib/data/challenges";
import { listGroups, listGroupMembers } from "@/lib/data/groups";
import ChallengeForm from "@/components/ChallengeForm";
import ChallengeLeaderboard, { type ChallengeLeaderboardGroup } from "@/components/ChallengeLeaderboard";
import { METRIC_META } from "@/lib/cardio-metrics";
import type { ChallengeResultRow } from "@/lib/challenges";

export default function LiveChallengePanel({
  matchGroupName,
  onClose,
}: {
  matchGroupName?: string;
  onClose: () => void;
}) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [groups, setGroups] = useState<ChallengeLeaderboardGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Challenge | null>(null);
  const [creating, setCreating] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [results, setResults] = useState<ChallengeResultRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listChallenges(), listGroups()])
      .then(async ([challengeData, groupData]) => {
        setChallenges(challengeData.filter((c) => c.is_saved));
        const withMembers = await Promise.all(
          groupData.map(async (g): Promise<ChallengeLeaderboardGroup> => {
            const members = await listGroupMembers(g.id).catch(() => []);
            return { id: g.id, name: g.name, members: members.map((m) => ({ athleteId: m.athlete_id, athleteName: m.athlete?.name ?? "Athlete" })) };
          })
        );
        setGroups(withMembers);
        const matched = matchGroupName ? withMembers.find((g) => g.name.toLowerCase() === matchGroupName.toLowerCase()) : null;
        setGroupId((matched ?? withMembers[0])?.id ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load"))
      .finally(() => setLoading(false));
  }, [matchGroupName]);

  useEffect(() => {
    if (!selected) { setResults([]); return; }
    listChallengeResults(selected.id).then(setResults).catch(() => setResults([]));
  }, [selected]);

  const handleCreate = async (formValues: Parameters<typeof createChallenge>[0]) => {
    try {
      const created = await createChallenge(formValues);
      setChallenges((prev) => (created.is_saved ? [created, ...prev] : prev));
      setSelected(created);
      setCreating(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create challenge");
    }
  };

  const handleLog = async (athleteId: string) => {
    if (!selected) return;
    const raw = values[athleteId];
    const value = parseFloat(raw);
    if (!raw || isNaN(value)) return;
    setSaving(athleteId);
    try {
      await logChallengeResultAsCoach(selected.id, athleteId, value);
      const fresh = await listChallengeResults(selected.id);
      setResults(fresh);
      setValues((prev) => ({ ...prev, [athleteId]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log result");
    } finally {
      setSaving(null);
    }
  };

  const group = groups.find((g) => g.id === groupId) ?? groups[0] ?? null;

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.panel} onClick={(e) => e.stopPropagation()}>
        {creating || (!selected && !challenges.length) ? (
          <ChallengeForm challenge={null} onSave={handleCreate} onClose={() => (challenges.length ? setCreating(false) : onClose())} />
        ) : !selected ? (
          <>
            <div style={s.title}>Launch a challenge</div>
            {error && <div style={s.errorBox}>{error}</div>}
            {loading ? (
              <div style={s.empty}>Loading…</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {challenges.map((c) => (
                  <button key={c.id} style={s.pickRow} onClick={() => setSelected(c)}>
                    <span style={s.pickName}>{c.name}</span>
                    <span style={s.pickSub}>{METRIC_META[c.metric_key].label}{c.duration_cap_seconds ? ` · ${c.duration_cap_seconds}s` : ""}</span>
                  </button>
                ))}
              </div>
            )}
            <button style={s.newBtn} onClick={() => setCreating(true)}>+ New challenge</button>
            <button style={s.cancelBtn} onClick={onClose}>Close</button>
          </>
        ) : (
          <>
            <div style={s.headerRow}>
              <div style={s.title}>{selected.name}</div>
              <button style={s.closeX} onClick={onClose}>×</button>
            </div>
            {error && <div style={s.errorBox}>{error}</div>}

            {groups.length > 1 && (
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={s.select}>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}

            {!group || group.members.length === 0 ? (
              <div style={s.empty}>No athletes in this squad yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {group.members.map((m) => (
                  <div key={m.athleteId} style={s.logRow}>
                    <span style={s.logName}>{m.athleteName}</span>
                    <input
                      value={values[m.athleteId] ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [m.athleteId]: e.target.value.replace(/[^0-9.]/g, "") }))}
                      placeholder={METRIC_META[selected.metric_key].placeholder}
                      style={s.logInput}
                      inputMode="decimal"
                    />
                    <button style={{ ...s.logSaveBtn, opacity: saving === m.athleteId ? 0.6 : 1 }} disabled={saving === m.athleteId} onClick={() => handleLog(m.athleteId)}>
                      Save
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ ...s.title, fontSize: 13, marginTop: 16 }}>Leaderboard</div>
            <ChallengeLeaderboard metricKey={selected.metric_key} direction={selected.direction} results={results} groups={groups} />

            <button style={s.cancelBtn} onClick={() => setSelected(null)}>← Pick a different challenge</button>
          </>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 },
  panel: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: 18, width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto" as const, display: "flex", flexDirection: "column" as const, gap: 10 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  closeX: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 18, cursor: "pointer" },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "8px 10px", fontSize: 12 },
  empty: { fontSize: 13, color: "var(--mute)", padding: "8px 0" },
  pickRow: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", cursor: "pointer", textAlign: "left" as const },
  pickName: { fontSize: 13, fontWeight: 700, color: "var(--text)" },
  pickSub: { fontSize: 11, color: "var(--mute)" },
  newBtn: { background: "transparent", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 8, padding: "9px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  cancelBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "9px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  select: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 13 },
  logRow: { display: "flex", alignItems: "center", gap: 8 },
  logName: { flex: 1, fontSize: 13, color: "var(--text)" },
  logInput: { width: 80, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "6px 8px", fontSize: 13 },
  logSaveBtn: { background: "var(--accent-dim)", border: "1px solid var(--accent)", color: "var(--accent)", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
};
