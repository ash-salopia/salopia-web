import { NextRequest, NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

// GET /api/athlete-link/reports?token=xxx - the Training Reports the
// coach shared to this athlete's app (0123): not withdrawn, not
// expired. Listing only; each opens at its /r/<id> link.
export async function GET(req: NextRequest) {
  noStore();
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("shared_reports")
    .select("id, title, range_label, created_at, expires_at")
    .eq("athlete_id", athlete.id)
    .eq("visible_to_athlete", true)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(50);
  // Before 0123 the columns don't exist - nothing has been shared to the app yet.
  if (error) return NextResponse.json({ reports: [] });
  return NextResponse.json({ reports: data ?? [] });
}
