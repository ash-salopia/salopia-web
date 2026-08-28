"use client";

// ─────────────────────────────────────────────────────────────────────────────
// DirectMessageThread
//
// Real-time 1:1 chat with a single athlete, structurally identical to
// GroupChat.tsx (same Realtime/optimistic-insert pattern) but keyed by
// athlete_id instead of group_id, against the direct_messages table
// (0077). One shared thread per athlete, visible to every coach in the
// org - any coach's browser client can read/write it, same as
// group_messages.
//
// Requires: direct_messages table from 0077_direct_messages.sql
//           + Realtime enabled for the table in Supabase dashboard
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import VoiceNoteRecorder from "@/components/VoiceNoteRecorder";
import VoiceNotePlayer from "@/components/VoiceNotePlayer";
import type { DirectMessage } from "@/types";

interface Props {
  athleteId: string;
  athleteName: string;
  coachId: string;
  coachName: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

async function uploadCoachAudio(blob: Blob): Promise<{ path: string }> {
  const form = new FormData();
  form.append("audio", blob, "voice-note.webm");
  const res = await fetch("/api/chat-audio", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not upload voice note");
  return data;
}

export default function DirectMessageThread({ athleteId, athleteName, coachId, coachName }: Props) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    let mounted = true;

    const loadMessages = async () => {
      const { data, error: err } = await supabase
        .from("direct_messages")
        .select("*")
        .eq("athlete_id", athleteId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (mounted) {
        if (err) setError("Could not load messages");
        else setMessages(data ?? []);
        setLoading(false);
      }
    };

    loadMessages();

    const channel = supabase
      .channel(`direct-messages-${athleteId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `athlete_id=eq.${athleteId}` },
        (payload) => {
          if (mounted) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === payload.new.id)) return prev;
              return [...prev, payload.new as DirectMessage];
            });
          }
        }
      )
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const insertMessage = async (patch: { body: string; audio_path: string | null; audio_duration_seconds: number | null }) => {
    setSending(true);
    const optimisticId = crypto.randomUUID();
    const optimistic: DirectMessage = {
      id: optimisticId,
      organisation_id: "",
      athlete_id: athleteId,
      sender_type: "coach",
      sender_id: coachId,
      sender_name: coachName,
      body: patch.body,
      audio_path: patch.audio_path,
      audio_duration_seconds: patch.audio_duration_seconds,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const { data, error: sendErr } = await supabase
        .from("direct_messages")
        .insert({
          athlete_id: athleteId,
          sender_type: "coach",
          sender_id: coachId,
          sender_name: coachName,
          ...patch,
        })
        .select()
        .single();
      if (sendErr) throw sendErr;
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? (data as DirectMessage) : m)));
      // Push is server-only code - this insert went straight through
      // the browser client (RLS), so a separate call triggers the
      // notification side effect. Fire-and-forget: a failed push
      // should never surface as a failed send.
      fetch("/api/direct-messages/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteId, text: patch.body }),
      }).catch(() => {});
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setError("Could not send message - please try again");
      throw new Error("send failed");
    } finally {
      setSending(false);
    }
  };

  const sendText = async () => {
    const body = input.trim();
    if (!body || sending) return;
    setInput("");
    try { await insertMessage({ body, audio_path: null, audio_duration_seconds: null }); }
    catch { setInput(body); }
  };

  const sendVoiceNote = async (audioPath: string, durationSeconds: number) => {
    await insertMessage({ body: "", audio_path: audioPath, audio_duration_seconds: Math.round(durationSeconds) });
  };

  if (loading) return <div style={s.loading}>Loading messages…</div>;

  return (
    <div style={s.container}>
      {error && (
        <div style={s.errorBox}>{error}
          <button style={s.errorClose} onClick={() => setError("")}>×</button>
        </div>
      )}

      <div style={s.messageList}>
        {messages.length === 0 && (
          <div style={s.empty}>No messages yet - start the conversation with {athleteName}.</div>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_id === coachId && msg.sender_type === "coach";
          return (
            <div key={msg.id} style={{ ...s.messageRow, justifyContent: isMe ? "flex-end" : "flex-start" }}>
              <div style={{ ...s.bubble, ...(isMe ? s.bubbleMe : s.bubbleThem) }}>
                {!isMe && <div style={s.senderName}>{msg.sender_name}</div>}
                {msg.audio_path ? (
                  <VoiceNotePlayer audioPath={msg.audio_path} durationSeconds={msg.audio_duration_seconds} isMe={isMe} />
                ) : (
                  <div style={s.body}>{msg.body}</div>
                )}
                <div style={s.time}>{formatTime(msg.created_at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={s.inputRow}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }}
          placeholder={`Message ${athleteName}…`}
          style={s.input}
          disabled={sending}
        />
        <VoiceNoteRecorder upload={uploadCoachAudio} onSend={sendVoiceNote} disabled={sending} />
        <button
          style={{ ...s.sendBtn, opacity: !input.trim() || sending ? 0.5 : 1 }}
          disabled={!input.trim() || sending}
          onClick={sendText}
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
