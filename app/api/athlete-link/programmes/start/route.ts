import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { loadProgrammeOntoCalendar } from "@/lib/store/server";
import { sendPushToCoaches } from "@/lib/push/send";

export const dynamic = "force-dynamic";

// POST /api/athlete-link/programmes/start { token, id, startDate } - the
// athlete starts a programme from their library: every session goes on
// their calendar from startDate, keeping the programme's day pattern.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { token, id, startDate } = body ?? {};
  if (!token || !id || typeof startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const today = new Date().toISOString().slice(0, 10);
  const max = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  if (startDate < today || startDate > max) return NextResponse.json({ error: "Pick a start date within the next 90 days." }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  const service = createServiceRoleClient();

  // Ownership: the library row must belong to the athlete from the token.
  const { data: row } = await service.from("athlete_programmes").select("id, programme_id, title, status").eq("id", id).eq("athlete_id", athlete.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Programme not found" }, { status: 404 });
  if (row.status !== "ready") return NextResponse.json({ error: "You've already started this programme." }, { status: 409 });

  // Claim first so a double tap can't load it twice.
  const { data: claimed } = await service
    .from("athlete_programmes")
    .update({ status: "active", start_date: startDate, started_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "ready")
    .select("id")
    .maybeSingle();
  if (!claimed) return NextResponse.json({ error: "You've already started this programme." }, { status: 409 });

  try {
    const count = await loadProgrammeOntoCalendar(service, athlete.id, row.programme_id, startDate);
    const { data: links } = await service.from("coach_athletes").select("coach_id").eq("athlete_id", athlete.id);
    sendPushToCoaches((links ?? []).map((l) => l.coach_id), {
      title: `${(athlete as any).name} started ${row.title}`,
      body: `${count} sessions from ${startDate}`,
      url: `/athletes/${athlete.id}`,
    }).catch(() => {});
    return NextResponse.json({ ok: true, sessions: count });
  } catch (e) {
    console.error("[programmes/start] load failed", e);
    await service.from("athlete_programmes").update({ status: "ready", start_date: null, started_at: null }).eq("id", row.id);
    return NextResponse.json({ error: "Couldn't add the sessions - please try again." }, { status: 500 });
  }
}
