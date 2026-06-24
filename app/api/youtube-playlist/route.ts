import { NextResponse } from "next/server";
import { extractPlaylistId, fetchPlaylistVideos, YouTubeApiError } from "@/lib/youtube";

export async function POST(request: Request) {
  let body: { playlistUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const playlistUrl = body.playlistUrl?.trim();
  if (!playlistUrl) {
    return NextResponse.json({ error: "Paste a playlist link first" }, { status: 400 });
  }

  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) {
    return NextResponse.json(
      { error: "That doesn't look like a YouTube playlist link. Copy the full URL from your browser's address bar." },
      { status: 400 }
    );
  }

  try {
    const videos = await fetchPlaylistVideos(playlistId);
    if (!videos.length) {
      return NextResponse.json(
        { error: "That playlist has no videos, or they're all private/deleted." },
        { status: 400 }
      );
    }
    return NextResponse.json({ videos });
  } catch (e) {
    const message = e instanceof YouTubeApiError ? e.message : "Could not fetch that playlist.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
