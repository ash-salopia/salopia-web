"use client";

import { extractYouTubeVideoId, youTubeEmbedUrl } from "@/lib/youtube-embed";

export default function VideoModal({
  videoUrl,
  title,
  onClose,
}: {
  videoUrl: string;
  title?: string;
  onClose: () => void;
}) {
  const videoId = extractYouTubeVideoId(videoUrl);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.headerRow}>
          {title && <div style={styles.title}>{title}</div>}
          <button style={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        {videoId ? (
          <div style={styles.playerWrap}>
            <iframe
              src={youTubeEmbedUrl(videoId)}
              title={title || "Exercise video"}
              style={styles.iframe}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          // Not a recognised YouTube link — fall back to a plain
          // "open in new tab" link rather than failing silently or
          // showing a broken embed.
          <div style={styles.fallback}>
            <p style={styles.fallbackText}>
              This video can&apos;t be played inline, but you can open it directly.
            </p>
            <a href={videoUrl} target="_blank" rel="noopener noreferrer" style={styles.fallbackLink}>
              Open video ↗
            </a>
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
    background: "rgba(6,9,12,.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 70,
    padding: 16,
  },
  modal: {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 16,
    padding: 14,
    width: "100%",
    maxWidth: 720,
  },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 14, fontWeight: 700, color: "var(--text)" },
  closeBtn: { background: "transparent", border: "none", color: "var(--mute)", fontSize: 22, cursor: "pointer" },
  playerWrap: {
    position: "relative",
    width: "100%",
    paddingBottom: "56.25%", // 16:9 aspect ratio
    borderRadius: 10,
    overflow: "hidden",
    background: "#000",
  },
  iframe: { position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" },
  fallback: { textAlign: "center", padding: "30px 0" },
  fallbackText: { fontSize: 13, color: "var(--mute)", marginBottom: 12 },
  fallbackLink: {
    display: "inline-block",
    background: "var(--accent)",
    color: "#0a1420",
    borderRadius: 10,
    padding: "10px 18px",
    fontSize: 14,
    fontWeight: 700,
    textDecoration: "none",
  },
};
