import { notFound } from "next/navigation";
import { getAthleteByShareToken, getAthleteSessions, getOrgSettingsForAthlete, getTodayCheckIn } from "@/lib/data/athlete-share-link";
import AthleteSessionView from "@/components/AthleteSessionView";
import { computeZones, DEFAULT_ZONE_MODEL, type ComputedZone } from "@/lib/training-zones";
import { isAvailable } from "@/lib/rtp";

export const dynamic = "force-dynamic";

export default async function AthleteLinkSessionPage({
  params,
}: {
  params: Promise<{ token: string; sessionId: string }>;
}) {
  const { token, sessionId } = await params;

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) notFound();

  // Try to find the session server-side. For sessions recently added by
  // the coach the server cache may miss them — in that case pass undefined
  // and let AthleteSessionView client-fetch via /api/athlete-link/sessions.
  let session;
  let allSessions;
  try {
    const sessions = await getAthleteSessions(athlete.id);
    session = sessions.find((s) => s.id === sessionId);
    allSessions = sessions;
  } catch {
    session = undefined;
    allSessions = undefined;
  }

  let lockUntilCheckin = false;
  let checkedInToday = false;
  let zones: ComputedZone[] | null = null;
  let zonesEnabled = true;
  let wellnessCheckIn = false;
  let painCheckIn = false;
  try {
    const [settings, todayCheckIn] = await Promise.all([
      getOrgSettingsForAthlete(athlete.id),
      getTodayCheckIn(athlete.id),
    ]);
    lockUntilCheckin = !!settings.lock_until_checkin;
    checkedInToday = !!todayCheckIn;
    zonesEnabled = settings.aerobic_zones_enabled !== false;
    // The wellness/pain questions are only asked of athletes who are actually
    // being monitored — whose availability isn't "Available", OR who have the
    // per-athlete "monitor anyway" override on (0089). A healthy athlete with
    // neither keeps the original 4-question check-in.
    const monitored = settings.load_monitoring_enabled
      && (!isAvailable(athlete.rtp_status) || athlete.monitor_wellness);
    wellnessCheckIn = monitored && settings.load_monitoring.daily_wellness;
    painCheckIn = monitored && settings.load_monitoring.pain_tracking;
    zones = computeZones(
      { max_hr: athlete.max_hr ?? null, resting_hr: athlete.resting_hr ?? null, mas_kmh: athlete.mas_kmh ?? null },
      settings.zone_model ?? DEFAULT_ZONE_MODEL
    );
  } catch {
    // Fail open - never lock an athlete out of their session over a fetch error.
  }

  return (
    <AthleteSessionView
      session={session}
      allSessions={allSessions}
      sessionId={sessionId}
      athleteName={athlete.name}
      token={token}
      lockUntilCheckin={lockUntilCheckin}
      checkedInToday={checkedInToday}
      zones={zones}
      zonesEnabled={zonesEnabled}
      wellnessCheckIn={wellnessCheckIn}
      painCheckIn={painCheckIn}
    />
  );
}
