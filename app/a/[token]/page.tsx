import { notFound } from "next/navigation";
import { getAthleteByShareToken, getAthleteSessions } from "@/lib/data/athlete-share-link";
import AthleteLinkShell from "@/components/AthleteLinkShell";
import { createClient } from "@/lib/supabase-server";
import { resolveBranding, DEFAULT_BRANDING } from "@/types/branding";

export default async function AthleteLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const athlete = await getAthleteByShareToken(token);
  // Deliberately the same 404 page whether the token is malformed,
  // expired (regenerated), or never existed — never reveal which,
  // since that distinction could help someone probe for valid tokens.
  if (!athlete) notFound();

  const sessions = await getAthleteSessions(athlete.id);

  // Fetch org branding
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organisations")
    .select("name, tier, branding")
    .eq("id", athlete.organisation_id)
    .single();

  const branding = org
    ? resolveBranding({ name: org.name, tier: org.tier ?? "standard", branding: org.branding ?? {} })
    : DEFAULT_BRANDING;

  return <AthleteLinkShell athlete={athlete} sessions={sessions} token={token} branding={branding} />;
}
