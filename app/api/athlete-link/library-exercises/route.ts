import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken, getLibraryForOrganisation } from "@/lib/data/athlete-share-link";

// GET /api/athlete-link/library-exercises?token=...
// The athlete's org's full exercise library, for freely searching a
// swap when there's no coach-approved alternative that fits.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    const library = await getLibraryForOrganisation(athlete.organisation_id);
    return NextResponse.json({ library });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load library" }, { status: 400 });
  }
}
