import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken, getAthleteSessions } from "@/lib/data/athlete-share-link";

// GET /api/athlete-link/sessions?token=...
// Returns all sessions (with exercises) for the athlete. Used by the
// athlete shell to client-side fetch fresh data so coach edits are
// visible without a hard page reload.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const sessions = await getAthleteSessions(athlete.id);
  return NextResponse.json({ sessions });
}
