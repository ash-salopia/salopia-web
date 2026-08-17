import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceRoleClient } from "@/lib/supabase-service";

// POST /api/push/unsubscribe — coach-side. Deletes by endpoint, scoped
// to this coach's own id so one coach can never remove another's
// subscription even if they somehow knew the endpoint.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint as string | undefined;
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

  const service = createServiceRoleClient();
  await service.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("coach_id", user.id);

  return NextResponse.json({ ok: true });
}
