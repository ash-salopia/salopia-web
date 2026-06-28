"use client";

// ============================================================
// CompetitionFeed
// Shows upcoming and recent competitions for athletes in the
// same organisation. Athletes can add their own comps, react
// with emojis, and comment "Good luck!" etc.
// Used in the athlete mobile community page.
// ============================================================

import { useState } from "react";

const REACTION_EMOJIS = ["👍", "💪", "🏆", "🤞", "🔥", "❤️"];

export interface Competition {
  id: string;
  athlete_id: string;
  title: string;
  competition_date: string;
  location?: string;
  notes?: string;
  created_at: string;
  athlete: { id: string; name: string };
  reactions: { id: string; reactor_id: string; reactor_name: string; emoji: string }[];
  comments: { id: string; author_id: string; author_name: string; body: string; created_at: string }[];
}

interface Props {
  competitions: Competition[];
  athleteId: string;      // athlete whose comp we're adding (for coach: selected athlete or "")
  athleteName: string;
  token: string;          // share token (athlete mobile) — empty string on coach side
  // Coach identity — used when token is empty
  coachId?: string;
  coachName?: string;
  organisationId?: string;
  onUpdated: (comps: Competition[]) => void;
}

export default function CompetitionFeed({ competitions, athleteId, athleteName, token, coachId, coachName, organisationId, onUpdated }: Props) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", competition_date: "", location: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");

  async function apiPost(body: object) {
    const identity = token
      ? { token }
      : { athlete_id: athleteId || undefined, organisation_id: organisationId, actor_id: coachId, actor_name: coachName, actor_type: "coach" };
    const res = await fetch("/api/athlete-link/competitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...identity, ...body }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function handleAddComp() {
    if (!form.title.trim() || !form.competition_date) return;
    setSaving(true);
    setError("");
    try {
      await apiPost({ action: "add_competition", ...form });
      // Reload
      const res = await fetch(`/api/athlete-link/competitions?organisation_id=${organisationId || ""}&token=${token}`);
      const data = await res.json();
      onUpdated(data.competitions ?? []);
      setAdding(false);
      setForm({ title: "", competition_date: "", location: "", notes: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally { setSaving(false); }
  }

  async function handleReact(competition_id: string, emoji: string) {
    try {
      await apiPost({ action: "react", competition_id, emoji });
      const res = await fetch(`/api/athlete-link/competitions?organisation_id=${organisationId || ""}&token=${token}`);
      const data = await res.json();
      onUpdated(data.competitions ?? []);
    } catch (e) { console.error(e); }
  }

  async function handleComment(competition_id: string) {
    const body = commentText[competition_id]?.trim();
    if (!body) return;
    try {
      await apiPost({ action: "comment", competition_id, body });
      setCommentText(prev => ({ ...prev, [competition_id]: "" }));
      const res = await fetch(`/api/athlete-link/competitions?organisation_id=${organisationId || ""}&token=${token}`);
      const data = await res.json();
      onUpdated(data.competitions ?? []);
    } catch (e) { console.error(e); }
  }

  const now = new Date().toISOString().slice(0, 10);
  const upcoming = competitions.filter(c => c.competition_date >= now);
  const past = competitions.filter(c => c.competition_date < now);

  function formatDate(d: string) {
    return new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }

  function daysUntil(d: string) {
    const diff = Math.ceil((new Date(d + "T12:00:00Z").getTime() - Date.now()) / 86400000);
    if (diff === 0) return "Today!";
    if (diff === 1) return "Tomorrow!";
    if (diff < 0) return `${Math.abs(diff)}d ago`;
    return `${diff} days`;
  }

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.title}>🏆 Competition Calendar</div>
        <button style={s.addBtn} onClick={() => setAdding(v => !v)}>
          {adding ? "Cancel" : "+ Add comp"}
        </button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {/* Add form */}
      {adding && (
        <div style={s.formCard}>
          <div style={s.fieldLabel}>Competition / event</div>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g. National Championships 100m" style={s.input} autoFocus />
          <div style={s.formRow}>
            <div style={{ flex: 1 }}>
              <div style={s.fieldLabel}>Date</div>
              <input type="date" value={form.competition_date}
                onChange={e => setForm(f => ({ ...f, competition_date: e.target.value }))}
                style={s.input} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={s.fieldLabel}>Location</div>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="City / venue" style={s.input} />
            </div>
          </div>
          <div style={s.fieldLabel}>Notes</div>
          <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Event, heat time, goal..." style={s.input} />
          <button
            style={{ ...s.saveBtn, opacity: !form.title.trim() || !form.competition_date || saving ? 0.5 : 1 }}
            disabled={!form.title.trim() || !form.competition_date || saving}
            onClick={handleAddComp}
          >
            {saving ? "Saving…" : "Add to calendar"}
          </button>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionLabel}>Upcoming</div>
          {upcoming.map(comp => (
            <CompCard
              key={comp.id}
              comp={comp}
              athleteId={athleteId}
              formatDate={formatDate}
              daysUntil={daysUntil}
              onReact={handleReact}
              commentText={commentText[comp.id] ?? ""}
              onCommentChange={v => setCommentText(prev => ({ ...prev, [comp.id]: v }))}
              onComment={() => handleComment(comp.id)}
              showComments={expandedComments[comp.id] ?? false}
              onToggleComments={() => setExpandedComments(prev => ({ ...prev, [comp.id]: !prev[comp.id] }))}
            />
          ))}
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionLabel}>Past</div>
          {past.slice(-3).reverse().map(comp => (
            <CompCard
              key={comp.id}
              comp={comp}
              athleteId={athleteId}
              formatDate={formatDate}
              daysUntil={daysUntil}
              onReact={handleReact}
              commentText={commentText[comp.id] ?? ""}
              onCommentChange={v => setCommentText(prev => ({ ...prev, [comp.id]: v }))}
              onComment={() => handleComment(comp.id)}
              showComments={expandedComments[comp.id] ?? false}
              onToggleComments={() => setExpandedComments(prev => ({ ...prev, [comp.id]: !prev[comp.id] }))}
              isPast
            />
          ))}
        </div>
      )}

      {competitions.length === 0 && !adding && (
        <div style={s.empty}>No competitions added yet. Be the first!</div>
      )}
    </div>
  );
}

