import { NextResponse } from "next/server";
import { getAthleteByShareToken, updateAthleteNotificationSettings } from "@/lib/data/athlete-share-link";

// GET /api/athlete-link/notification-settings?token=xxx
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  return NextResponse.json({
    notify_missed_session: (athlete as any).notify_missed_session ?? true,
    notify_rpe_reminder: (athlete as any).notify_rpe_reminder ?? true,
    notify_morning_reminder: (athlete as any).notify_morning_reminder ?? true,
    // "HH:MM:SS" from Postgres time - trimmed to "HH:MM" to match
    // <input type="time">'s value format.
    morning_reminder_time: ((athlete as any).morning_reminder_time ?? "07:00:00").slice(0, 5),
  });
}

// POST /api/athlete-link/notification-settings
export async function POST(request: Request) {
  let body: {
    token?: string;
    notify_missed_session?: boolean;
    notify_rpe_reminder?: boolean;
    notify_morning_reminder?: boolean;
    morning_reminder_time?: string;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  const { token, notify_missed_session, notify_rpe_reminder, notify_morning_reminder, morning_reminder_time } = body;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const patch: {
    notify_missed_session?: boolean;
    notify_rpe_reminder?: boolean;
    notify_morning_reminder?: boolean;
    morning_reminder_time?: string;
  } = {};
  if (typeof notify_missed_session === "boolean") patch.notify_missed_session = notify_missed_session;
  if (typeof notify_rpe_reminder === "boolean") patch.notify_rpe_reminder = notify_rpe_reminder;
  if (typeof notify_morning_reminder === "boolean") patch.notify_morning_reminder = notify_morning_reminder;
  if (typeof morning_reminder_time === "string" && /^\d{2}:\d{2}$/.test(morning_reminder_time)) {
    patch.morning_reminder_time = `${morning_reminder_time}:00`;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

    await updateAthleteNotificationSettings(athlete.id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save" }, { status: 400 });
  }
}
