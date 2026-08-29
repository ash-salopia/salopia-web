import { NextResponse } from "next/server";
import { getAthleteByShareToken, submitCheckIn } from "@/lib/data/athlete-share-link";

export async function POST(request: Request) {
  let body: { token?: string; energy?: number; sleep?: number; soreness?: number; volume?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token, energy, sleep, soreness, volume } = body;
  if (!token || energy == null || sleep == null || soreness == null || volume == null) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }
    const checkin = await submitCheckIn(athlete.id, { energy, sleep, soreness, volume });
    return NextResponse.json({ ok: true, checkin });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
