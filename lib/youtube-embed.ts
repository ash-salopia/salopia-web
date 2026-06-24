// Extracts a YouTube video ID from common URL shapes so it can be
// used to build an embeddable player URL. Returns null if the input
// doesn't look like a YouTube link at all (e.g. a Vimeo link, or
// nothing) — callers should fall back to "open in new tab" in that
// case rather than trying to embed something that isn't YouTube.
export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1) || null;
    }
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || null;
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
    }
  } catch {
    // Not a valid URL at all
  }
  return null;
}

export function youTubeEmbedUrl(videoId: string): string {
  // autoplay=1 since the coach/athlete just deliberately tapped to
  // watch it; rel=0 keeps related-video suggestions limited to the
  // same channel rather than showing unrelated YouTube content.
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
}
