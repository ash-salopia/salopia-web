"use client";

// Bulk athlete-target picker for the Reporting tab - modeled on
// components/recovery/RecoveryTargetPicker.tsx (single/multiple/group
// tabs), with a name-search filter added to the "multiple" tab so a coach
// can find athletes in a long roster instead of scrolling a flat list.

import { useEffect, useState } from "react";
import { listAthletes } from "@/lib/data/athletes";
import { listGroups, listGroupMembers, type Group } from "@/lib/data/groups";
import type { Athlete } from "@/types";

type Mode = "single" | "multiple" | "group";

export default function ReportTargetPicker({
  selectedIds,
  onChange,
  groupOnly = false,
}: {
  selectedIds: string[];
  onChange: (ids: string[], groupId: string | null, groupName: string | null) => void;
  // Squad Report only makes sense for a group (leaderboards need a squad to
  // rank within) - hides the single/multiple tabs when true.
  groupOnly?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(groupOnly ? "group" : "single");
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([listAthletes(), listGroups()])
      .then(([a, g]) => { setAthletes(a); setGroups(g); })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load athletes"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (mode !== "group" || !selectedGroupId) return;
    const group = groups.find((g) => g.id === selectedGroupId);
    listGroupMembers(selectedGroupId)
      .then((members) => onChange(members.map((m) => m.athlete_id), selectedGroupId, group?.name ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load group members"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedGroupId, groups]);

  const changeMode = (m: Mode) => {
    setMode(m);
    setSelectedGroupId("");
    setSearch("");
    onChange([], null, null);
  };

  const toggleAthlete = (id: string) => {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    onChange(next, null, null);
  };

  if (loading) return <div style={s.empty}>Loading athletes…</div>;

  const filteredAthletes = search.trim()
    ? athletes.filter((a) => a.name.toLowerCase().includes(search.trim().toLowerCase()))
    : athletes;

  return (
    <div style={s.wrap}>
      {!groupOnly && (
        <div style={s.tabRow}>
          {(["single", "multiple", "group"] as Mode[]).map((m) => (
            <button
              key={m}
              style={{ ...s.tabBtn, ...(mode === m ? s.tabBtnActive : {}) }}
              onClick={() => changeMode(m)}
            >
              {m === "single" ? "Single athlete" : m === "multiple" ? "Multiple athletes" : "Group"}
            </button>
          ))}
        </div>
      )}

      {error && <div style={s.error}>{error}</div>}

      {mode === "single" && (
        <select
          value={selectedIds[0] ?? ""}
          onChange={(e) => onChange(e.target.value ? [e.target.value] : [], null, null)}
          style={s.input}
        >
          <option value=""> - Select athlete - </option>
          {athletes.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      )}

      {mode === "multiple" && (
        <>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search athletes…"
            style={{ ...s.input, marginBottom: 8 }}
          />
          <div style={s.checkList}>
            {filteredAthletes.length === 0 ? (
              <div style={s.emptySmall}>No athletes match &quot;{search}&quot;.</div>
            ) : (
              filteredAthletes.map((a) => (
                <label key={a.id} style={s.checkRow}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(a.id)}
                    onChange={() => toggleAthlete(a.id)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  {a.name}
                </label>
              ))
            )}
          </div>
        </>
      )}

      {mode === "group" && (
        <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)} style={s.input}>
          <option value=""> - Select group - </option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}{g.member_count != null ? ` (${g.member_count})` : ""}</option>
          ))}
        </select>
      )}

      <div style={s.summary}>
        {selectedIds.length} athlete{selectedIds.length !== 1 ? "s" : ""} selected
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 },
  empty: { fontSize: 13, color: "var(--mute)", fontStyle: "italic" },
  emptySmall: { fontSize: 12, color: "var(--mute)", padding: "8px 4px" },
  error: { fontSize: 13, color: "#FF6B6B" },
  tabRow: { display: "flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" },
  tabBtn: { flex: 1, background: "transparent", border: "none", color: "var(--mute)", padding: "8px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  tabBtnActive: { background: "var(--accent-dim)", color: "var(--accent)" },
  input: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" as const },
  checkList: { display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" as const, border: "1px solid var(--line)", borderRadius: 8, padding: 8 },
  checkRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)", cursor: "pointer", padding: "4px 4px" },
  summary: { fontSize: 12, color: "var(--mute)" },
};
