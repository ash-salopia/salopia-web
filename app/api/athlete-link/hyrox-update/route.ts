import { NextResponse } from "next/server";
import { getAthleteByShareToken, updateHyroxConfig } from "@/lib/data/athlete-share-link";
import type { HyroxConfig } from "@/types";

export async function POST(request: Request) {
  let body: { token?: string; sessionId?: string; hyroxConfig?: HyroxConfig };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token, sessionId, hyroxConfig } = body;
  if (!token || !sessionId || !hyroxConfig) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }
    await updateHyroxConfig(sessionId, athlete.id, hyroxConfig);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
