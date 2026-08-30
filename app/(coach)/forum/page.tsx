"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import {
  listRooms, listThreads, createThread, createRoom, updateRoom, reorderRooms,
  JC_SOURCE_LABEL,
  type ForumRoom, type ForumThread, type ForumSort, type JcSourceType,
} from "@/lib/data/forum";
import FeatureRequestsRoom from "@/components/forum/FeatureRequestsRoom";
import ThreadView from "@/components/forum/ThreadView";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const SORTS: { key: ForumSort; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "top", label: "Top" },
  { key: "new", label: "New" },
];

export default function ForumPage() {
  const router = useRouter();
  const params = useSearchParams();
  const roomSlug = params.get("room");
  const threadId = params.get("thread");

  const [rooms, setRooms] = useState<ForumRoom[]>([]);
  const [coachId, setCoachId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(true);

  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [sort, setSort] = useState<ForumSort>("active");
  const [error, setError] = useState("");

  // new-thread composer
  const [composerOpen, setComposerOpen] = useState(false);
  const [nTitle, setNTitle] = useState("");
  const [nBody, setNBody] = useState("");
  const [nSrc, setNSrc] = useState<JcSourceType | "">("");
  const [nRef, setNRef] = useState("");
  const [nTake, setNTake] = useState("");
  const [posting, setPosting] = useState(false);

  // admin room editor
  const [roomEditor, setRoomEditor] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");

  const room = useMemo(() => rooms.find((r) => r.slug === roomSlug) ?? null, [rooms, roomSlug]);

  const setUrl = useCallback((next: { room?: string | null; thread?: string | null }) => {
    const sp = new URLSearchParams(params.toString());
    if (next.room !== undefined) { next.room ? sp.set("room", next.room) : sp.delete("room"); }
    if (next.thread !== undefined) { next.thread ? sp.set("thread", next.thread) : sp.delete("thread"); }
    router.replace(`/forum${sp.toString() ? `?${sp}` : ""}`);
  }, [params, router]);

  // rooms + identity
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: auth }) => {
      const uid = auth.user?.id;
      if (!uid) return;
      supabase.from("coaches").select("id, is_app_admin").eq("id", uid).single().then(({ data }) => {
        if (data) { setCoachId(data.id); setIsAdmin(!!(data as any).is_app_admin); }
      });
    });
    listRooms()
      .then((r) => {
        setRooms(r);
        if (!roomSlug && r.length) setUrl({ room: r[0].slug });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the forum"))
      .finally(() => setLoadingRooms(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadThreads = useCallback(async () => {
    if (!room || room.kind === "feature_requests") return;
    setLoadingThreads(true);
    try {
      setThreads(await listThreads(room.id, sort));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load threads");
    } finally {
      setLoadingThreads(false);
    }
  }, [room, sort]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  const submitThread = async () => {
    if (!room || !nTitle.trim() || posting) return;
    setPosting(true);
    try {
      const created = await createThread(room.id, {
        title: nTitle, body: nBody,
        jcSourceType: room.kind === "journal_club" ? (nSrc || null) as JcSourceType | null : undefined,
        jcReference: room.kind === "journal_club" ? nRef : undefined,
        jcTakeaways: room.kind === "journal_club" ? nTake : undefined,
      });
      setComposerOpen(false);
      setNTitle(""); setNBody(""); setNSrc(""); setNRef(""); setNTake("");
      setThreads((prev) => [created, ...prev]);
      setUrl({ thread: created.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post");
    } finally {
      setPosting(false);
    }
  };

  const addRoom = async () => {
    const name = newRoomName.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    try {
      const r = await createRoom({ name, slug, sort_order: rooms.length });
      setRooms((prev) => [...prev, r]);
      setNewRoomName("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create room"); }
  };
  const renameRoom = async (r: ForumRoom) => {
    const name = prompt("Room name", r.name)?.trim();
    if (!name || name === r.name) return;
    try { await updateRoom(r.id, { name }); setRooms((p) => p.map((x) => x.id === r.id ? { ...x, name } : x)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not rename"); }
  };
  const moveRoom = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rooms.length) return;
    const next = rooms.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setRooms(next);
    try { await reorderRooms(next.map((r) => r.id)); } catch { setRooms(rooms); }
  };

  if (loadingRooms) return <div style={st.page}><div style={st.muted}>Loading…</div></div>;

  return (
    <div style={st.page}>
      <h1 style={st.title}>Coach Forum</h1>
      <p style={st.sub}>Talk shop with every coach on VIS BUILD — programming, rehab, testing, business and more.</p>

      {error && <div style={st.errorBox}>{error} <button style={st.x} onClick={() => setError("")}>×</button></div>}

      <div style={st.layout}>
        {/* ── Rooms rail ─────────────────────────────────────────── */}
        <nav style={st.rail}>
          {rooms.map((r, i) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                style={{ ...st.railItem, ...(r.slug === roomSlug ? st.railItemActive : {}) }}
                onClick={() => { setUrl({ room: r.slug, thread: null }); setComposerOpen(false); }}
              >
                <span style={{ marginRight: 8 }}>{r.icon}</span>{r.name}
              </button>
              {isAdmin && roomEditor && (
                <span style={{ display: "flex" }}>
                  <button style={st.tinyBtn} onClick={() => moveRoom(i, -1)}>▲</button>
                  <button style={st.tinyBtn} onClick={() => moveRoom(i, 1)}>▼</button>
                  <button style={st.tinyBtn} onClick={() => renameRoom(r)}>✎</button>
                </span>
              )}
            </div>
          ))}
          {isAdmin && (
            <>
              <button style={st.railManage} onClick={() => setRoomEditor((v) => !v)}>
                {roomEditor ? "Done" : "Manage rooms"}
              </button>
              {roomEditor && (
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  <input style={st.roomInput} value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="New room name" />
                  <button style={st.tinyBtn} onClick={addRoom}>＋</button>
                </div>
              )}
            </>
          )}
        </nav>

        {/* ── Content ────────────────────────────────────────────── */}
        <div style={st.content}>
          {!room ? (
            <div style={st.muted}>Pick a room.</div>
          ) : (
            <>
              <div style={st.roomHead}>
                <h2 style={st.roomName}>{room.icon} {room.name}</h2>
                <p style={st.roomDesc}>{room.description}</p>
              </div>

              {room.kind === "feature_requests" ? (
                <FeatureRequestsRoom />
              ) : threadId ? (
                <ThreadView
                  threadId={threadId}
                  coachId={coachId}
                  isAdmin={isAdmin}
                  roomKind={room.kind}
                  onBack={() => setUrl({ thread: null })}
                  onChanged={loadThreads}
                />
              ) : (
                <>
                  <div style={st.toolbar}>
                    <div style={st.sortRow}>
                      {SORTS.map((sortOpt) => (
                        <button
                          key={sortOpt.key}
                          style={{ ...st.sortBtn, ...(sort === sortOpt.key ? st.sortBtnActive : {}) }}
                          onClick={() => setSort(sortOpt.key)}
                        >
                          {sortOpt.label}
                        </button>
                      ))}
                    </div>
                    <button style={st.primaryBtn} onClick={() => setComposerOpen((v) => !v)}>
                      {composerOpen ? "Cancel" : room.kind === "journal_club" ? "+ Post a summary" : "+ New thread"}
                    </button>
                  </div>

                  {composerOpen && (
                    <div style={st.composer}>
                      <input style={st.input} autoFocus value={nTitle} onChange={(e) => setNTitle(e.target.value)}
                        placeholder={room.kind === "journal_club" ? "Title — e.g. paper / chapter / talk title" : "Thread title"} />
                      {room.kind === "journal_club" && (
                        <>
                          <select style={st.input} value={nSrc} onChange={(e) => setNSrc(e.target.value as JcSourceType | "")}>
                            <option value="">Source type…</option>
                            {Object.entries(JC_SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <input style={st.input} value={nRef} onChange={(e) => setNRef(e.target.value)} placeholder="Reference / DOI / link (optional)" />
                        </>
                      )}
                      <textarea style={st.textarea} rows={5} value={nBody} onChange={(e) => setNBody(e.target.value)}
                        placeholder={room.kind === "journal_club" ? "Summary" : "What's on your mind?"} />
                      {room.kind === "journal_club" && (
                        <textarea style={st.textarea} rows={3} value={nTake} onChange={(e) => setNTake(e.target.value)}
                          placeholder="Key takeaways (optional)" />
                      )}
                      <div style={st.rowEnd}>
                        <button style={{ ...st.primaryBtn, opacity: !nTitle.trim() || posting ? 0.5 : 1 }}
                          disabled={!nTitle.trim() || posting} onClick={submitThread}>
                          {posting ? "Posting…" : "Post"}
                        </button>
                      </div>
                    </div>
                  )}

                  {loadingThreads ? (
                    <div style={st.muted}>Loading…</div>
                  ) : threads.length === 0 ? (
                    <div style={st.muted}>No threads here yet — start one.</div>
                  ) : (
                    <div style={st.threadList}>
                      {threads.map((t) => (
                        <button key={t.id} style={st.threadRow} onClick={() => setUrl({ thread: t.id })}>
                          <div style={st.threadTop}>
                            {t.pinned && <span style={st.pin}>📌</span>}
                            {t.jc_source_type && <span style={st.jcChip}>{JC_SOURCE_LABEL[t.jc_source_type]}</span>}
                            <span style={st.threadTitle}>{t.title}</span>
                          </div>
                          <div style={st.threadMeta}>
                            <span>{t.coach?.name ?? "A coach"} · {timeAgo(t.last_activity_at)}</span>
                            <span>▲ {t.votes.length}</span>
                            <span>💬 {t.replyCount}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1000 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, margin: 0 },
  sub: { fontSize: 13, color: "var(--mute)", margin: "4px 0 18px", maxWidth: 560 },
  muted: { color: "var(--mute)", fontSize: 14, padding: "24px 0", textAlign: "center" as const },
  errorBox: { background: "#2a0c0c", border: "1px solid #FF6B6B44", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12, display: "flex", justifyContent: "space-between" },
  x: { background: "transparent", border: "none", color: "#FF6B6B", cursor: "pointer", fontSize: 15 },

  layout: { display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap" },
  rail: { display: "flex", flexDirection: "column", gap: 3, width: 210, flexShrink: 0, position: "sticky", top: 0 },
  railItem: { flex: 1, display: "flex", alignItems: "center", textAlign: "left", padding: "9px 11px", borderRadius: 9, background: "transparent", border: "1px solid transparent", color: "var(--mute)", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  railItemActive: { background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" },
  railManage: { marginTop: 8, background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" },
  tinyBtn: { background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 4, fontSize: 10, padding: "2px 5px", cursor: "pointer" },
  roomInput: { flex: 1, minWidth: 0, background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "5px 8px", fontSize: 12 },

  content: { flex: 1, minWidth: 300 },
  roomHead: { marginBottom: 14 },
  roomName: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, margin: 0 },
  roomDesc: { fontSize: 12.5, color: "var(--mute)", margin: "2px 0 0" },

  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 },
  sortRow: { display: "flex", gap: 6 },
  sortBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  sortBtnActive: { background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" },
  primaryBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 },

  composer: { display: "flex", flexDirection: "column", gap: 10, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 18 },
  input: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 14 },
  textarea: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", lineHeight: 1.5, resize: "vertical" as const },
  rowEnd: { display: "flex", justifyContent: "flex-end", gap: 8 },

  threadList: { display: "flex", flexDirection: "column", gap: 8 },
  threadRow: { display: "block", width: "100%", textAlign: "left", cursor: "pointer", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 14px" },
  threadTop: { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" },
  pin: { fontSize: 11 },
  jcChip: { fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "var(--accent-dim)", borderRadius: 5, padding: "1px 6px", textTransform: "uppercase" as const, letterSpacing: "0.03em" },
  threadTitle: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  threadMeta: { display: "flex", gap: 14, marginTop: 6, fontSize: 11.5, color: "var(--mute)" },
};
