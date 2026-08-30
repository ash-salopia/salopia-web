"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GroupChat
//
// Real-time chat for a group using Supabase Realtime (postgres_changes).
// Coaches send messages immediately. Renders into the Community page's
// Chat tab when a group is selected.
//
// Requires: group_messages table from 0011_group_chat.sql migration
//           + Realtime enabled for the table in Supabase dashboard
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import VoiceNoteRecorder from "@/components/VoiceNoteRecorder";
import VoiceNotePlayer from "@/components/VoiceNotePlayer";

interface Message {
  id: string;
  group_id: string;
  sender_type: "coach" | "athlete";
  sender_id: string;
  sender_name: string;
  body: string;
  audio_path?: string | null;
  audio_duration_seconds?: number | null;
  created_at: string;
  edited_at?: string | null;
}

async function uploadCoachAudio(blob: Blob): Promise<{ path: string }> {
  const form = new FormData();
  form.append("audio", blob, "voice-note.webm");
  const res = await fetch("/api/chat-audio", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not upload voice note");
  return data;
}

interface Props {
  groupId: string;
  groupName: string;
  coachId: string;
  coachName: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function GroupChat({ groupId, groupName, coachId, coachName }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Load initial messages and subscribe to new ones
  useEffect(() => {
    let mounted = true;

    const loadMessages = async () => {
      const { data, error: err } = await supabase
        .from("group_messages")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true })
        .limit(100);

      if (mounted) {
        if (err) setError("Could not load messages");
        else setMessages(data ?? []);
        setLoading(false);
      }
    };

    loadMessages();

    // Subscribe to new messages via Realtime
    const channel = supabase
      .channel(`group-chat-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          if (mounted) {
            setMessages((prev) => {
              // Avoid duplicates (our own optimistic message)
              if (prev.some((m) => m.id === payload.new.id)) return prev;
              return [...prev, payload.new as Message];
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` },
        (payload) => {
          if (mounted) {
            setMessages((prev) =>
              prev.map((m) => (m.id === payload.new.id ? { ...m, ...(payload.new as Message) } : m))
            );
          }
        }
      )
      .on(
        // DELETE carries only the primary key under the default replica
        // identity, so no group filter — match by id against local state.
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "group_messages" },
        (payload) => {
          if (mounted) {
            const goneId = (payload.old as { id?: string }).id;
            if (goneId) setMessages((prev) => prev.filter((m) => m.id !== goneId));
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const insertMessage = async (patch: { body: string; audio_path: string | null; audio_duration_seconds: number | null }) => {
    setSending(true);
    const optimisticId = crypto.randomUUID();
    const optimistic: Message = {
      id: optimisticId,
      group_id: groupId,
      sender_type: "coach",
      sender_id: coachId,
      sender_name: coachName,
      ...patch,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const { data, error: sendErr } = await supabase
        .from("group_messages")
        .insert({
          group_id: groupId,
          sender_type: "coach",
          sender_id: coachId,
          sender_name: coachName,
          ...patch,
        })
        .select()
        .single();

      if (sendErr) throw sendErr;
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? (data as Message) : m)));
      // Push is server-only code - this insert went straight through
      // the browser client (RLS), so a separate call notifies the
      // group's athletes. Fire-and-forget: a failed push should never
      // surface as a failed send.
      fetch("/api/group-messages/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, groupName, text: patch.body }),
      }).catch(() => {});
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setError("Could not send message - please try again");
      throw new Error("send failed");
    } finally {
      setSending(false);
    }
  };

  const sendMessage = async () => {
    const body = input.trim();
    if (!body || sending) return;
    setInput("");
    try { await insertMessage({ body, audio_path: null, audio_duration_seconds: null }); }
    catch { setInput(body); }
  };

  const sendVoiceNote = async (audioPath: string, durationSeconds: number) => {
    await insertMessage({ body: "", audio_path: audioPath, audio_duration_seconds: Math.round(durationSeconds) });
  };

  const startEdit = (msg: Message) => {
    setEditingId(msg.id);
    setEditText(msg.body);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const id = editingId;
    const body = editText.trim();
    if (!body) return;
    const before = messages.find((m) => m.id === id);
    if (!before || body === before.body) { setEditingId(null); return; }
    const editedAt = new Date().toISOString();
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, body, edited_at: editedAt } : m)));
    setEditingId(null);
    let { error: err } = await supabase
      .from("group_messages")
      .update({ body, edited_at: editedAt })
      .eq("id", id);
    if (err) {
      // The edited_at column may not exist yet (migration 0083) or the
      // PostgREST schema cache may be stale — fall back to a plain body
      // edit so the feature still works without the "edited" marker.
      ({ error: err } = await supabase.from("group_messages").update({ body }).eq("id", id));
      if (!err) {
        setMessages((prev) => prev.map((m) => (m.id === id && before ? { ...m, edited_at: before.edited_at ?? null } : m)));
      }
    }
    if (err) {
      setMessages((prev) => prev.map((m) => (m.id === id ? (before as Message) : m)));
      setError("Could not edit message - please try again");
    }
  };

  const deleteMessage = async (id: string) => {
    if (!confirm("Delete this message? It will be removed for everyone.")) return;
    const before = messages;
    setMessages((prev) => prev.filter((m) => m.id !== id));
    const { error: err } = await supabase.from("group_messages").delete().eq("id", id);
    if (err) {
      setMessages(before);
      setError("Could not delete message - please try again");
    }
  };

  if (loading) return <div style={s.loading}>Loading messages…</div>;

  return (
    <div style={s.container}>
      {error && (
        <div style={s.errorBox}>{error}
          <button style={s.errorClose} onClick={() => setError("")}>×</button>
        </div>
      )}

      {/* Message list */}
      <div style={s.messageList}>
        {messages.length === 0 && (
          <div style={s.empty}>
            No messages yet - start the conversation with your {groupName} group.
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_id === coachId && msg.sender_type === "coach";
          const editing = editingId === msg.id;
          return (
            <div key={msg.id} style={{ ...s.messageRow, justifyContent: isMe ? "flex-end" : "flex-start" }}>
              <div style={{ ...s.bubble, ...(isMe ? s.bubbleMe : s.bubbleThem) }}>
                {!isMe && (
                  <div style={s.senderName}>{msg.sender_name}</div>
                )}
                {editing ? (
                  <div style={s.editWrap}>
                    <textarea
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      style={s.editInput}
                      rows={2}
                    />
                    <div style={s.editActions}>
                      <button style={s.editCancel} onClick={() => setEditingId(null)}>Cancel</button>
                      <button style={s.editSave} onClick={saveEdit} disabled={!editText.trim()}>Save</button>
                    </div>
                  </div>
                ) : msg.audio_path ? (
                  <VoiceNotePlayer audioPath={msg.audio_path} durationSeconds={msg.audio_duration_seconds ?? null} isMe={isMe} />
                ) : (
                  <div style={s.body}>{msg.body}</div>
                )}
                {!editing && (
                  <div style={{ ...s.metaRow, ...(isMe ? s.metaRowMe : {}) }}>
                    <span style={s.time}>
                      {formatTime(msg.created_at)}{msg.edited_at ? " · edited" : ""}
                    </span>
                    {isMe && (
                      <span style={s.msgActions}>
                        {!msg.audio_path && (
                          <button style={s.msgActionBtn} onClick={() => startEdit(msg)}>Edit</button>
                        )}
                        <button style={s.msgActionBtn} onClick={() => deleteMessage(msg.id)}>Delete</button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={s.inputRow}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder={`Message ${groupName}…`}
          style={s.input}
          disabled={sending}
        />
        <VoiceNoteRecorder upload={uploadCoachAudio} onSend={sendVoiceNote} disabled={sending} />
        <button
          style={{ ...s.sendBtn, opacity: !input.trim() || sending ? 0.5 : 1 }}
          disabled={!input.trim() || sending}
          onClick={sendMessage}
        >
          ↑
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", height: 480, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" },
  loading: { fontSize: 14, color: "var(--mute)", padding: 20, textAlign: "center" },
  errorBox: { background: "#2a0c0c", color: "#FF6B6B", fontSize: 13, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  errorClose: { background: "transparent", border: "none", color: "#FF6B6B", cursor: "pointer", fontSize: 16, padding: 0 },
  messageList: { flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 },
  empty: { fontSize: 13, color: "var(--mute)", fontStyle: "italic", textAlign: "center", marginTop: 20 },
  messageRow: { display: "flex" },
  bubble: { maxWidth: "75%", borderRadius: 12, padding: "8px 12px" },
  bubbleMe: { background: "var(--accent)", color: "#0a1420", borderBottomRightRadius: 4 },
  bubbleThem: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderBottomLeftRadius: 4 },
  senderName: { fontSize: 10, fontWeight: 700, opacity: 0.7, marginBottom: 3, textTransform: "uppercase" as const, letterSpacing: "0.04em" },
  body: { fontSize: 14, lineHeight: 1.4, wordBreak: "break-word" as const },
  metaRow: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 4 },
  metaRowMe: { justifyContent: "space-between" },
  time: { fontSize: 10, opacity: 0.6 },
  msgActions: { display: "flex", gap: 8 },
  msgActionBtn: { background: "transparent", border: "none", padding: 0, fontSize: 10, fontWeight: 700, color: "inherit", opacity: 0.75, textDecoration: "underline", cursor: "pointer" },
  editWrap: { display: "flex", flexDirection: "column", gap: 6, minWidth: 220 },
  editInput: { width: "100%", boxSizing: "border-box", background: "var(--panel)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px", fontSize: 14, fontFamily: "inherit", lineHeight: 1.4, resize: "vertical" as const },
  editActions: { display: "flex", gap: 6, justifyContent: "flex-end" },
  editCancel: { background: "transparent", border: "1px solid var(--line)", color: "var(--mute)", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" },
  editSave: { background: "var(--ink)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" },
  inputRow: { display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid var(--line)", background: "var(--ink)" },
  input: { flex: 1, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "10px 12px", fontSize: 14 },
  sendBtn: { width: 40, height: 40, background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, fontSize: 18, fontWeight: 700, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
};
