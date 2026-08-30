"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getThread, addReply, updateReply, deleteReply, updateThread, deleteThread,
  setThreadPinned, toggleThreadVote,
  JC_SOURCE_LABEL,
  type ForumThread, type ForumReply, type JcSourceType, type ForumRoomKind,
} from "@/lib/data/forum";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
const isUrl = (s: string | null) => !!s && /^https?:\/\//i.test(s.trim());

interface Props {
  threadId: string;
  coachId: string;
  isAdmin: boolean;
  roomKind: ForumRoomKind;
  onBack: () => void;
  onChanged: () => void; // refresh the thread list (counts, activity, deletion)
}

export default function ThreadView({ threadId, coachId, isAdmin, roomKind, onBack, onChanged }: Props) {
  const [thread, setThread] = useState<ForumThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editReplyText, setEditReplyText] = useState("");

  const [editingOp, setEditingOp] = useState(false);
  const [opTitle, setOpTitle] = useState("");
  const [opBody, setOpBody] = useState("");
  const [opSrc, setOpSrc] = useState<JcSourceType | "">("");
  const [opRef, setOpRef] = useState("");
  const [opTake, setOpTake] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setThread(await getThread(threadId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load thread");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={s.muted}>Loading…</div>;
  if (error || !thread) return (
    <div>
      <button style={s.back} onClick={onBack}>← Back</button>
      <div style={s.errorBox}>{error || "Thread not found."}</div>
    </div>
  );

  const t = thread;
  const voted = t.votes.some((v) => v.coach_id === coachId);
  const mineOp = t.coach_id === coachId || isAdmin;
  const isJc = roomKind === "journal_club";

  const vote = async () => {
    const next = { ...t, votes: voted ? t.votes.filter((v) => v.coach_id !== coachId) : [...t.votes, { coach_id: coachId }] };
    setThread(next);
    try { await toggleThreadVote(t.id, coachId, voted); } catch { setThread(t); }
  };

  const startEditOp = () => {
    setOpTitle(t.title); setOpBody(t.body);
    setOpSrc((t.jc_source_type ?? "") as JcSourceType | "");
    setOpRef(t.jc_reference ?? ""); setOpTake(t.jc_takeaways ?? "");
    setEditingOp(true);
  };
  const saveOp = async () => {
    if (!opTitle.trim()) return;
    const patch = isJc
      ? { title: opTitle, body: opBody, jcSourceType: (opSrc || null) as JcSourceType | null, jcReference: opRef, jcTakeaways: opTake }
      : { title: opTitle, body: opBody };
    setThread({ ...t, ...{
      title: opTitle.trim(), body: opBody.trim(), edited_at: new Date().toISOString(),
      jc_source_type: isJc ? ((opSrc || null) as JcSourceType | null) : t.jc_source_type,
      jc_reference: isJc ? (opRef.trim() || null) : t.jc_reference,
      jc_takeaways: isJc ? (opTake.trim() || null) : t.jc_takeaways,
    } });
    setEditingOp(false);
    try { await updateThread(t.id, patch); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : "Could not save"); load(); }
  };

  const removeThread = async () => {
    if (!confirm("Delete this whole thread and its replies? This can't be undone.")) return;
    try { await deleteThread(t.id); onChanged(); onBack(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not delete"); }
  };

  const togglePin = async () => {
    setThread({ ...t, pinned: !t.pinned });
    try { await setThreadPinned(t.id, !t.pinned); onChanged(); } catch { setThread(t); }
  };

  const submitReply = async () => {
    const body = replyText.trim();
    if (!body || sending) return;
    setSending(true);
    setReplyText("");
    try {
      const r = await addReply(t.id, body);
      setThread({ ...t, replies: [...(t.replies ?? []), r], replyCount: t.replyCount + 1 });
      onChanged();
    } catch (e) {
      setReplyText(body);
      setError(e instanceof Error ? e.message : "Could not post reply");
    } finally {
      setSending(false);
    }
  };

  const saveReplyEdit = async () => {
    if (!editingReplyId) return;
    const id = editingReplyId;
    const body = editReplyText.trim();
    const before = (t.replies ?? []).find((r) => r.id === id);
    if (!body || !before || body === before.body) { setEditingReplyId(null); return; }
    setThread({ ...t, replies: (t.replies ?? []).map((r) => r.id === id ? { ...r, body, edited_at: new Date().toISOString() } : r) });
    setEditingReplyId(null);
    try { await updateReply(id, body); } catch (e) { setError(e instanceof Error ? e.message : "Could not edit"); load(); }
  };

  const removeReply = async (id: string) => {
    if (!confirm("Delete this reply?")) return;
    const before = t.replies ?? [];
    setThread({ ...t, replies: before.filter((r) => r.id !== id), replyCount: Math.max(0, t.replyCount - 1) });
    try { await deleteReply(id); onChanged(); } catch (e) { setThread({ ...t, replies: before }); setError(e instanceof Error ? e.message : "Could not delete"); }
  };

  return (
    <div>
      <button style={s.back} onClick={onBack}>← All threads</button>
      {error && <div style={s.errorBox}>{error}</div>}

      {/* ── Original post ─────────────────────────────────────────── */}
      <div style={s.opCard}>
        <div style={s.opMain}>
          <button style={{ ...s.voteBtn, ...(voted ? s.voteBtnActive : {}) }} onClick={vote} title={voted ? "Remove upvote" : "Upvote"}>
            <span style={{ fontSize: 12, lineHeight: 1 }}>▲</span>
            <span>{t.votes.length}</span>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingOp ? (
              <div style={s.editWrap}>
                <input style={s.input} value={opTitle} onChange={(e) => setOpTitle(e.target.value)} placeholder="Title" />
                {isJc && (
                  <>
                    <select style={s.input} value={opSrc} onChange={(e) => setOpSrc(e.target.value as JcSourceType | "")}>
                      <option value="">Source type…</option>
                      {Object.entries(JC_SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input style={s.input} value={opRef} onChange={(e) => setOpRef(e.target.value)} placeholder="Reference / DOI / link" />
                  </>
                )}
                <textarea style={s.textarea} value={opBody} onChange={(e) => setOpBody(e.target.value)} placeholder={isJc ? "Summary" : "Body"} rows={5} />
                {isJc && <textarea style={s.textarea} value={opTake} onChange={(e) => setOpTake(e.target.value)} placeholder="Key takeaways" rows={3} />}
                <div style={s.rowEnd}>
                  <button style={s.ghostBtn} onClick={() => setEditingOp(false)}>Cancel</button>
                  <button style={s.primaryBtn} onClick={saveOp} disabled={!opTitle.trim()}>Save</button>
                </div>
              </div>
            ) : (
              <>
                <div style={s.opTitleRow}>
                  {t.pinned && <span style={s.pin}>📌 Pinned</span>}
                  <h2 style={s.opTitle}>{t.title}</h2>
                </div>
                {isJc && (t.jc_source_type || t.jc_reference) && (
                  <div style={s.jcCard}>
                    {t.jc_source_type && <span style={s.jcTag}>{JC_SOURCE_LABEL[t.jc_source_type]}</span>}
                    {t.jc_reference && (
                      isUrl(t.jc_reference)
                        ? <a href={t.jc_reference} target="_blank" rel="noopener noreferrer" style={s.jcRefLink}>{t.jc_reference}</a>
                        : <span style={s.jcRef}>{t.jc_reference}</span>
                    )}
                  </div>
                )}
                {t.body && <div style={s.body}>{t.body}</div>}
                {isJc && t.jc_takeaways && (
                  <div style={s.takeaways}>
                    <div style={s.takeawaysLabel}>Key takeaways</div>
                    <div style={s.body}>{t.jc_takeaways}</div>
                  </div>
                )}
                <div style={s.metaRow}>
                  <span>{t.coach?.name ?? "A coach"}{t.coach?.is_app_admin ? " · VIS BUILD Team" : ""} · {timeAgo(t.created_at)}{t.edited_at ? " · edited" : ""}</span>
                  {isAdmin && <button style={s.metaBtn} onClick={togglePin}>{t.pinned ? "Unpin" : "Pin"}</button>}
                  {mineOp && <button style={s.metaBtn} onClick={startEditOp}>Edit</button>}
                  {mineOp && <button style={{ ...s.metaBtn, color: "#FF6B6B" }} onClick={removeThread}>Delete</button>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Replies ───────────────────────────────────────────────── */}
      <div style={s.replyList}>
        {(t.replies ?? []).length === 0 && <div style={s.muted}>No replies yet — start the discussion.</div>}
        {(t.replies ?? []).map((r: ForumReply) => {
          const mine = r.coach_id === coachId || isAdmin;
          const editing = editingReplyId === r.id;
          return (
            <div key={r.id} style={s.reply}>
              {editing ? (
                <div style={s.editWrap}>
                  <textarea
                    autoFocus style={s.textarea} rows={3}
                    value={editReplyText}
                    onChange={(e) => setEditReplyText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveReplyEdit(); } if (e.key === "Escape") setEditingReplyId(null); }}
                  />
                  <div style={s.rowEnd}>
                    <button style={s.ghostBtn} onClick={() => setEditingReplyId(null)}>Cancel</button>
                    <button style={s.primaryBtn} onClick={saveReplyEdit} disabled={!editReplyText.trim()}>Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={s.body}>{r.body}</div>
                  <div style={s.metaRow}>
                    <span>{r.coach?.name ?? "A coach"}{r.coach?.is_app_admin ? " · VIS BUILD Team" : ""} · {timeAgo(r.created_at)}{r.edited_at ? " · edited" : ""}</span>
                    {mine && <button style={s.metaBtn} onClick={() => { setEditingReplyId(r.id); setEditReplyText(r.body); }}>Edit</button>}
                    {mine && <button style={{ ...s.metaBtn, color: "#FF6B6B" }} onClick={() => removeReply(r.id)}>Delete</button>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Reply box ─────────────────────────────────────────────── */}
      <div style={s.replyBox}>
        <textarea
          style={s.textarea} rows={3}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitReply(); } }}
          placeholder="Write a reply…"
          disabled={sending}
        />
        <div style={s.rowEnd}>
          <button style={{ ...s.primaryBtn, opacity: !replyText.trim() || sending ? 0.5 : 1 }} disabled={!replyText.trim() || sending} onClick={submitReply}>
            {sending ? "Posting…" : "Reply"}
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  back: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 12 },
  muted: { color: "var(--mute)", fontSize: 13, padding: "16px 0" },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 },

  opCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 14 },
  opMain: { display: "flex", gap: 12 },
  voteBtn: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer", height: "fit-content", minWidth: 44 },
  voteBtnActive: { background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" },
  opTitleRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  pin: { fontSize: 11, fontWeight: 700, color: "var(--accent)" },
  opTitle: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, margin: 0, color: "var(--text)" },
  body: { fontSize: 14, color: "var(--text)", lineHeight: 1.55, marginTop: 8, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  jcCard: { display: "flex", flexDirection: "column", gap: 4, background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", marginTop: 8 },
  jcTag: { fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.04em" },
  jcRef: { fontSize: 12, color: "var(--mute)", wordBreak: "break-word" },
  jcRefLink: { fontSize: 12, color: "var(--accent)", wordBreak: "break-word", textDecoration: "none" },
  takeaways: { marginTop: 10, borderLeft: "3px solid var(--line)", paddingLeft: 10 },
  takeawaysLabel: { fontSize: 11, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.04em" },
  metaRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 10, fontSize: 11, color: "var(--mute)" },
  metaBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 11, fontWeight: 700, textDecoration: "underline", cursor: "pointer", padding: 0 },

  replyList: { display: "flex", flexDirection: "column", gap: 8 },
  reply: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px" },

  replyBox: { marginTop: 12, display: "flex", flexDirection: "column", gap: 8 },
  editWrap: { display: "flex", flexDirection: "column", gap: 8 },
  input: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 11px", fontSize: 13 },
  textarea: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", lineHeight: 1.5, resize: "vertical" as const },
  rowEnd: { display: "flex", justifyContent: "flex-end", gap: 8 },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  ghostBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
};
