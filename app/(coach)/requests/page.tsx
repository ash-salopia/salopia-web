"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import {
  listFeatureRequests, createFeatureRequest, toggleVote, addComment, deleteComment,
  deleteFeatureRequest, updateRequestStatus,
  type FeatureRequest, type RequestSort, type FeatureRequestCategory, type FeatureRequestStatus,
} from "@/lib/data/feature-requests";

const CATEGORY_LABEL: Record<FeatureRequestCategory, string> = {
  general: "General", programming: "Programming", testing: "Testing",
  reporting: "Reporting", athlete_app: "Athlete app", other: "Other",
};

const STATUS_META: Record<FeatureRequestStatus, { label: string; color: string; dim: string }> = {
  open:        { label: "Open",        color: "var(--mute)",  dim: "var(--panel2)" },
  planned:     { label: "Planned",     color: "#4a9eff",      dim: "#162743" },
  in_progress: { label: "In Progress", color: "#f5a623",      dim: "#2a1e00" },
  done:        { label: "Done",        color: "var(--good)",  dim: "var(--good-dim)" },
  closed:      { label: "Closed",      color: "var(--mute)",  dim: "var(--panel2)" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [sort, setSort] = useState<RequestSort>("top");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [coachId, setCoachId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [composerOpen, setComposerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCategory, setNewCategory] = useState<FeatureRequestCategory>("general");
  const [saving, setSaving] = useState(false);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [sendingComment, setSendingComment] = useState<string | null>(null);

  const load = async (s: RequestSort) => {
    setLoading(true);
    setError("");
    try {
      setRequests(await listFeatureRequests(s));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const supabase = createClient();
    // Coaches RLS returns every colleague in the org, not just this
    // one - .single() with no filter silently breaks for any org with
    // more than one coach, so this has to resolve auth.uid() first.
    supabase.auth.getUser().then(({ data: auth }) => {
      const uid = auth.user?.id;
      if (!uid) return;
      supabase.from("coaches").select("id, is_app_admin").eq("id", uid).single().then(({ data }) => {
        if (data) { setCoachId(data.id); setIsAdmin(!!(data as any).is_app_admin); }
      });
    });
    load(sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(sort); }, [sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    setError("");
    try {
      const created = await createFeatureRequest(newTitle, newDesc, newCategory);
      setRequests((prev) => [created, ...prev]);
      setNewTitle("");
      setNewDesc("");
      setNewCategory("general");
      setComposerOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit request");
    } finally {
      setSaving(false);
    }
  };

  const handleVote = async (req: FeatureRequest) => {
    const voted = req.votes.some((v) => v.coach_id === coachId);
    setRequests((prev) => prev.map((r) => r.id !== req.id ? r : {
      ...r,
      votes: voted ? r.votes.filter((v) => v.coach_id !== coachId) : [...r.votes, { coach_id: coachId }],
    }));
    try {
      await toggleVote(req.id, coachId, voted);
    } catch (e) {
      // roll back on failure
      setRequests((prev) => prev.map((r) => r.id !== req.id ? r : req));
      setError(e instanceof Error ? e.message : "Could not vote");
    }
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleComment = async (req: FeatureRequest) => {
    const body = (commentDraft[req.id] ?? "").trim();
    if (!body) return;
    setSendingComment(req.id);
    try {
      const comment = await addComment(req.id, coachId, body);
      setRequests((prev) => prev.map((r) => r.id !== req.id ? r : { ...r, comments: [...r.comments, comment] }));
      setCommentDraft((prev) => ({ ...prev, [req.id]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post comment");
    } finally {
      setSendingComment(null);
    }
  };

  const handleDeleteComment = async (req: FeatureRequest, commentId: string) => {
    try {
      await deleteComment(commentId);
      setRequests((prev) => prev.map((r) => r.id !== req.id ? r : { ...r, comments: r.comments.filter((c) => c.id !== commentId) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete comment");
    }
  };

  const handleDeleteRequest = async (req: FeatureRequest) => {
    if (!confirm(`Delete "${req.title}"? This cannot be undone.`)) return;
    try {
      await deleteFeatureRequest(req.id);
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete request");
    }
  };

  const handleStatusChange = async (req: FeatureRequest, status: FeatureRequestStatus) => {
    setRequests((prev) => prev.map((r) => r.id !== req.id ? r : { ...r, status }));
    try {
      await updateRequestStatus(req.id, status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update status");
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Request a Feature</h1>
          <p style={styles.subtitle}>
            Shared across every coach on VIS BUILD — vote on what matters to you, or post something new.
          </p>
        </div>
        <button style={styles.primaryBtn} onClick={() => setComposerOpen((v) => !v)}>
          {composerOpen ? "Cancel" : "+ New request"}
        </button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {composerOpen && (
        <div style={styles.composer}>
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder='Short, specific title — e.g. "Bulk-assign a programme to a whole group"'
            style={styles.input}
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="What would this let you do, and why does it matter?"
            style={styles.textarea}
          />
          <div style={styles.composerFooter}>
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as FeatureRequestCategory)} style={styles.select}>
              {Object.entries(CATEGORY_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <button
              style={{ ...styles.primaryBtn, opacity: !newTitle.trim() || saving ? 0.5 : 1 }}
              disabled={!newTitle.trim() || saving}
              onClick={handleCreate}
            >
              {saving ? "Posting…" : "Post request"}
            </button>
          </div>
        </div>
      )}

      <div style={styles.sortRow}>
        {(["top", "new"] as RequestSort[]).map((s) => (
          <button key={s} style={{ ...styles.sortBtn, ...(sort === s ? styles.sortBtnActive : {}) }} onClick={() => setSort(s)}>
            {s === "top" ? "Top" : "New"}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={styles.empty}>Loading…</div>
      ) : !requests.length ? (
        <div style={styles.empty}>No requests yet — be the first to post one.</div>
      ) : (
        <div style={styles.list}>
          {requests.map((req) => {
            const voted = req.votes.some((v) => v.coach_id === coachId);
            const isOpen = expanded.has(req.id);
            const statusMeta = STATUS_META[req.status];
            const canDelete = req.coach_id === coachId || isAdmin;
            return (
              <div key={req.id} style={styles.card}>
                <div style={styles.cardRow}>
                  <button
                    style={{ ...styles.voteBtn, ...(voted ? styles.voteBtnActive : {}) }}
                    onClick={() => handleVote(req)}
                    title={voted ? "Remove your vote" : "Vote for this"}
                  >
                    <span style={styles.voteArrow}>▲</span>
                    <span>{req.votes.length}</span>
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.cardTop}>
                      <span style={styles.cardTitle} onClick={() => toggleExpanded(req.id)}>{req.title}</span>
                      <span style={{ ...styles.statusBadge, color: statusMeta.color, background: statusMeta.dim }}>
                        {statusMeta.label}
                      </span>
                      <span style={styles.categoryTag}>{CATEGORY_LABEL[req.category]}</span>
                    </div>
                    {req.description && <p style={styles.cardDesc}>{req.description}</p>}
                    <div style={styles.cardMeta}>
                      <span>{req.coach?.name ?? "A coach"} · {timeAgo(req.created_at)}</span>
                      <button style={styles.commentToggle} onClick={() => toggleExpanded(req.id)}>
                        💬 {req.comments.length > 0 ? req.comments.length : "Comment"}
                      </button>
                      {isAdmin && (
                        <select
                          value={req.status}
                          onChange={(e) => handleStatusChange(req, e.target.value as FeatureRequestStatus)}
                          style={styles.statusSelect}
                        >
                          {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                        </select>
                      )}
                      {canDelete && (
                        <button style={styles.deleteLink} onClick={() => handleDeleteRequest(req)}>Delete</button>
                      )}
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div style={styles.commentsWrap}>
                    {req.comments.map((c) => (
                      <div key={c.id} style={styles.commentRow}>
                        <span style={styles.commentAuthor}>{c.coach?.name ?? "A coach"}</span>
                        {c.coach?.is_app_admin && <span style={styles.teamBadge}>VIS BUILD Team</span>}
                        <span style={styles.commentBody}>{c.body}</span>
                        {(c.coach_id === coachId || isAdmin) && (
                          <button style={styles.commentDelete} onClick={() => handleDeleteComment(req, c.id)}>✕</button>
                        )}
                      </div>
                    ))}
                    <div style={styles.commentInputRow}>
                      <input
                        value={commentDraft[req.id] ?? ""}
                        onChange={(e) => setCommentDraft((prev) => ({ ...prev, [req.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") handleComment(req); }}
                        placeholder="Add a comment…"
                        style={styles.commentInput}
                      />
                      <button
                        style={styles.commentSendBtn}
                        disabled={sendingComment === req.id}
                        onClick={() => handleComment(req)}
                      >
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 13, color: "var(--mute)", margin: "4px 0 0", maxWidth: 480 },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16 },
  composer: { display: "flex", flexDirection: "column", gap: 10, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 20 },
  input: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 14 },
  textarea: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 13, minHeight: 80, resize: "vertical" as const, fontFamily: "inherit" },
  composerFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  select: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 13 },
  sortRow: { display: "flex", gap: 6, marginBottom: 16 },
  sortBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  sortBtnActive: { background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" },
  empty: { color: "var(--mute)", fontSize: 14, padding: "40px 0", textAlign: "center" as const },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14 },
  cardRow: { display: "flex", gap: 12 },
  voteBtn: { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 2, background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer", height: "fit-content", minWidth: 44 },
  voteBtnActive: { background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" },
  voteArrow: { fontSize: 12, lineHeight: 1 },
  cardTop: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "var(--text)", cursor: "pointer" },
  statusBadge: { fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "2px 8px", textTransform: "uppercase" as const, letterSpacing: "0.03em" },
  categoryTag: { fontSize: 11, color: "var(--mute)", background: "var(--panel2)", borderRadius: 6, padding: "2px 8px" },
  cardDesc: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5, margin: "6px 0 0" },
  cardMeta: { display: "flex", alignItems: "center", gap: 14, marginTop: 10, fontSize: 12, color: "var(--mute)" },
  commentToggle: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 12, cursor: "pointer", padding: 0 },
  statusSelect: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "3px 6px", fontSize: 11, marginLeft: "auto" },
  deleteLink: { background: "transparent", border: "none", color: "#FF6B6B", fontSize: 12, cursor: "pointer", padding: 0 },
  commentsWrap: { borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 10, display: "flex", flexDirection: "column" as const, gap: 8, paddingLeft: 56 },
  commentRow: { display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12 },
  commentAuthor: { fontWeight: 700, color: "var(--text)", flexShrink: 0 },
  teamBadge: { fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "var(--accent-dim)", borderRadius: 5, padding: "1px 6px", flexShrink: 0, textTransform: "uppercase" as const, letterSpacing: "0.03em" },
  commentBody: { color: "var(--mute)", flex: 1 },
  commentDelete: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 11, cursor: "pointer", padding: 0, flexShrink: 0 },
  commentInputRow: { display: "flex", gap: 8, marginTop: 4 },
  commentInput: { flex: 1, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 12 },
  commentSendBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
};
