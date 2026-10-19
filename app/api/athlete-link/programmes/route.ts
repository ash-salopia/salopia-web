import { NextRequest, NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { getAthleteByShareToken } from "@/lib/data/athlete-share-link";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { getStoreForOrg, programmeWeeks } from "@/lib/store/server";

export const dynamic = "force-dynamic";

// GET /api/athlete-link/programmes?token=xxx - the athlete's programme
// library (0124: bought or given by the coach) plus their coach's store,
// so they can buy more in-app.
export async function GET(req: NextRequest) {
  noStore();
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const athlete = await getAthleteByShareToken(token);
  if (!athlete) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const service = createServiceRoleClient();
  const { data: rows, error } = await service
    .from("athlete_programmes")
    .select("id, programme_id, title, status, start_date, created_at")
    .eq("athlete_id", athlete.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ library: [], store: null }); // 0124 not run yet

  const ids = Array.from(new Set((rows ?? []).map((r) => r.programme_id)));
  const { data: sessions } = ids.length
    ? await service.from("programme_sessions").select("programme_id, day_offset").in("programme_id", ids)
    : { data: [] as { programme_id: string; day_offset: number }[] };
  const byProg: Record<string, { day_offset: number }[]> = {};
  for (const s of sessions ?? []) (byProg[s.programme_id] ??= []).push(s);

  const store = await getStoreForOrg((athlete as any).organisation_id);
  // Don't offer programmes the athlete already has.
  const owned = new Set((rows ?? []).map((r) => r.programme_id));
  const { data: ownedProducts } = owned.size
    ? await service.from("store_products").select("id").in("programme_id", Array.from(owned))
    : { data: [] as { id: string }[] };
  const ownedProductIds = new Set((ownedProducts ?? []).map((p) => p.id));
  const forSale = (store?.products ?? []).filter((p) => !ownedProductIds.has(p.id));
  return NextResponse.json({
    library: (rows ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      startDate: r.start_date,
      weeks: programmeWeeks(byProg[r.programme_id] ?? []),
      sessions: (byProg[r.programme_id] ?? []).length,
    })),
    store:
      store && store.canSell && forSale.length ? { name: store.name, products: forSale } : null,
  });
}
