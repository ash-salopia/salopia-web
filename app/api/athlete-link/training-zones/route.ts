import { NextResponse } from "next/server";
import { getAthleteByShareToken, getOrgSettingsForAthlete } from "@/lib/data/athlete-share-link";
import { computeZones, DEFAULT_ZONE_MODEL } from "@/lib/training-zones";

// GET /api/athlete-link/training-zones?token=xxx
// The athlete's 5 computed training zones (HR + pace) for the
// "Training zones" card on their settings page.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  let model = DEFAULT_ZONE_MODEL;
  let enabled = true;
  try {
    const settings = await getOrgSettingsForAthlete(athlete.id);
    if (settings.zone_model) model = settings.zone_model;
    enabled = settings.aerobic_zones_enabled !== false;
  } catch { /* fall back to default model */ }

  const profile = {
    max_hr: athlete.max_hr ?? null,
    resting_hr: athlete.resting_hr ?? null,
    mas_kmh: athlete.mas_kmh ?? null,
  };

  return NextResponse.json({
    enabled,
    hasProfile: !!(profile.max_hr || profile.mas_kmh),
    usesReserve: !!(profile.max_hr && profile.resting_hr),
    zones: computeZones(profile, model),
  });
}
