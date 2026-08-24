import { NextResponse } from "next/server";
import { getAthleteByShareToken, updateCardioConfig } from "@/lib/data/athlete-share-link";
import type { CardioConfig } from "@/types";

export async function POST(request: Request) {
  let body: { token?: string; sessionId?: string; cardioConfig?: CardioConfig };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token, sessionId, cardioConfig } = body;
  if (!token || !sessionId || !cardioConfig) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }
    await updateCardioConfig(sessionId, athlete.id, cardioConfig);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
