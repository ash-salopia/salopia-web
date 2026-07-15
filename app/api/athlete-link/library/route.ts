import { NextRequest, NextResponse } from "next/server";
import { getAthleteByShareToken, getAthleteLibraryTemplates } from "@/lib/data/athlete-share-link";

// GET /api/athlete-link/library?token=...
// Lists the templates this athlete has been granted access to, for
// browsing/logging informally outside their assigned programme.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  try {
    const athlete = await getAthleteByShareToken(token);
    if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    const templates = await getAthleteLibraryTemplates(athlete.id);
    return NextResponse.json({ templates });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load library" }, { status: 400 });
  }
}
