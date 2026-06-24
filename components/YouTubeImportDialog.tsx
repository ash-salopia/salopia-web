"use client";

import { useState } from "react";
import { saveLibraryEntry } from "@/lib/data/library";

interface VideoResult {
  title: string;
  videoId: string;
  videoUrl: string;
}

export default function YouTubeImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const [step, setStep] = useState<"input" | "review" | "importing">("input");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importProgress, setImportProgress] = useState(0);

  const handleFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistUrl.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/youtube-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistUrl: playlistUrl.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not fetch that playlist");
      setVideos(body.videos);
      setSelected(new Set(body.videos.map((v: VideoResult) => v.videoId)));
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch that playlist");
    } finally {
      setLoading(false);
    }
  };

  const toggleVideo = (videoId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === videos.length ? new Set() : new Set(videos.map((v) => v.videoId))
    );
  };

  const handleImport = async () => {
    const toImport = videos.filter((v) => selected.has(v.videoId));
    if (!toImport.length) return;
    setStep("importing");
    setImportProgress(0);
    setError("");

    let count = 0;
    for (const video of toImport) {
      try {
        // Imported one at a time (not Promise.all) so importProgress
        // updates smoothly and a single failed row doesn't abort the
        // whole batch — a coach with 180 videos would rather see "178
        // imported, 2 failed" than lose all 180 because one had a
        // weird character in its title.
        await saveLibraryEntry({
          name: video.title,
          video_url: video.videoUrl,
          types: [],
          tempo: "2-0-2",
        });
        count++;
      } catch {
        // Skip and continue — see comment above.
      }
      setImportProgress(count);
    }

    onImported(count);
  };

  return (
    <div style={styles.overlay} onClick={step !== "importing" ? onClose : undefined}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.headerRow}>
          <div style={styles.title}>Import from YouTube playlist</div>
          {step !== "importing" && (
            <button style={styles.closeBtn} onClick={onClose}>
              ×
            </button>
          )}
        </div>

        {step === "input" && (
          <form onSubmit={handleFetch}>
            <p style={styles.helpText}>
              Paste the link to a public or unlisted YouTube playlist. Every video&apos;s title
              and link will be pulled in — you can review and pick which ones to add before
              anything is saved. You&apos;ll set sets/reps/load for each afterward in the library.
            </p>
            <input
              autoFocus
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
              placeholder="https://www.youtube.com/playlist?list=..."
              style={styles.input}
            />
            {error && <div style={styles.errorBox}>{error}</div>}
            <button type="submit" disabled={loading} style={styles.primaryBtn}>
              {loading ? "Fetching videos…" : "Fetch playlist"}
            </button>
          </form>
        )}

        {step === "review" && (
          <>
            <div style={styles.reviewHeader}>
              <span style={styles.helpText}>
                Found {videos.length} video{videos.length !== 1 ? "s" : ""}. {selected.size} selected.
              </span>
              <button style={styles.linkBtn} onClick={toggleAll}>
                {selected.size === videos.length ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div style={styles.videoList}>
              {videos.map((v) => (
                <label key={v.videoId} style={styles.videoRow}>
                  <input
                    type="checkbox"
                    checked={selected.has(v.videoId)}
                    onChange={() => toggleVideo(v.videoId)}
                  />
                  <span style={styles.videoTitle}>{v.title}</span>
                </label>
              ))}
            </div>
            {error && <div style={styles.errorBox}>{error}</div>}
            <button
              disabled={!selected.size}
              style={{ ...styles.primaryBtn, opacity: selected.size ? 1 : 0.5 }}
              onClick={handleImport}
            >
              Add {selected.size} exercise{selected.size !== 1 ? "s" : ""} to library
            </button>
          </>
        )}

        {step === "importing" && (
          <div style={styles.importingBox}>
            <div style={styles.helpText}>
              Importing… {importProgress} of {selected.size}
            </div>
            <div style={styles.progressBarBg}>
              <div
                style={{
                  ...styles.progressBarFill,
                  width: `${(importProgress / selected.size) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(6,9,12,.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 60,
    padding: 16,
  },
  modal: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 16,
    padding: 22,
    width: "100%",
    maxWidth: 460,
    maxHeight: "85vh",
    overflowY: "auto",
  },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700 },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 20, cursor: "pointer" },
  helpText: { fontSize: 13, color: "var(--mute)", lineHeight: 1.5, marginBottom: 12 },
  input: {
    width: "100%",
    background: "var(--ink)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
    marginBottom: 12,
  },
  primaryBtn: {
    width: "100%",
    background: "var(--accent)",
    color: "#0a1420",
    border: "none",
    borderRadius: 10,
    padding: "12px 0",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  errorBox: {
    background: "#2a0c0c",
    border: "1px solid #FF6B6B44",
    color: "#FF6B6B",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    marginBottom: 12,
  },
  reviewHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  linkBtn: {
    background: "transparent",
    border: "none",
    color: "var(--accent)",
    fontSize: 12,
    cursor: "pointer",
    textDecoration: "underline",
  },
  videoList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    maxHeight: 320,
    overflowY: "auto",
    marginBottom: 14,
    background: "var(--ink)",
    borderRadius: 8,
    padding: 8,
  },
  videoRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 6px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
  },
  videoTitle: { color: "var(--text)" },
  importingBox: { textAlign: "center", padding: "20px 0" },
  progressBarBg: { background: "var(--ink)", borderRadius: 6, height: 8, overflow: "hidden", marginTop: 10 },
  progressBarFill: { background: "var(--accent)", height: "100%", transition: "width 0.2s" },
};
