import { NextResponse } from "next/server";
import { getAthleteByShareToken, getOrgSettingsForAthlete } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { resolveIncrements, type LoadIncrements } from "@/lib/load-increments";

export const dynamic = "force-dynamic";

// The athlete's own gym weight steps for quick-pick loads (0133).
// Token-resolved like every athlete-link route: the athlete comes from
// the share token, never from the request body.

// GET ?token= -> { own: their saved steps or null, coach: the coach's default (resolved) }
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  let coach = resolveIncrements(null, null);
  try {
    coach = resolveIncrements(null, (await getOrgSettingsForAthlete(athlete.id)).load_increments);
  } catch { /* defaults */ }
  return NextResponse.json({ own: athlete.load_increments ?? null, coach }, { headers: { "Cache-Control": "no-store" } });
}

// POST { token, increments: LoadIncrements | null } - null = back to the coach's default
export async function POST(request: Request) {
  let body: { token?: string; increments?: Partial<LoadIncrements> | null };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  if (!body.token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const athlete = await getAthleteByShareToken(body.token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  // Store only valid fields (resolveIncrements against an empty base drops the rest).
  const value = body.increments ? resolveIncrements(body.increments, null) : null;
  const service = createServiceRoleClient();
  const { error } = await service.from("athletes").update({ load_increments: value }).eq("id", athlete.id);
  if (error) {
    const missing = /load_increments/.test(error.message);
    return NextResponse.json({ error: missing ? "This setting isn't available yet - ask your coach." : "Could not save" }, { status: missing ? 503 : 400 });
  }
  return NextResponse.json({ ok: true, increments: value });
}
