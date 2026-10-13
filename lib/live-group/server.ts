import { createClient } from "@/lib/supabase-server";
import { liveGroupLimits, type LiveGroupLimits } from "@/lib/billing/live-group-limits";

// Shared by the /api/live-group/* routes: who is calling, which org
// they're in, and that org's Live Group limits. Everything is derived
// from the signed-in session — never from the request body.
export interface LiveGroupCaller {
  supabase: Awaited<ReturnType<typeof createClient>>;
  coachId: string;
  orgId: string;
  limits: LiveGroupLimits;
}

export async function getLiveGroupCaller(): Promise<LiveGroupCaller | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: coach } = await supabase
    .from("coaches").select("id, organisation_id").eq("id", user.id).maybeSingle();
  if (!coach) return null;
  const { data: org } = await supabase
    .from("organisations").select("plan").eq("id", coach.organisation_id).maybeSingle();
  return {
    supabase,
    coachId: coach.id,
    orgId: coach.organisation_id,
    limits: liveGroupLimits(org?.plan),
  };
}

export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}