function CompCard({ comp, athleteId, formatDate, daysUntil, onReact, commentText, onCommentChange, onComment, showComments, onToggleComments, isPast }: {
  comp: Competition;
  athleteId: string;
  formatDate: (d: string) => string;
  daysUntil: (d: string) => string;
  onReact: (id: string, emoji: string) => void;
  commentText: string;
  onCommentChange: (v: string) => void;
  onComment: () => void;
  showComments: boolean;
  onToggleComments: () => void;
  isPast?: boolean;
}) {
  const myReaction = comp.reactions.find(r => r.reactor_id === athleteId);
  const reactionCounts: Record<string, number> = {};
  comp.reactions.forEach(r => { reactionCounts[r.emoji] = (reactionCounts[r.emoji] ?? 0) + 1; });
  const until = daysUntil(comp.competition_date);
  const isUrgent = !isPast && parseInt(until) <= 7;

  return (
    <div style={{ ...s.card, ...(isUrgent ? s.cardUrgent : {}) }}>
      {/* Header */}
      <div style={s.cardHeader}>
        <div>
          <div style={s.cardTitle}>{comp.title}</div>
          <div style={s.cardMeta}>
            {comp.athlete?.name ?? "Team"} · {formatDate(comp.competition_date)}
            {comp.location && ` · ${comp.location}`}
          </div>
        </div>
        <div style={{ ...s.countdown, color: isPast ? "var(--mute)" : isUrgent ? "#EF4444" : "#10B981" }}>
          {until}
        </div>
      </div>

      {comp.notes && <div style={s.cardNotes}>{comp.notes}</div>}

      {/* Reactions */}
      <div style={s.reactRow}>
        {REACTION_EMOJIS.map(emoji => (
          <button
            key={emoji}
            style={{ ...s.emojiBtn, ...(myReaction?.emoji === emoji ? s.emojiBtnActive : {}) }}
            onClick={() => onReact(comp.id, emoji)}
          >
            {emoji}
            {reactionCounts[emoji] ? <span style={s.emojiCount}>{reactionCounts[emoji]}</span> : null}
          </button>
        ))}
        <button style={s.commentToggle} onClick={onToggleComments}>
          💬 {comp.comments.length > 0 ? comp.comments.length : ""}
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div style={s.commentsSection}>
          {comp.comments.map(c => (
            <div key={c.id} style={s.comment}>
              <span style={s.commentAuthor}>{c.author_name}</span>
              <span style={s.commentBody}>{c.body}</span>
            </div>
          ))}
          <div style={s.commentInput}>
            <input
              value={commentText}
              onChange={e => onCommentChange(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onComment(); } }}
              placeholder="Good luck! 🤞"
              style={s.input}
            />
            <button style={s.sendBtn} onClick={onComment}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { marginTop: 20 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  addBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  error: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 10 },
  formCard: { background: "var(--panel)", border: "1px solid var(--accent)44", borderRadius: 12, padding: 14, marginBottom: 16, display: "flex", flexDirection: "column" as const, gap: 8 },
  formRow: { display: "flex", gap: 8 },
  fieldLabel: { fontSize: 11, color: "var(--mute)", fontWeight: 600, textTransform: "uppercase" as const, marginBottom: 3 },
  input: { width: "100%", background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 13 },
  saveBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "9px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginBottom: 10 },
  cardUrgent: { borderColor: "#EF444444", background: "#EF444408" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  cardTitle: { fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 2 },
  cardMeta: { fontSize: 11, color: "var(--mute)" },
  countdown: { fontSize: 13, fontWeight: 700, flexShrink: 0, marginLeft: 8 },
  cardNotes: { fontSize: 12, color: "var(--mute)", fontStyle: "italic" as const, marginBottom: 8 },
  reactRow: { display: "flex", gap: 4, flexWrap: "wrap" as const, alignItems: "center", marginTop: 8 },
  emojiBtn: { background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 6, padding: "4px 8px", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 },
  emojiBtnActive: { background: "var(--accent-dim)", borderColor: "var(--accent)" },
  emojiCount: { fontSize: 11, fontWeight: 700, color: "var(--mute)" },
  commentToggle: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, padding: "4px 8px", fontSize: 13, cursor: "pointer", marginLeft: "auto" },
  commentsSection: { marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column" as const, gap: 6 },
  comment: { fontSize: 13, display: "flex", gap: 6 },
  commentAuthor: { fontWeight: 700, color: "var(--text)", flexShrink: 0 },
  commentBody: { color: "var(--mute)" },
  commentInput: { display: "flex", gap: 6, marginTop: 4 },
  sendBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  empty: { color: "var(--mute)", fontSize: 13, textAlign: "center" as const, padding: "16px 0" },
};
