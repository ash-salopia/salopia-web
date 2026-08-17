import { NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

// POST /api/athlete-link/push-subscribe — athlete_id is resolved from
// the share token, never trusted from the client body, same rule as
// every other athlete-link write (see CLAUDE.md's architecture note).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = body?.token as string | undefined;
  const endpoint = body?.endpoint as string | undefined;
  const p256dh = body?.keys?.p256dh as string | undefined;
  const auth = body?.keys?.auth as string | undefined;
  if (!token || !endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const service = createServiceRoleClient();
  const { error } = await service
    .from("push_subscriptions")
    .upsert(
      { subscriber_type: "athlete", athlete_id: athlete.id, coach_id: null, endpoint, p256dh, auth },
      { onConflict: "endpoint" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
