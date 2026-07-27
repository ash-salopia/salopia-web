"use client";

import { useState, useRef } from "react";
import { updateCoachAvatar } from "@/lib/data/avatars";
import Avatar from "@/components/Avatar";

interface Props {
  coachId: string;
  coachName: string;
  avatarUrl: string | null;
  onUpdated: (avatarUrl: string) => void;
}

export default function CoachProfileSettings({ coachId, coachName, avatarUrl, onUpdated }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setError("");
    setUploading(true);
    try {
      const url = await updateCoachAvatar(file);
      onUpdated(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.title}>👤 Your profile</div>
      {error && <div style={s.error}>{error}</div>}
      <div style={s.row}>
        <Avatar name={coachName} avatarUrl={avatarUrl} size={64} />
        <div>
          <div style={s.name}>{coachName || "Coach"}</div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
          />
          <button style={s.uploadBtn} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { marginBottom: 32, borderBottom: "1px solid var(--line)", paddingBottom: 24 },
  title: { fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 14 },
  error: { background: "#2a0c0c", color: "#FF6B6B", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 },
  row: { display: "flex", alignItems: "center", gap: 16 },
  name: { fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 8 },
  uploadBtn: { background: "var(--ink)", border: "1px dashed var(--line)", color: "var(--mute)", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" },
};
