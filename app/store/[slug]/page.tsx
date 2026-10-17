import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStoreBySlug } from "@/lib/store/server";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { resolveBranding, DEFAULT_BRANDING } from "@/types/branding";
import StoreView from "@/components/store/StoreView";

// A coach's public Programme Store (0124). No login: anyone with the
// link can browse and buy. Never cached, so price/availability changes
// show straight away.
export const dynamic = "force-dynamic";

async function load(slug: string) {
  if (!/^[a-z0-9-]{2,40}$/i.test(slug)) return null;
  return getStoreBySlug(slug);
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const store = await load(params.slug);
  return { title: store ? `${store.name} - Programmes` : "Store not found" };
}

export default async function StorePage({ params }: { params: { slug: string } }) {
  const store = await load(params.slug);
  if (!store) notFound();
  const { data: org } = await createServiceRoleClient()
    .from("organisations")
    .select("name, tier, branding")
    .eq("id", store.organisationId)
    .single();
  const branding = org ? resolveBranding({ name: org.name, tier: org.tier ?? "standard", branding: org.branding ?? {} }) : DEFAULT_BRANDING;
  const { organisationId: _o, accountId: _a, ...pub } = store;
  return <StoreView store={pub} branding={branding} />;
}
