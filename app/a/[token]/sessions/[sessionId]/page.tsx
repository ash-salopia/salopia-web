import { notFound } from "next/navigation";
import { getAthleteByShareToken, getAthleteSessions, getOrgSettingsForAthlete, getTodayCheckIn } from "@/lib/data/athlete-share-link";
import AthleteSessionView from "@/components/AthleteSessionView";
import { computeZones, DEFAULT_ZONE_MODEL, type ComputedZone } from "@/lib/training-zones";

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
  try {
    const [settings, todayCheckIn] = await Promise.all([
      getOrgSettingsForAthlete(athlete.id),
      getTodayCheckIn(athlete.id),
    ]);
    lockUntilCheckin = !!settings.lock_until_checkin;
    checkedInToday = !!todayCheckIn;
    zonesEnabled = settings.aerobic_zones_enabled !== false;
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
    />
  );
}
