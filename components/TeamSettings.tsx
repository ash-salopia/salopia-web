"use client";

// ============================================================
// TeamSettings
// Embedded in the Settings page, org-level like BrandingSettings.
// Owners can invite/revoke coaches; non-owners see a read-only list.
// ============================================================

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import CollapsibleSection from "@/components/CollapsibleSection";
import CoachAthleteAssignModal from "@/components/CoachAthleteAssignModal";
import { setCoachAthleteAccess, listCoachAssignedAthleteIds } from "@/lib/data/coach-access";

interface Coach {
  id: string;
  name: string;
  email: string | null;
  role: "owner" | "coach";
  accepted_at: string | null;
  archived: boolean;
  athlete_access: "all" | "assigned";
}

interface Props {
  orgId: string;
  role: "owner" | "coach";
  coachSeatLimit: number | null;
}

export default function TeamSettings({ orgId, role, coachSeatLimit }: Props) {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [assignedCounts, setAssignedCounts] = useState<Record<string, number>>({});
  const [assignModalCoach, setAssignModalCoach] = useState<Coach | null>(null);

  const isOwner = role === "owner";

  async function loadCoaches() {
    const supabase = createClient();
    const { data } = await supabase
      .from("coaches")
      .select("id, name, email, role, accepted_at, archived, athlete_access")
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: true });
    setCoaches(data ?? []);
    setLoading(false);

    const restricted = (data ?? []).filter((c) => c.athlete_access === "assigned");
    const counts = await Promise.all(
      restricted.map(async (c) => [c.id, (await listCoachAssignedAthleteIds(c.id)).length] as const)
    );
    setAssignedCounts(Object.fromEntries(counts));
  }

  useEffect(() => {
    if (orgId) loadCoaches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function handleRevoke(coachId: string) {
    if (!confirm("Revoke this invite? The email can be re-invited afterwards.")) return;
    const res = await fetch("/api/coaches/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachId }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Could not revoke invite");
      return;
    }
    setCoaches((prev) => prev.filter((c) => c.id !== coachId));
  }

  async function handleArchiveToggle(coach: Coach) {
    if (!coach.archived) {
      const confirmed = confirm(
        `Archive ${coach.name || coach.email}? They'll lose access to your organisation immediately, but nothing is deleted - you can restore them any time.`
      );
      if (!confirmed) return;
    }
    const res = await fetch("/api/coaches/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachId: coach.id, archived: !coach.archived }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Could not update this coach");
      return;
    }
    setCoaches((prev) => prev.map((c) => (c.id === coach.id ? { ...c, archived: data.coach.archived } : c)));
  }

  async function handleAccessChange(coach: Coach, access: "all" | "assigned") {
    try {
      await setCoachAthleteAccess(coach.id, access);
      setCoaches((prev) => prev.map((c) => (c.id === coach.id ? { ...c, athlete_access: access } : c)));
      if (access === "assigned") setAssignModalCoach({ ...coach, athlete_access: access });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not update athlete access");
    }
  }

  if (loading) return null;

  const activeCount = coaches.filter((c) => !c.archived).length;

  return (
    <CollapsibleSection
      title="👥 Team"
      subtitle={
        coachSeatLimit != null
          ? `${activeCount} of ${coachSeatLimit} coach seats used`
          : "Coaches in your organisation"
      }
      headerRight={
        isOwner && (
          <button style={s.inviteBtn} onClick={() => setInviteOpen(true)}>
            + Invite coach
          </button>
        )
      }
    >
      <div style={s.list}>
        {coaches.map((c) => {
          const pending = !c.accepted_at;
          const status = pending ? "pending" : c.archived ? "archived" : "active";
          const statusLabel = { pending: "Pending", archived: "Archived", active: "Active" }[status];
          const statusStyle = { pending: s.badgePending, archived: s.badgeArchived, active: s.badgeActive }[status];
          return (
            <div key={c.id} style={s.rowWrap}>
              <div style={s.row}>
                <div style={s.rowMain}>
                  <div style={s.rowName}>{c.name || c.email || "-"}</div>
                  {c.email && <div style={s.rowEmail}>{c.email}</div>}
                </div>
                <div style={s.rowBadges}>
                  <span style={{ ...s.badge, ...(c.role === "owner" ? s.badgeOwner : s.badgeCoach) }}>
                    {c.role === "owner" ? "Owner" : "Coach"}
                  </span>
                  <span style={{ ...s.badge, ...statusStyle }}>{statusLabel}</span>
                  {isOwner && pending && (
                    <button style={s.revokeBtn} onClick={() => handleRevoke(c.id)}>
                      Revoke
                    </button>
                  )}
                  {isOwner && !pending && c.role !== "owner" && (
                    <button style={c.archived ? s.reactivateBtn : s.revokeBtn} onClick={() => handleArchiveToggle(c)}>
                      {c.archived ? "Reactivate" : "Archive"}
                    </button>
                  )}
                </div>
              </div>
              {isOwner && c.role !== "owner" && (
                <div style={s.accessRow}>
                  <select
                    value={c.athlete_access}
                    onChange={(e) => handleAccessChange(c, e.target.value as "all" | "assigned")}
                    style={s.accessSelect}
                  >
                    <option value="all">All athletes</option>
                    <option value="assigned">Assigned only</option>
                  </select>
                  {c.athlete_access === "assigned" && (
                    <button style={s.manageBtn} onClick={() => setAssignModalCoach(c)}>
                      Manage athletes ({assignedCounts[c.id] ?? 0})
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {assignModalCoach && (
        <CoachAthleteAssignModal
          coachId={assignModalCoach.id}
          coachName={assignModalCoach.name}
          onClose={() => setAssignModalCoach(null)}
          onSaved={(count) => {
            setAssignedCounts((prev) => ({ ...prev, [assignModalCoach.id]: count }));
            setAssignModalCoach(null);
          }}
        />
      )}

      {inviteOpen && (
        <InviteCoachModal
          onClose={() => setInviteOpen(false)}
          onInvited={(coach) => {
            setCoaches((prev) => [...prev, coach]);
            setInviteOpen(false);
          }}
        />
      )}
    </CollapsibleSection>
  );
}

function InviteCoachModal({ onClose, onInvited }: { onClose: () => void; onInvited: (coach: Coach) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/coaches/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send invite");
      onInvited(data.coach);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send invite");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.modalTitle}>Invite a coach</div>
        <div style={s.modalDesc}>They'll get an email with a link to join your organisation.</div>

        {error && <div style={s.error}>{error}</div>}

        <div style={s.field}>
          <div style={s.fieldLabel}>Email</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@example.com"
            style={s.input}
            autoFocus
          />
        </div>
        <div style={s.field}>
          <div style={s.fieldLabel}>Name (optional)</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Their name"
            style={s.input}
          />
        </div>

        <div style={s.modalActions}>
          <button style={s.ghostBtn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...s.saveBtn, opacity: saving || !email ? 0.6 : 1 }}
            disabled={saving || !email}
            onClick={handleSubmit}
          >
            {saving ? "Sending…" : "Send invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  inviteBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  list: { display: "flex", flexDirection: "column" as const, gap: 8 },
  rowWrap: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  accessRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" },
  accessSelect: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "5px 8px", fontSize: 12, fontWeight: 600 },
  manageBtn: { background: "transparent", border: "1px solid var(--accent)", color: "var(--accent)", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  rowMain: { minWidth: 0 },
  rowName: { fontSize: 14, fontWeight: 600, color: "var(--text)" },
  rowEmail: { fontSize: 12, color: "var(--mute)", marginTop: 1 },
  rowBadges: { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 },
  badge: { borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700 },
  badgeOwner: { background: "var(--accent-dim)", color: "var(--accent)" },
  badgeCoach: { background: "var(--ink)", color: "var(--mute)", border: "1px solid var(--line)" },
  badgePending: { background: "#2a1e00", color: "#F59E0B" },
  badgeActive: { background: "#0a2218", color: "#10B981" },
  badgeArchived: { background: "var(--ink)", color: "var(--mute)", border: "1px solid var(--line)" },
  revokeBtn: { background: "transparent", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" },
  reactivateBtn: { background: "transparent", border: "1px solid var(--accent)", color: "var(--accent)", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" },
  // Modal
  modalOverlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modal: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: 24, width: 380, maxWidth: "90vw", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" },
  modalTitle: { fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 4 },
  modalDesc: { fontSize: 12, color: "var(--mute)", marginBottom: 16 },
  error: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: 600, color: "var(--mute)", marginBottom: 4 },
  input: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14 },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  saveBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
};
