"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import CompetitionFeed, { type Competition } from "@/components/CompetitionFeed";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function AthleteCommunityPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [tab, setTab] = useState<"announcements" | "pbs" | "chat" | "comps">("announcements");
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [pbs, setPbs] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [athleteId, setAthleteId] = useState("");
  const [athleteName, setAthleteName] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load announcements + PBs on mount
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const safe = (p: Promise<Response>) =>
      p.then(r => r.json()).catch((e) => ({ _fetchError: e?.message ?? "fetch failed" }));
    Promise.all([
      safe(fetch(`/api/athlete-link/announcements?token=${token}`)),
      safe(fetch(`/api/athlete-link/pbs?token=${token}`)),
      safe(fetch(`/api/athlete-link/chat?token=${token}`)),
      safe(fetch(`/api/athlete-link/competitions?token=${token}`)),
    ])
      .then(([annData, pbData, chatData, compData]) => {
        if (compData?.competitions) setCompetitions(compData.competitions);
        const errors = [annData, pbData, chatData]
          .map((d: any) => d.error || d._fetchError)
          .filter(Boolean);
        if (errors.length === 3) {
          setError("Could not load community content: " + errors[0]);
        }
        setAnnouncements(annData.announcements ?? []);
        setPbs(pbData.pbs ?? []);
        setGroups(chatData.groups ?? []);
        setAthleteId(chatData.athleteId ?? "");
        setAthleteName(chatData.athleteName ?? "");
        if (chatData.groups?.length > 0) {
          setSelectedGroupId(chatData.groups[0].id);
          setMessages(chatData.messages ?? []);
        }
      })
      .catch((e) => setError("Could not load community content: " + (e?.message ?? "")))
      .finally(() => setLoading(false));
  }, [token]);

  // Poll for new messages when on chat tab
  useEffect(() => {
    if (tab !== "chat" || !selectedGroupId) {
      pollRef.current && clearInterval(pollRef.current);
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/athlete-link/chat?token=${token}&group_id=${selectedGroupId}`);
        const data = await res.json();
        if (data.messages) setMessages(data.messages);
      } catch {}
    };

    pollRef.current = setInterval(poll, 3000);
    return () => { pollRef.current && clearInterval(pollRef.current); };
  }, [tab, selectedGroupId, token]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load messages when group changes
  const loadGroup = async (groupId: string) => {
    setSelectedGroupId(groupId);
    setChatLoading(true);
    try {
      const res = await fetch(`/api/athlete-link/chat?token=${token}&group_id=${groupId}`);
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch {}
    finally { setChatLoading(false); }
  };

  const handleSend = async () => {
    const text = chatInput.trim();
    if (!text || !selectedGroupId || sending) return;

    setSending(true);
    setChatInput("");

    // Optimistic update
    const optimistic = {
      id: `optimistic-${Date.now()}`,
      group_id: selectedGroupId,
      sender_type: "athlete",
      sender_id: athleteId,
      sender_name: athleteName,
      body: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch("/api/athlete-link/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, group_id: selectedGroupId, message: text }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages((prev) =>
          prev.map((m) => m.id === optimistic.id ? data.message : m)
        );
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setChatInput(text);
    } finally {
      setSending(false);
    }
  };

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.brand}>SALOPIA</div>
        <button style={s.backBtn} onClick={() => router.push(`/a/${token}`)}>
          Back
        </button>
      </div>

      <div style={s.tabs}>
        <button style={{ ...s.tab, ...(tab === "announcements" ? s.tabActive : {}) }}
          onClick={() => setTab("announcements")}>
          Announcements ({announcements.length})
        </button>
        <button style={{ ...s.tab, ...(tab === "pbs" ? s.tabActive : {}) }}
          onClick={() => setTab("pbs")}>
          PB Feed ({pbs.length})
        </button>
        {groups.length > 0 && (
          <button style={{ ...s.tab, ...(tab === "chat" ? s.tabActive : {}) }}
            onClick={() => setTab("chat")}>
            Chat
          </button>
        )}
        <button style={{ ...s.tab, ...(tab === "comps" ? s.tabActive : {}) }}
          onClick={() => setTab("comps")}>
          🏆 Comps
        </button>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {loading ? (
        <div style={s.loading}>Loading...</div>
      ) : (
        <>
          {/* Announcements */}
          {tab === "announcements" && (
            <div style={s.content}>
              {announcements.length === 0 && <div style={s.empty}>No announcements yet.</div>}
              {announcements.map((ann) => (
                <div key={ann.id} style={{ ...s.annCard, ...(ann.pinned ? s.annPinned : {}) }}>
                  {ann.pinned && <div style={s.pinnedTag}>Pinned</div>}
                  <div style={s.annTitle}>{ann.title}</div>
                  <div style={s.annMeta}>
                    {ann.group ? `${ann.group.name}` : "Everyone"} · {timeAgo(ann.created_at)}
                  </div>
                  {ann.body && <div style={s.annBody}>{ann.body}</div>}
                </div>
              ))}
            </div>
          )}

          {/* PB Feed */}
          {tab === "pbs" && (
            <div style={s.content}>
              {pbs.length === 0 && (
                <div style={s.empty}>No personal bests yet. They appear here automatically when you or your teammates log new records.</div>
              )}
              {pbs.map((pb) => {
                const reactionGroups = (pb.reactions ?? []).reduce(
                  (acc: Record<string, number>, r: any) => { acc[r.emoji] = (acc[r.emoji] ?? 0) + 1; return acc; }, {} as Record<string, number>
                );
                return (
                  <div key={pb.id} style={s.pbCard}>
                    <div style={s.pbAthlete}>{pb.athlete?.name}</div>
                    <div style={s.pbExercise}>{pb.exercise_name}</div>
                    <div style={s.pbWeight}>
                      {pb.weight_kg ? `${pb.weight_kg}kg` : ""}
                      {pb.reps ? ` x ${pb.reps} reps` : ""}
                    </div>
                    <div style={s.pbDate}>{pb.date} · {timeAgo(pb.created_at)}</div>
                    {Object.keys(reactionGroups).length > 0 && (
                      <div style={s.reactions}>
                        {Object.entries(reactionGroups).map(([emoji, count]) => (
                          <span key={emoji} style={s.reactionChip}>{emoji} {count as number}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Chat */}
          {tab === "comps" && (
        <CompetitionFeed
          competitions={competitions}
          athleteId={athleteId}
          athleteName={athleteName}
          token={token as string}
          onUpdated={setCompetitions}
        />
      )}
      {tab === "chat" && (
            <div style={s.chatPage}>
              {/* Group selector if multiple groups */}
              {groups.length > 1 && (
                <div style={s.groupPicker}>
                  {groups.map((g: any) => (
                    <button
                      key={g.id}
                      style={{
                        ...s.groupBtn,
                        borderColor: selectedGroupId === g.id ? g.colour : undefined,
                        color: selectedGroupId === g.id ? g.colour : undefined,
                        fontWeight: selectedGroupId === g.id ? 700 : 600,
                      }}
                      onClick={() => loadGroup(g.id)}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: g.colour, display: "inline-block", marginRight: 6 }} />
                      {g.name}
                    </button>
                  ))}
                </div>
              )}

              {groups.length === 0 ? (
                <div style={{ ...s.content, paddingTop: 24 }}>
                  <div style={s.empty}>You are not in any groups yet. Your coach will add you to a group.</div>
                </div>
              ) : (
                <>
                  {selectedGroup && (
                    <div style={s.chatGroupLabel}>{selectedGroup.name}</div>
                  )}

                  {/* Messages */}
                  <div style={s.messageList}>
                    {chatLoading ? (
                      <div style={s.loading}>Loading messages...</div>
                    ) : messages.length === 0 ? (
                      <div style={s.empty}>No messages yet. Say hello!</div>
                    ) : (
                      messages.map((msg) => {
                        const isMe = msg.sender_id === athleteId && msg.sender_type === "athlete";
                        return (
                          <div key={msg.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", marginBottom: 8 }}>
                            <div style={{ maxWidth: "75%" }}>
                              {!isMe && (
                                <div style={s.senderName}>{msg.sender_name}</div>
                              )}
                              <div style={{ ...s.bubble, ...(isMe ? s.bubbleMe : s.bubbleThem) }}>
                                {msg.body}
                              </div>
                              <div style={{ ...s.msgTime, textAlign: isMe ? "right" : "left" }}>
                                {formatTime(msg.created_at)}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={bottomRef} />
                  </div>

                  {/* Input */}
                  <div style={s.inputRow}>
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                      placeholder={`Message ${selectedGroup?.name ?? "group"}...`}
                      style={s.chatInput}
                      disabled={sending}
                    />
                    <button
                      style={{ ...s.sendBtn, opacity: !chatInput.trim() || sending ? 0.5 : 1 }}
                      disabled={!chatInput.trim() || sending}
                      onClick={handleSend}
                    >
                      {sending ? "..." : "Send"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" },
  header: { height: 56, background: "var(--ink)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0 },
  brand: { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: 2, color: "var(--accent)" },
  backBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" },
  tabs: { display: "flex", borderBottom: "1px solid var(--line)", padding: "0 16px" },
  tab: { background: "transparent", border: "none", borderBottom: "2px solid transparent", color: "var(--mute)", padding: "14px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: -1 },
  tabActive: { color: "var(--text)", borderBottomColor: "var(--accent)" },
  loading: { fontSize: 14, color: "var(--mute)", padding: "24px 16px" },
  errorBox: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "10px 16px", fontSize: 13, margin: "12px 16px" },
  content: { padding: 16, display: "flex", flexDirection: "column", gap: 10 },
  empty: { fontSize: 14, color: "var(--mute)", fontStyle: "italic", padding: "12px 0" },
  annCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14 },
  annPinned: { borderColor: "var(--accent)", background: "var(--accent-dim)" },
  pinnedTag: { fontSize: 11, color: "var(--accent)", fontWeight: 700, marginBottom: 6 },
  annTitle: { fontSize: 16, fontWeight: 700, color: "var(--text)" },
  annMeta: { fontSize: 12, color: "var(--mute)", marginTop: 4 },
  annBody: { fontSize: 14, color: "var(--mute)", marginTop: 8, lineHeight: 1.6 },
  pbCard: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14 },
  pbAthlete: { fontSize: 12, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  pbExercise: { fontSize: 15, fontWeight: 700, color: "var(--accent)", marginTop: 4 },
  pbWeight: { fontSize: 22, fontWeight: 700, color: "var(--text)", marginTop: 4 },
  pbDate: { fontSize: 11, color: "var(--mute)", marginTop: 4 },
  reactions: { display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" as const },
  reactionChip: { background: "var(--ink)", borderRadius: 6, padding: "2px 8px", fontSize: 13 },
  chatPage: { display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" },
  groupPicker: { display: "flex", gap: 8, padding: "10px 16px", flexWrap: "wrap" as const, borderBottom: "1px solid var(--line)" },
  groupBtn: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center" },
  chatGroupLabel: { fontSize: 12, fontWeight: 700, color: "var(--mute)", padding: "8px 16px 4px", textTransform: "uppercase" as const, letterSpacing: "0.06em" },
  messageList: { flex: 1, overflowY: "auto", padding: "12px 16px", minHeight: 300, maxHeight: "calc(100vh - 280px)" },
  senderName: { fontSize: 11, fontWeight: 700, color: "var(--mute)", marginBottom: 3, textTransform: "uppercase" as const, letterSpacing: "0.04em" },
  bubble: { borderRadius: 12, padding: "9px 12px", fontSize: 14, lineHeight: 1.4, wordBreak: "break-word" as const },
  bubbleMe: { background: "var(--accent)", color: "#0a1420", borderBottomRightRadius: 4 },
  bubbleThem: { background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderBottomLeftRadius: 4 },
  msgTime: { fontSize: 10, color: "var(--mute)", marginTop: 3, opacity: 0.7 },
  inputRow: { display: "flex", gap: 8, padding: "10px 16px", borderTop: "1px solid var(--line)", background: "var(--ink)" },
  chatInput: { flex: 1, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "10px 12px", fontSize: 14 },
  sendBtn: { background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
};
