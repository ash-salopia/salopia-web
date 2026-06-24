import "server-only";

// YouTube Data API v3 client, server-only since it uses our API key
// (never exposed to the browser, same reasoning as the Supabase
// service role key — see lib/supabase-service.ts for the pattern
// this follows). Read-only access to PUBLIC playlist data only, no
// OAuth needed, costs 1 quota unit per call (very cheap — YouTube's
// free daily quota is 10,000 units, so even a large playlist needing
// several pages of 50 results each costs almost nothing).

export interface YouTubePlaylistVideo {
  title: string;
  videoId: string;
  videoUrl: string;
}

const MAX_RESULTS_PER_PAGE = 50;
// Hard safety cap on total videos fetched in one import, regardless
// of how large the playlist actually is — protects against an
// accidental infinite pagination loop and keeps quota usage bounded.
const MAX_TOTAL_VIDEOS = 1000;

export class YouTubeApiError extends Error {}

// Extracts a playlist ID from various URL formats a coach might
// paste in, or returns the input as-is if it already looks like a
// bare playlist ID (starts with "PL", "UU", "LL", or "FL" — YouTube's
// playlist ID prefixes).
export function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const listParam = url.searchParams.get("list");
    if (listParam) return listParam;
  } catch {
    // Not a URL — fall through to check if it's a bare ID
  }
  if (/^(PL|UU|LL|FL)[\w-]+$/.test(trimmed)) return trimmed;
  return null;
}

export async function fetchPlaylistVideos(playlistId: string): Promise<YouTubePlaylistVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new YouTubeApiError(
      "YouTube import isn't configured yet — missing YOUTUBE_API_KEY. See .env.example."
    );
  }

  const videos: YouTubePlaylistVideo[] = [];
  let pageToken = "";

  do {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", String(MAX_RESULTS_PER_PAGE));
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const reason = body?.error?.errors?.[0]?.reason;
      if (res.status === 404 || reason === "playlistNotFound") {
        throw new YouTubeApiError(
          "Couldn't find that playlist. Check the link is correct and the playlist is public or unlisted (not private)."
        );
      }
      if (res.status === 403) {
        throw new YouTubeApiError(
          "YouTube refused this request — the playlist may be private, or the daily import quota has been used up. Try again tomorrow, or check the playlist's privacy setting."
        );
      }
      throw new YouTubeApiError(`YouTube API error (${res.status}). Please try again.`);
    }

    const data = await res.json();
    for (const item of data.items ?? []) {
      const title = item?.snippet?.title;
      const videoId = item?.snippet?.resourceId?.videoId;
      // Deleted/private videos still appear in playlistItems but with
      // a placeholder title like "Private video" or "Deleted video"
      // and no real videoId — skip those rather than importing junk
      // rows into the library.
      if (!title || !videoId || title === "Private video" || title === "Deleted video") continue;
      videos.push({ title, videoId, videoUrl: `https://youtu.be/${videoId}` });
    }

    pageToken = data.nextPageToken ?? "";
  } while (pageToken && videos.length < MAX_TOTAL_VIDEOS);

  return videos;
}
