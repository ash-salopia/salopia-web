import { NextResponse } from "next/server";
import { getAthleteByShareToken, startLibrarySession } from "@/lib/data/athlete-share-link";

// POST /api/athlete-link/library/start
// Materializes a real, standalone session (session_source: 'library')
// from a template def the athlete has been granted access to, and
// returns its id so the client can route straight into the normal
// session-logging view.
export async function POST(request: Request) {
  let body: { token?: string; templateDefId?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  const { token, templateDefId } = body;
  if (!token || !templateDefId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    const sessionId = await startLibrarySession(athlete.id, templateDefId);
    return NextResponse.json({ sessionId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not start session" }, { status: 400 });
  }
}
