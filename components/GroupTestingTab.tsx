"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listGroupTestSessions, createGroupTestSession, deleteGroupTestSession, getGroupTestSession,
  type GroupTestSessionSummary,
} from "@/lib/data/testing";
import { listAthletes } from "@/lib/data/athletes";
import { getOrganisationBilling } from "@/lib/data/billing";
import { getMyBranding } from "@/lib/data/branding";
import { planReportCapabilities, type ReportCapability } from "@/lib/billing/entitlements";
import GroupTestReports from "@/components/GroupTestReports";
import { todayISO } from "@/lib/date-utils";
import { DEFAULT_BRANDING, type ResolvedBranding } from "@/types/branding";
import type { Athlete, TestBattery } from "@/types";

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function GroupTestingTab({ batteries }: { batteries: TestBattery[] }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<GroupTestSessionSummary[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [branding, setBranding] = useState<ResolvedBranding>(DEFAULT_BRANDING);
  const [capabilities, setCapabilities] = useState<Set<ReportCapability>>(() => planReportCapabilities("trial"));

  // New-session form
  const [name, setName] = useState("");
  const [batteryId, setBatteryId] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [gs, a] = await Promise.all([listGroupTestSessions(), listAthletes()]);
      setSessions(gs);
      setAthletes(a);
      getMyBranding().then(setBranding).catch(() => {});
      getOrganisationBilling().then((b) => setCapabilities(planReportCapabilities(b.plan))).catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load group testing";
      if (/group_test_sessions/.test(msg) && /(does not exist|schema cache|find the table)/i.test(msg)) {
        setMigrationMissing(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (batteries.length && !batteryId) setBatteryId(batteries[0].id); }, [batteries, batteryId]);

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const a of athletes) if (a.group?.trim()) set.add(a.group.trim());
    return [...set].sort();
  }, [athletes]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectGroup = (g: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const ids = athletes.filter((a) => a.group?.trim() === g).map((a) => a.id);
      const allIn = ids.every((id) => next.has(id));
      for (const id of ids) allIn ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const resetForm = () => {
    setName(""); setDate(todayISO()); setSelectedIds(new Set());
    setBatteryId(batteries[0]?.id ?? null);
  };

  const handleCreate = async () => {
    if (!batteryId || selectedIds.size === 0) return;
    setSaving(true);
    setError("");
    try {
      const chosen = athletes.filter((a) => selectedIds.has(a.id));
      const fallbackName = `Testing — ${fmtDate(date)}`;
      const id = await createGroupTestSession({
        name: name.trim() || fallbackName,
        testBatteryId: batteryId,
        date,
        athletes: chosen.map((a) => ({ id: a.id, bodyweightKg: a.bodyweight_kg })),
      });
      router.push(`/testing/group/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create group session");
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteGroupTestSession(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  };

  if (loading) return <div style={st.empty}>Loading…</div>;

  if (migrationMissing) {
    return (
      <div style={st.wrap}>
        <div style={st.hint}>
          Group Testing needs migration <code>0080_group_test_sessions.sql</code> applied to the database.
          Run it in the Supabase SQL editor, then reload this page.
        </div>
      </div>
    );
  }

  return (
    <div style={st.wrap}>
      {error && <div style={st.errorBox}>{error}</div>}

      {!creating ? (
        <>
          <div style={st.introRow}>
            <p style={st.intro}>
              Run a whole squad through one battery in a single scrollable grid — athletes down the side,
              tests across the top. Every value saves automatically as you type, even if the connection drops.
            </p>
            <button style={st.primaryBtn} disabled={batteries.length === 0} onClick={() => { resetForm(); setCreating(true); }}>
              + New group session
            </button>
          </div>
          {batteries.length === 0 && (
            <div style={st.hint}>Create a test battery first (Batteries tab) — a group session needs one.</div>
          )}

          {sessions.length === 0 ? (
            <div style={st.emptyState}>
              <div style={{ fontSize: 34, marginBottom: 10 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>No group sessions yet</div>
              <div style={{ fontSize: 13, color: "var(--mute)", marginTop: 4 }}>Start one to test a squad together.</div>
            </div>
          ) : (
            <div style={st.list}>
              {sessions.map((g) => (
                <div key={g.id} style={st.card}>
                  <button style={st.cardMain} onClick={() => router.push(`/testing/group/${g.id}`)}>
                    <div style={st.cardName}>{g.name || `Testing — ${fmtDate(g.date)}`}</div>
                    <div style={st.cardMeta}>
                      {fmtDate(g.date)}
                      {g.battery_name ? ` · ${g.battery_name}` : ""}
                      {` · ${g.athlete_count} athlete${g.athlete_count === 1 ? "" : "s"}`}
                      {g.filled_count > 0 ? ` · ${g.filled_count} values logged` : " · not started"}
                    </div>
                  </button>
                  {g.filled_count > 0 && (
                    <GroupTestReports
                      compact
                      groupSession={{ id: g.id, organisation_id: g.organisation_id, name: g.name, test_battery_id: g.test_battery_id, date: g.date, created_at: g.created_at }}
                      branding={branding}
                      capabilities={capabilities}
                      detailLoader={async () => {
                        const d = await getGroupTestSession(g.id);
                        return { sessions: d.sessions, athletes: d.athletes };
                      }}
                    />
                  )}
                  <button
                    style={st.dangerBtn}
                    title="Delete group session (athletes' individual sessions are kept)"
                    onClick={() => {
                      if (!confirm(`Delete "${g.name || fmtDate(g.date)}"? Each athlete's individual test session is kept, just un-grouped.`)) return;
                      handleDelete(g.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={st.form}>
          <div style={st.formHead}>
            <div style={st.formTitle}>New group session</div>
            <button style={st.smallGhost} onClick={() => setCreating(false)}>Cancel</button>
          </div>

          <label style={st.label}>Name</label>
          <input style={st.input} value={name} placeholder={`Testing — ${fmtDate(date)}`} onChange={(e) => setName(e.target.value)} />

          <div style={st.row2}>
            <div style={{ flex: 1 }}>
              <label style={st.label}>Battery</label>
              <select style={st.input} value={batteryId ?? ""} onChange={(e) => setBatteryId(e.target.value || null)}>
                {batteries.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={st.label}>Date</label>
              <input type="date" style={st.input} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div style={st.athleteHead}>
            <label style={st.label}>Athletes ({selectedIds.size} selected)</label>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={st.chip} onClick={() => setSelectedIds(new Set(athletes.map((a) => a.id)))}>Select all</button>
              <button style={st.chip} onClick={() => setSelectedIds(new Set())}>Clear</button>
            </div>
          </div>
          {groups.length > 0 && (
            <div style={st.chipRow}>
              {groups.map((g) => (
                <button key={g} style={st.chip} onClick={() => selectGroup(g)}>{g}</button>
              ))}
            </div>
          )}
          <div style={st.athleteList}>
            {athletes.map((a) => (
              <label key={a.id} style={st.athleteRow}>
                <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggle(a.id)} />
                <span>{a.name}</span>
                {a.group && <span style={st.groupTag}>{a.group}</span>}
              </label>
            ))}
          </div>

          <button
            style={{ ...st.primaryBtn, alignSelf: "flex-start", opacity: (!batteryId || selectedIds.size === 0 || saving) ? 0.5 : 1 }}
            disabled={!batteryId || selectedIds.size === 0 || saving}
            onClick={handleCreate}
          >
            {saving ? "Creating…" : `Start grid (${selectedIds.size})`}
          </button>
        </div>
      )}
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 },
  empty: { color: "var(--mute)", fontSize: 13, padding: "24px 0" },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 14px", fontSize: 13 },
  introRow: { display: "flex", gap: 16, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" },
  intro: { fontSize: 13, color: "var(--mute)", maxWidth: 560, margin: 0, lineHeight: 1.5 },
  hint: { fontSize: 12, color: "var(--mute)", fontStyle: "italic" },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  emptyState: { textAlign: "center", padding: "40px 20px" },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: { display: "flex", alignItems: "center", gap: 10, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" },
  cardMain: { flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: 0 },
  cardName: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  cardMeta: { fontSize: 12, color: "var(--mute)", marginTop: 3 },
  dangerBtn: { background: "transparent", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer" },
  smallGhost: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer" },
  form: { display: "flex", flexDirection: "column", gap: 8, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, maxWidth: 560 },
  formHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  formTitle: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  label: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em" },
  input: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14, width: "100%", boxSizing: "border-box" },
  row2: { display: "flex", gap: 10 },
  athleteHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  chip: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" },
  athleteList: { display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 8 },
  athleteRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)" },
  groupTag: { fontSize: 10, color: "var(--mute)", marginLeft: "auto" },
};
