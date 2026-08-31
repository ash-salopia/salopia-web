import { NextResponse } from "next/server";
import { getAthleteByShareToken, updateSessionDuration } from "@/lib/data/athlete-share-link";

export async function POST(request: Request) {
  let body: { token?: string; sessionId?: string; durationMin?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token, sessionId, durationMin } = body;
  if (!token || !sessionId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }
    await updateSessionDuration(sessionId, athlete.id, durationMin ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
