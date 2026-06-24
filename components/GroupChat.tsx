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

interface Message {
  id: string;
  group_id: string;
  sender_type: "coach" | "athlete";
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
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

  const sendMessage = async () => {
    const body = input.trim();
    if (!body || sending) return;

    setSending(true);
    setInput("");

    // Optimistic insert
    const optimisticId = crypto.randomUUID();
    const optimistic: Message = {
      id: optimisticId,
      group_id: groupId,
      sender_type: "coach",
      sender_id: coachId,
      sender_name: coachName,
      body,
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
          body,
        })
        .select()
        .single();

      if (sendErr) throw sendErr;

      // Replace optimistic with real
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? (data as Message) : m))
      );
    } catch {
      // Remove optimistic on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInput(body); // restore input
      setError("Could not send message — please try again");
    } finally {
      setSending(false);
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
            No messages yet — start the conversation with your {groupName} group.
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_id === coachId && msg.sender_type === "coach";
          return (
            <div key={msg.id} style={{ ...s.messageRow, justifyContent: isMe ? "flex-end" : "flex-start" }}>
              <div style={{ ...s.bubble, ...(isMe ? s.bubbleMe : s.bubbleThem) }}>
                {!isMe && (
                  <div style={s.senderName}>{msg.sender_name}</div>
                )}
                <div style={s.body}>{msg.body}</div>
                <div style={s.time}>{formatTime(msg.created_at)}</div>
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
  time: { fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: "right" as const },
  inputRow: { display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid var(--line)", background: "var(--ink)" },
  input: { flex: 1, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 10, padding: "10px 12px", fontSize: 14 },
  sendBtn: { width: 40, height: 40, background: "var(--accent)", color: "#0a1420", border: "none", borderRadius: 10, fontSize: 18, fontWeight: 700, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
};
