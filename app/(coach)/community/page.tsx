"use client";

import { useState, useEffect } from "react";
import {
  listGroups, createGroup, deleteGroup, listGroupMembers,
  addGroupMember, removeGroupMember, type Group, type GroupMember,
} from "@/lib/data/groups";
import {
  listAnnouncements, createAnnouncement, deleteAnnouncement, type Announcement,
} from "@/lib/data/announcements";
import {
  listRecentOrgPBs, addCoachReaction, removeCoachReaction, deletePB, formatPBValue, type PersonalBest,
} from "@/lib/data/personal-bests";
import { createClient } from "@/lib/supabase-browser";
import GroupChat from "@/components/GroupChat";

type Tab = "groups" | "announcements" | "feed" | "chat" | "comps";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const GROUP_COLOURS = [
  "#4a9eff", "#7c5ce8", "#00b894", "#fd7a2a",
  "#e84393", "#00cec9", "#fdcb6e", "#a29bfe",
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CommunityPage() {
  const [tab, setTab] = useState<Tab>("groups");
  const [groups, setGroups] = useState<Group[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [pbs, setPbs] = useState<PersonalBest[]>([]);
  const [competitions, setCompetitions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [coachId, setCoachId] = useState("");
  const [coachName, setCoachName] = useState("");
  const [orgAthletes, setOrgAthletes] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("coaches").select("id, name").single().then(({ data }) => {
      if (data) { setCoachId(data.id); setCoachName(data.name); }
    });
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const [g, a, p, compsRes, athletesRes] = await Promise.all([
        listGroups(),
        listAnnouncements(),
        listRecentOrgPBs(),
        fetch("/api/competitions").then((r) => r.json()),
        supabase.from("athletes").select("id, name").eq("archived", false).order("name"),
      ]);
      setGroups(g);
      setAnnouncements(a);
      setPbs(p);
      setCompetitions(compsRes.competitions ?? []);
      setOrgAthletes(athletesRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load community data");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.headRow}>
        <h1 style={s.heading}>Community</h1>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {/* Tabs */}
      <div style={s.tabs}>
        {(["groups", "announcements", "feed", "chat", "comps"] as Tab[]).map((t) => (
          <button
            key={t}
            style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}
            onClick={() => setTab(t)}
          >
            {t === "groups" ? `👥 Groups (${groups.length})` :
             t === "announcements" ? `📢 Announcements` :
             t === "feed" ? `🏆 PB Feed` :
             t === "comps" ? `🏁 Competitions` :
             `💬 Chat`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={s.loadingMsg}>Loading…</div>
      ) : (
        <>
          {tab === "groups" && (
            <GroupsTab
              groups={groups}
              onGroupsChange={setGroups}
            />
          )}
          {tab === "announcements" && (
            <AnnouncementsTab
              announcements={announcements}
              groups={groups}
              onAnnouncementsChange={setAnnouncements}
            />
          )}
          {tab === "feed" && (
            <FeedTab
              pbs={pbs}
              coachId={coachId}
              coachName={coachName}
              onPbsChange={setPbs}
            />
          )}
          {tab === "chat" && (
            <ChatTab groups={groups} coachId={coachId} coachName={coachName} />
          )}
          {tab === "comps" && (
            <CoachCompsTab
              competitions={competitions}
              onCompetitionsChange={setCompetitions}
              coachId={coachId}
              coachName={coachName}
              athletes={orgAthletes}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Groups tab ────────────────────────────────────────────────────────────────

function GroupsTab({ groups, onGroupsChange }: {
  groups: Group[];
  onGroupsChange: (g: Group[]) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColour, setNewColour] = useState(GROUP_COLOURS[0]);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [allAthletes, setAllAthletes] = useState<{ id: string; name: string }[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const group = await createGroup(newName, newDesc, newColour);
      onGroupsChange([...groups, { ...group, member_count: 0 }]);
      setCreating(false);
      setNewName(""); setNewDesc("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create group");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this group? Athletes won't be deleted.")) return;
    try {
      await deleteGroup(id);
      onGroupsChange(groups.filter((g) => g.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete group");
    }
  };

  const handleExpand = async (groupId: string) => {
    if (expandedId === groupId) { setExpandedId(null); return; }
    setExpandedId(groupId);
    setMembersLoading(true);
    try {
      const [m, { data: athletes }] = await Promise.all([
        listGroupMembers(groupId),
        createClient().from("athletes").select("id, name").eq("archived", false).order("name"),
      ]);
      setMembers(m);
      setAllAthletes(athletes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load members");
    } finally { setMembersLoading(false); }
  };

  const handleAddMember = async (groupId: string, athleteId: string) => {
    try {
      await addGroupMember(groupId, athleteId);
      const athlete = allAthletes.find((a) => a.id === athleteId);
      setMembers((prev) => [...prev, {
        id: crypto.randomUUID(),
        group_id: groupId,
        athlete_id: athleteId,
        joined_at: new Date().toISOString(),
        athlete,
      }]);
      onGroupsChange(groups.map((g) =>
        g.id === groupId ? { ...g, member_count: (g.member_count ?? 0) + 1 } : g
      ));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add member");
    }
  };

  const handleRemoveMember = async (groupId: string, athleteId: string) => {
    try {
      await removeGroupMember(groupId, athleteId);
      setMembers((prev) => prev.filter((m) => m.athlete_id !== athleteId));
      onGroupsChange(groups.map((g) =>
        g.id === groupId ? { ...g, member_count: Math.max(0, (g.member_count ?? 1) - 1) } : g
      ));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove member");
    }
  };

  const memberIds = new Set(members.map((m) => m.athlete_id));
  const nonMembers = allAthletes.filter((a) => !memberIds.has(a.id));

  return (
    <div style={s.tabContent}>
      {error && <div style={s.errorBox}>{error}</div>}

      <div style={s.sectionHead}>
        <span style={s.sectionTitle}>Your groups</span>
        <button style={s.primaryBtn} onClick={() => setCreating(true)}>+ New group</button>
      </div>

      {/* Create group form */}
      {creating && (
        <div style={s.createCard}>
          <div style={s.fieldLabel}>Group name</div>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Rugby Squad, Online Clients"
            style={s.input}
          />
          <div style={s.fieldLabel}>Description (optional)</div>
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="What's this group for?"
            style={s.input}
          />
          <div style={s.fieldLabel}>Colour</div>
          <div style={s.colourRow}>
            {GROUP_COLOURS.map((c) => (
              <button
                key={c}
                style={{
                  ...s.colourDot,
                  background: c,
                  boxShadow: newColour === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : "none",
                }}
                onClick={() => setNewColour(c)}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button style={s.ghostBtn} onClick={() => setCreating(false)}>Cancel</button>
            <button style={{ ...s.primaryBtn, opacity: !newName.trim() || saving ? 0.5 : 1 }}
              disabled={!newName.trim() || saving} onClick={handleCreate}>
              {saving ? "Creating…" : "Create group"}
            </button>
          </div>
        </div>
      )}

      {/* Group list */}
      {groups.length === 0 && !creating && (
        <div style={s.empty}>No groups yet — create one to get started.</div>
      )}

      {groups.map((group) => (
        <div key={group.id} style={s.groupCard}>
          <div style={s.groupCardHead}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ ...s.groupDot, background: group.colour }} />
              <div>
                <div style={s.groupName}>{group.name}</div>
                {group.description && (
                  <div style={s.groupDesc}>{group.description}</div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={s.memberCount}>{group.member_count ?? 0} members</span>
              <button style={s.ghostBtn} onClick={() => handleExpand(group.id)}>
                {expandedId === group.id ? "Close ▲" : "Manage ▼"}
              </button>
              <button style={s.deleteBtn} onClick={() => handleDelete(group.id)}>Delete</button>
            </div>
          </div>

          {expandedId === group.id && (
            <div style={s.groupExpand}>
              {membersLoading ? (
                <div style={s.loadingMsg}>Loading members…</div>
              ) : (
                <>
                  <div style={s.memberSection}>
                    <div style={s.fieldLabel}>Current members</div>
                    {members.length === 0 && (
                      <div style={s.empty}>No members yet — add athletes below.</div>
                    )}
                    {members.map((m) => (
                      <div key={m.id} style={s.memberRow}>
                        <span style={s.memberName}>{m.athlete?.name ?? "Unknown"}</span>
                        <button style={s.removeBtn}
                          onClick={() => handleRemoveMember(group.id, m.athlete_id)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  {nonMembers.length > 0 && (
                    <div style={s.memberSection}>
                      <div style={s.fieldLabel}>Add athlete</div>
                      <div style={s.addAthleteList}>
                        {nonMembers.map((a) => (
                          <button key={a.id} style={s.addAthleteBtn}
                            onClick={() => handleAddMember(group.id, a.id)}>
                            + {a.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Announcements tab ─────────────────────────────────────────────────────────

function AnnouncementsTab({ announcements, groups, onAnnouncementsChange }: {
  announcements: Announcement[];
  groups: Group[];
  onAnnouncementsChange: (a: Announcement[]) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const ann = await createAnnouncement({ title, body, groupId, pinned });
      onAnnouncementsChange([ann, ...announcements]);
      setTitle(""); setBody(""); setGroupId(null); setPinned(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post announcement");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAnnouncement(id);
      onAnnouncementsChange(announcements.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete announcement");
    }
  };

  return (
    <div style={s.tabContent}>
      {error && <div style={s.errorBox}>{error}</div>}

      {/* Compose */}
      <div style={s.createCard}>
        <div style={s.sectionTitle}>New announcement</div>
        <div style={s.fieldLabel}>Title</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Gym closed Monday, New programme dropping" style={s.input} />
        <div style={s.fieldLabel}>Message (optional)</div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Add more detail here…" style={s.textarea} />
        <div style={s.composeFooter}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as const }}>
            <select value={groupId ?? ""} onChange={(e) => setGroupId(e.target.value || null)} style={s.select}>
              <option value="">📢 All athletes</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <label style={s.checkLabel}>
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              <span style={{ marginLeft: 6 }}>📌 Pin</span>
            </label>
          </div>
          <button style={{ ...s.primaryBtn, opacity: !title.trim() || saving ? 0.5 : 1 }}
            disabled={!title.trim() || saving} onClick={handleCreate}>
            {saving ? "Posting…" : "Post"}
          </button>
        </div>
      </div>

      {/* Announcement list */}
      <div style={s.sectionTitle}>Recent announcements</div>
      {announcements.length === 0 && (
        <div style={s.empty}>No announcements yet.</div>
      )}
      {announcements.map((ann) => (
        <div key={ann.id} style={{ ...s.annCard, ...(ann.pinned ? s.annPinned : {}) }}>
          <div style={s.annHead}>
            <div>
              {ann.pinned && <span style={s.pinnedTag}>📌 Pinned</span>}
              <div style={s.annTitle}>{ann.title}</div>
              <div style={s.annMeta}>
                {ann.group ? `👥 ${ann.group.name}` : "📢 All athletes"} · {timeAgo(ann.created_at)}
              </div>
            </div>
            <button style={s.deleteBtn} onClick={() => handleDelete(ann.id)}>Delete</button>
          </div>
          {ann.body && <div style={s.annBody}>{ann.body}</div>}
        </div>
      ))}
    </div>
  );
}

// ── PB Feed tab ───────────────────────────────────────────────────────────────

function FeedTab({ pbs, coachId, coachName, onPbsChange }: {
  pbs: PersonalBest[];
  coachId: string;
  coachName: string;
  onPbsChange: (p: PersonalBest[]) => void;
}) {
  const [error, setError] = useState("");

  const handleDelete = async (pbId: string) => {
    if (!confirm("Delete this PB record? This cannot be undone.")) return;
    try {
      await deletePB(pbId);
      onPbsChange(pbs.filter((p) => p.id !== pbId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete PB");
    }
  };

  const handleReaction = async (pb: PersonalBest, emoji: string) => {
    const myReaction = pb.reactions?.find(
      (r) => r.reactor_type === "coach" && r.reactor_id === coachId
    );
    try {
      if (myReaction) {
        await removeCoachReaction(pb.id, coachId);
        onPbsChange(pbs.map((p) =>
          p.id === pb.id
            ? { ...p, reactions: (p.reactions ?? []).filter((r) => !(r.reactor_type === "coach" && r.reactor_id === coachId)) }
            : p
        ));
      } else {
        await addCoachReaction(pb.id, coachId, coachName, emoji);
        const newReaction = {
          id: crypto.randomUUID(),
          pb_id: pb.id,
          reactor_type: "coach" as const,
          reactor_id: coachId,
          reactor_name: coachName,
          emoji,
          created_at: new Date().toISOString(),
        };
        onPbsChange(pbs.map((p) =>
          p.id === pb.id
            ? { ...p, reactions: [...(p.reactions ?? []), newReaction] }
            : p
        ));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not react");
    }
  };

  return (
    <div style={s.tabContent}>
      {error && <div style={s.errorBox}>{error}</div>}
      <div style={s.sectionTitle}>Recent personal bests</div>
      {pbs.length === 0 && (
        <div style={s.empty}>
          No personal bests recorded yet. They'll appear here automatically when athletes log heavier weights.
        </div>
      )}
      {pbs.map((pb) => {
        const myReaction = pb.reactions?.find(
          (r) => r.reactor_type === "coach" && r.reactor_id === coachId
        );
        const reactionGroups = (pb.reactions ?? []).reduce<Record<string, number>>(
          (acc, r) => { acc[r.emoji] = (acc[r.emoji] ?? 0) + 1; return acc; }, {}
        );
        return (
          <PBCard
            key={pb.id}
            pb={pb}
            myReaction={myReaction}
            reactionGroups={reactionGroups}
            onReact={(emoji) => handleReaction(pb, emoji)}
            onDelete={() => handleDelete(pb.id)}
            onCommentDeleted={(commentId) => {
              onPbsChange(pbs.map(p => p.id === pb.id
                ? { ...p, comments: (p.comments ?? []).filter((c: any) => c.id !== commentId) }
                : p
              ));
            }}
            coachId={coachId}
            coachName={coachName}
            onCommentAdded={(comment) => {
              onPbsChange(pbs.map(p => p.id === pb.id
                ? { ...p, comments: [...(p.comments ?? []), comment] }
                : p
              ));
            }}
            s={s}
          />
        );
      })}
    </div>
  );
}

// ── PB Card ──────────────────────────────────────────────────────────────────

function PBCard({ pb, myReaction, reactionGroups, onReact, onDelete, onCommentDeleted, coachId, coachName, onCommentAdded, s }: {
  pb: PersonalBest;
  myReaction: any;
  reactionGroups: Record<string, number>;
  onReact: (emoji: string) => void;
  onDelete: () => void;
  onCommentDeleted: (commentId: string) => void;
  coachId: string;
  coachName: string;
  onCommentAdded: (comment: any) => void;
  s: Record<string, React.CSSProperties>;
}) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);
  const comments = pb.comments ?? [];

  const handleDeleteComment = async (commentId: string) => {
    setDeletingComment(commentId);
    try {
      await fetch("/api/pb-comments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_id: commentId }),
      });
      onCommentDeleted(commentId);
    } finally {
      setDeletingComment(null);
    }
  };

  const handleComment = async () => {
    if (!commentText.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/pb-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pb_id: pb.id,
          body: commentText.trim(),
          author_id: coachId,
          author_name: coachName,
          author_type: "coach",
        }),
      });
      const data = await res.json();
      if (data.comment) {
        onCommentAdded(data.comment);
        setCommentText("");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={s.pbCard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={s.pbAthlete}>{pb.athlete?.name ?? "Unknown athlete"}</div>
        <button
          onClick={onDelete}
          title="Delete this PB"
          style={{ background: "transparent", border: "none", color: "var(--mute)", fontSize: 14, cursor: "pointer", padding: "0 0 0 8px", lineHeight: 1 }}
        >
          ✕
        </button>
      </div>
      <div style={s.pbExercise}>🏆 {pb.exercise_name}</div>
      <div style={s.pbWeight}>{formatPBValue(pb)}</div>
      <div style={s.pbDate}>{pb.date} · {timeAgo(pb.created_at)}</div>

      <div style={s.reactionArea}>
        {Object.entries(reactionGroups).map(([emoji, count]) => (
          <span key={emoji} style={s.reactionBadge}>{emoji} {count}</span>
        ))}
        {["🔥", "💪", "⭐", "👏"].map((emoji) => (
          <button
            key={emoji}
            style={{ ...s.reactionBtn, ...(myReaction?.emoji === emoji ? s.reactionBtnActive : {}) }}
            onClick={() => onReact(emoji)}
          >
            {emoji}
          </button>
        ))}
        <button
          style={{ ...s.reactionBtn, width: "auto", padding: "0 8px", fontSize: 12, color: "var(--mute)", gap: 4 }}
          onClick={() => setShowComments(v => !v)}
        >
          💬 {comments.length > 0 ? comments.length : ""} {showComments ? "▴" : "▾"}
        </button>
      </div>

      {showComments && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 4, display: "flex", flexDirection: "column" as const, gap: 6 }}>
          {comments.map((c: any) => (
            <div key={c.id} style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "flex-start" }}>
              <span style={{ fontWeight: 700, color: "var(--text)", flexShrink: 0 }}>{c.author_name}</span>
              <span style={{ color: "var(--mute)", flex: 1 }}>{c.body}</span>
              <button
                onClick={() => handleDeleteComment(c.id)}
                disabled={deletingComment === c.id}
                style={{ background: "transparent", border: "none", color: "var(--mute)", fontSize: 11, cursor: "pointer", padding: "0 2px", opacity: deletingComment === c.id ? 0.4 : 0.6, flexShrink: 0 }}
                title="Delete comment"
              >✕</button>
            </div>
          ))}
          {comments.length === 0 && <div style={{ fontSize: 12, color: "var(--mute)" }}>No comments yet</div>}
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <input
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleComment(); }}
              placeholder="Add a comment..."
              style={{ flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "6px 10px", fontSize: 12 }}
            />
            <button
              style={{ background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: sending ? 0.5 : 1 }}
              onClick={handleComment}
              disabled={sending}
            >Send</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Competitions tab (coach side) ─────────────────────────────────────────────

const COMP_REACTION_EMOJIS = ["👍", "💪", "🏆", "🤞", "🔥", "❤️"];

function CoachCompsTab({ competitions, onCompetitionsChange, coachId, coachName, athletes }: {
  competitions: any[];
  onCompetitionsChange: (c: any[]) => void;
  coachId: string;
  coachName: string;
  athletes: { id: string; name: string }[];
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", competition_date: "", location: "", notes: "" });
  const [selectedAthleteId, setSelectedAthleteId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [deletingComp, setDeletingComp] = useState<string | null>(null);

  const apiPost = async (body: object) => {
    const res = await fetch("/api/competitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  const reload = async () => {
    const res = await fetch("/api/competitions");
    const data = await res.json();
    onCompetitionsChange(data.competitions ?? []);
  };

  const handleAdd = async () => {
    if (!form.title.trim() || !form.competition_date || !selectedAthleteId) return;
    setSaving(true); setError("");
    try {
      await apiPost({ action: "add_competition", athlete_id: selectedAthleteId, ...form });
      await reload();
      setAdding(false);
      setForm({ title: "", competition_date: "", location: "", notes: "" });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (compId: string) => {
    setDeletingComp(compId);
    try {
      await apiPost({ action: "delete_competition", competition_id: compId });
      onCompetitionsChange(competitions.filter((c) => c.id !== compId));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete"); }
    finally { setDeletingComp(null); }
  };

  const handleReact = async (compId: string, emoji: string) => {
    const comp = competitions.find((c) => c.id === compId);
    const myReaction = comp?.reactions?.find((r: any) => r.reactor_id === coachId && r.reactor_type === "coach");
    try {
      if (myReaction?.emoji === emoji) {
        await apiPost({ action: "remove_react", competition_id: compId });
        onCompetitionsChange(competitions.map((c) => c.id === compId
          ? { ...c, reactions: c.reactions.filter((r: any) => !(r.reactor_id === coachId && r.reactor_type === "coach")) }
          : c
        ));
      } else {
        await apiPost({ action: "react", competition_id: compId, emoji });
        await reload();
      }
    } catch (e) { console.error(e); }
  };

  const handleComment = async (compId: string) => {
    const body = commentText[compId]?.trim();
    if (!body) return;
    try {
      const data = await apiPost({ action: "comment", competition_id: compId, body });
      if (data.comment) {
        onCompetitionsChange(competitions.map((c) => c.id === compId
          ? { ...c, comments: [...(c.comments ?? []), data.comment] }
          : c
        ));
        setCommentText((prev) => ({ ...prev, [compId]: "" }));
      }
    } catch (e) { console.error(e); }
  };

  const handleDeleteComment = async (compId: string, commentId: string) => {
    try {
      await apiPost({ action: "delete_comment", comment_id: commentId });
      onCompetitionsChange(competitions.map((c) => c.id === compId
        ? { ...c, comments: (c.comments ?? []).filter((cm: any) => cm.id !== commentId) }
        : c
      ));
    } catch (e) { console.error(e); }
  };

  const now = new Date().toISOString().slice(0, 10);
  const upcoming = competitions.filter((c) => c.competition_date >= now).sort((a: any, b: any) => a.competition_date < b.competition_date ? -1 : 1);
  const past = competitions.filter((c) => c.competition_date < now).sort((a: any, b: any) => b.competition_date < a.competition_date ? -1 : 1);

  const renderComp = (comp: any) => {
    const myReaction = comp.reactions?.find((r: any) => r.reactor_id === coachId && r.reactor_type === "coach");
    const reactionGroups = (comp.reactions ?? []).reduce((acc: any, r: any) => { acc[r.emoji] = (acc[r.emoji] ?? 0) + 1; return acc; }, {});
    const showComments = expandedComments[comp.id];
    const athlete = athletes.find((a) => a.id === comp.athlete_id);

    return (
      <div key={comp.id} style={s.compCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={s.compAthlete}>{comp.athlete?.name ?? athlete?.name ?? "Unknown"}</div>
            <div style={s.compTitle}>{comp.title}</div>
            <div style={s.compMeta}>
              📅 {comp.competition_date}
              {comp.location ? ` · 📍 ${comp.location}` : ""}
            </div>
            {comp.notes && <div style={s.compNotes}>{comp.notes}</div>}
          </div>
          <button
            onClick={() => handleDelete(comp.id)}
            disabled={deletingComp === comp.id}
            style={{ background: "transparent", border: "none", color: "var(--mute)", cursor: "pointer", fontSize: 14, padding: "0 0 0 8px", opacity: deletingComp === comp.id ? 0.4 : 0.7 }}
            title="Delete competition"
          >✕</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" as const }}>
          {Object.entries(reactionGroups).map(([emoji, count]) => (
            <span key={emoji} style={s.reactionBadge}>{emoji} {count as number}</span>
          ))}
          {COMP_REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              style={{ ...s.reactionBtn, ...(myReaction?.emoji === emoji ? s.reactionBtnActive : {}) }}
              onClick={() => handleReact(comp.id, emoji)}
            >{emoji}</button>
          ))}
          <button
            style={{ ...s.reactionBtn, width: "auto", padding: "0 8px", fontSize: 12, color: "var(--mute)" }}
            onClick={() => setExpandedComments((prev) => ({ ...prev, [comp.id]: !prev[comp.id] }))}
          >
            💬 {comp.comments?.length > 0 ? comp.comments.length : ""} {showComments ? "▴" : "▾"}
          </button>
        </div>

        {showComments && (
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 6, display: "flex", flexDirection: "column" as const, gap: 6 }}>
            {(comp.comments ?? []).map((c: any) => (
              <div key={c.id} style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "flex-start" }}>
                <span style={{ fontWeight: 700, color: "var(--text)", flexShrink: 0 }}>{c.author_name}</span>
                <span style={{ color: "var(--mute)", flex: 1 }}>{c.body}</span>
                <button
                  onClick={() => handleDeleteComment(comp.id, c.id)}
                  style={{ background: "transparent", border: "none", color: "var(--mute)", fontSize: 11, cursor: "pointer", padding: "0 2px", opacity: 0.6, flexShrink: 0 }}
                  title="Delete comment"
                >✕</button>
              </div>
            ))}
            {comp.comments?.length === 0 && <div style={{ fontSize: 12, color: "var(--mute)" }}>No comments yet</div>}
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <input
                value={commentText[comp.id] ?? ""}
                onChange={(e) => setCommentText((prev) => ({ ...prev, [comp.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") handleComment(comp.id); }}
                placeholder="Add a comment…"
                style={{ flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "6px 10px", fontSize: 12 }}
              />
              <button
                onClick={() => handleComment(comp.id)}
                style={{ background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >Send</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={s.tabContent}>
      {error && <div style={s.errorBox}>{error}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={s.sectionTitle}>Competitions</div>
        <button style={s.primaryBtn} onClick={() => setAdding(true)}>+ Add</button>
      </div>

      {adding && (
        <div style={{ background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 16, display: "flex", flexDirection: "column" as const, gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Add Competition</div>
          <select
            style={s.input}
            value={selectedAthleteId}
            onChange={(e) => setSelectedAthleteId(e.target.value)}
          >
            <option value="">— Select athlete —</option>
            {athletes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input placeholder="Event name / title" style={s.input} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <input type="date" style={s.input} value={form.competition_date} onChange={(e) => setForm((f) => ({ ...f, competition_date: e.target.value }))} />
          <input placeholder="Location (optional)" style={s.input} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
          <input placeholder="Notes (optional)" style={s.input} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button style={s.ghostBtn} onClick={() => setAdding(false)}>Cancel</button>
            <button style={{ ...s.primaryBtn, opacity: saving ? 0.6 : 1 }} disabled={saving || !form.title.trim() || !form.competition_date || !selectedAthleteId} onClick={handleAdd}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>Upcoming</div>
          {upcoming.map(renderComp)}
        </>
      )}
      {past.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.06em", margin: "16px 0 8px" }}>Past</div>
          {past.map(renderComp)}
        </>
      )}
      {competitions.length === 0 && !adding && (
        <div style={s.empty}>No competitions yet. Add one above to get started.</div>
      )}
    </div>
  );
}

// ── Chat tab ──────────────────────────────────────────────────────────────────

function ChatTab({ groups, coachId, coachName }: {
  groups: Group[];
  coachId: string;
  coachName: string;
}) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    groups[0]?.id ?? null
  );
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  if (groups.length === 0) {
    return (
      <div style={s.tabContent}>
        <div style={s.empty}>
          Create a group first — chat is scoped to groups.
        </div>
      </div>
    );
  }

  return (
    <div style={s.tabContent}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 4 }}>
        {groups.map((g) => (
          <button
            key={g.id}
            style={{
              ...s.ghostBtn,
              borderColor: selectedGroupId === g.id ? g.colour : undefined,
              color: selectedGroupId === g.id ? g.colour : undefined,
              fontWeight: selectedGroupId === g.id ? 700 : 600,
            }}
            onClick={() => setSelectedGroupId(g.id)}
          >
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: g.colour, marginRight: 6 }} />
            {g.name}
          </button>
        ))}
      </div>
      {selectedGroup && coachId && (
        <GroupChat
          groupId={selectedGroup.id}
          groupName={selectedGroup.name}
          coachId={coachId}
          coachName={coachName || "Coach"}
        />
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 720, margin: "0 auto" },
  headRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  heading: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, color: "var(--text)", margin: 0 },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 },
  tabs: { display: "flex", gap: 4, borderBottom: "1px solid var(--line)", marginBottom: 20 },
  tab: { background: "transparent", border: "none", borderBottom: "2px solid transparent", color: "var(--mute)", padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: -1 },
  tabActive: { color: "var(--text)", borderBottomColor: "var(--accent)" },
  loadingMsg: { fontSize: 14, color: "var(--mute)", padding: "20px 0" },
  tabContent: { display: "flex", flexDirection: "column", gap: 12 },
  sectionHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 },
  fieldLabel: { fontSize: 11, color: "var(--mute)", fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 4, marginTop: 8 },
  input: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14 },
  textarea: { width: "100%", minHeight: 80, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 12px", fontSize: 14, resize: "vertical" as const, fontFamily: "inherit" },
  select: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 12px", fontSize: 13 },
  checkLabel: { display: "flex", alignItems: "center", fontSize: 13, color: "var(--mute)", cursor: "pointer" },
  createCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 4 },
  colourRow: { display: "flex", gap: 8, marginTop: 4 },
  colourDot: { width: 24, height: 24, borderRadius: "50%", border: "none", cursor: "pointer", flexShrink: 0 },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  deleteBtn: { background: "transparent", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  empty: { fontSize: 13, color: "var(--mute)", padding: "10px 0", fontStyle: "italic" },
  groupCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" },
  groupCardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px" },
  groupDot: { width: 12, height: 12, borderRadius: "50%", flexShrink: 0 },
  groupName: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  groupDesc: { fontSize: 12, color: "var(--mute)", marginTop: 2 },
  memberCount: { fontSize: 12, color: "var(--mute)" },
  groupExpand: { borderTop: "1px solid var(--line)", padding: 16, display: "flex", flexDirection: "column", gap: 12 },
  memberSection: { display: "flex", flexDirection: "column", gap: 6 },
  memberRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "var(--ink)", borderRadius: 8 },
  memberName: { fontSize: 13, color: "var(--text)" },
  removeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 12, cursor: "pointer" },
  addAthleteList: { display: "flex", flexWrap: "wrap" as const, gap: 6 },
  addAthleteBtn: { background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 7, padding: "5px 10px", fontSize: 12, cursor: "pointer" },
  composeFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 10, flexWrap: "wrap" as const },
  annCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14 },
  annPinned: { borderColor: "var(--accent)", background: "var(--accent-dim)" },
  annHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  pinnedTag: { fontSize: 11, color: "var(--accent)", fontWeight: 700, marginBottom: 4, display: "block" },
  annTitle: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
  annMeta: { fontSize: 12, color: "var(--mute)", marginTop: 3 },
  annBody: { fontSize: 13, color: "var(--mute)", marginTop: 8, lineHeight: 1.5 },
  pbCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14 },
  pbTop: { display: "flex", flexDirection: "column" as const, gap: 8 },
  pbAthlete: { fontSize: 13, fontWeight: 700, color: "var(--text)" },
  pbExercise: { fontSize: 15, fontWeight: 700, color: "var(--accent)", marginTop: 2 },
  pbWeight: { fontSize: 20, fontWeight: 700, color: "var(--text)", marginTop: 4 },
  pbDate: { fontSize: 11, color: "var(--mute)", marginTop: 4 },
  reactionArea: { display: "flex", flexDirection: "row" as const, alignItems: "center", gap: 4, flexWrap: "wrap" as const },
  reactionBadge: { fontSize: 12, background: "var(--ink)", borderRadius: 6, padding: "2px 8px" },
  reactionBtn: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 6, width: 28, height: 28, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  reactionBtnActive: { background: "var(--accent-dim)", borderColor: "var(--accent)" },
  compCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 10 },
  compAthlete: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  compTitle: { fontSize: 16, fontWeight: 700, color: "var(--text)", marginTop: 4 },
  compMeta: { fontSize: 12, color: "var(--mute)", marginTop: 4 },
  compNotes: { fontSize: 12, color: "var(--mute)", marginTop: 6, fontStyle: "italic" as const },
};
