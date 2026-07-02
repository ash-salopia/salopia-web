import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken, getAthleteSessions } from "@/lib/data/athlete-share-link";

// force-dynamic makes every fetch() call inside this route use no-store,
// so Next.js Data Cache never serves a stale Supabase response.
// Without this, the Supabase queries are cached server-side even though
// the client is requesting with cache:"no-store".
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const sessions = await getAthleteSessions(athlete.id);
  return NextResponse.json({ sessions }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
