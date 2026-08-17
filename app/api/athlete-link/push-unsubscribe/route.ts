import { NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = body?.token as string | undefined;
  const endpoint = body?.endpoint as string | undefined;
  if (!token || !endpoint) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const service = createServiceRoleClient();
  await service.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("athlete_id", athlete.id);

  return NextResponse.json({ ok: true });
}
