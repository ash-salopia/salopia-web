import { notFound } from "next/navigation";
import { getPublishedTemplateByCode } from "@/lib/data/home-programme-public";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { resolveBranding, DEFAULT_BRANDING } from "@/types/branding";
import HomeProgrammeView from "@/components/public/HomeProgrammeView";

// Never cache — a coach editing/unpublishing the programme, or their
// subscription lapsing, must take effect immediately for anyone
// holding the link, same reasoning as the athlete share-link page.
export const dynamic = "force-dynamic";

export default async function HomeProgrammePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const template = await getPublishedTemplateByCode(code);
  // Same 404 regardless of why (never published, expired, revoked,
  // billing-restricted, or just a typo) — never reveal which.
  if (!template) notFound();

  const supabase = createServiceRoleClient();
  const { data: org } = await supabase
    .from("organisations")
    .select("name, tier, branding")
    .eq("id", template.organisation_id)
    .single();
  const branding = org
    ? resolveBranding({ name: org.name, tier: org.tier ?? "standard", branding: org.branding ?? {} })
    : DEFAULT_BRANDING;

  return <HomeProgrammeView template={template} branding={branding} />;
}
