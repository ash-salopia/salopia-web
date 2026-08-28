"use client";

// Plays back a voice note stored at `audioPath` in the chat-audio
// bucket - fetches a fresh signed URL on mount rather than relying on
// a URL captured at send-time, since signed URLs expire and a message
// might be viewed well after that (same reasoning as the documents
// signed-url pattern this mirrors). `token` is only needed on the
// athlete side (no auth session to identify the caller otherwise).

import { useEffect, useState } from "react";

interface Props {
  audioPath: string;
  durationSeconds: number | null;
  token?: string;
  isMe?: boolean;
}

function formatDuration(s: number | null): string {
  if (!s || s < 0) return "";
  return `${Math.floor(s / 60)}:${(Math.floor(s) % 60).toString().padStart(2, "0")}`;
}

export default function VoiceNotePlayer({ audioPath, durationSeconds, token, isMe }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    const params = new URLSearchParams({ path: audioPath });
    if (token) params.set("token", token);
    fetch(`/api/chat-audio/signed-url?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => { if (mounted) { if (data.url) setUrl(data.url); else setError(true); } })
      .catch(() => { if (mounted) setError(true); });
    return () => { mounted = false; };
  }, [audioPath, token]);

  if (error) {
    return <div style={{ ...s.wrap, color: isMe ? "#0a1420cc" : "var(--mute)" }}>🎤 Voice note unavailable</div>;
  }

  return (
    <div style={s.wrap}>
      <span style={{ fontSize: 16 }}>🎤</span>
      {url ? (
        <audio controls src={url} style={s.audio} />
      ) : (
        <span style={{ fontSize: 12, opacity: 0.7 }}>Loading…</span>
      )}
      {durationSeconds != null && <span style={{ fontSize: 11, opacity: 0.7 }}>{formatDuration(durationSeconds)}</span>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", alignItems: "center", gap: 8 },
  audio: { height: 32, maxWidth: 220 },
};
