import { NextResponse } from "next/server";
import { getAthleteByShareToken, updateAthleteVisibilitySettings } from "@/lib/data/athlete-share-link";

// GET /api/athlete-link/visibility-settings?token=xxx
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  return NextResponse.json({
    hide_pbs_from_feed: (athlete as any).hide_pbs_from_feed ?? false,
    feed_first_name_only: (athlete as any).feed_first_name_only ?? false,
  });
}

// POST /api/athlete-link/visibility-settings
export async function POST(request: Request) {
  let body: { token?: string; hide_pbs_from_feed?: boolean; feed_first_name_only?: boolean };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  const { token, hide_pbs_from_feed, feed_first_name_only } = body;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  if (typeof hide_pbs_from_feed !== "boolean" && typeof feed_first_name_only !== "boolean") {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

    const patch: { hide_pbs_from_feed?: boolean; feed_first_name_only?: boolean } = {};
    if (typeof hide_pbs_from_feed === "boolean") patch.hide_pbs_from_feed = hide_pbs_from_feed;
    if (typeof feed_first_name_only === "boolean") patch.feed_first_name_only = feed_first_name_only;

    await updateAthleteVisibilitySettings(athlete.id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save" }, { status: 400 });
  }
}
