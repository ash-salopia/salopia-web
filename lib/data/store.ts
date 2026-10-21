import { createClient } from "@/lib/supabase-browser";

// Coach-side data for the Programme Store (0124). Only the owner and
// coaches the owner has given store access (coaches.can_manage_store,
// 0126) can see products and sales - RLS enforces it. Store details live
// on organisations and are saved through update_store_settings() so a
// store manager doesn't need owner rights on the whole org row. Sales
// are read-only here (written by the payment webhook).

export interface StoreSettings {
  store_slug: string | null;
  store_name: string | null;
  store_description: string;
  seat_limit: number | null;
  // 0127 - seller details + refund policy (trading name, email, policy required to sell)
  store_trading_name: string;
  store_contact_email: string;
  store_contact_phone: string;
  store_business_address: string;
  store_refund_policy: string;
}

export type StoreSettingsForm = Pick<
  StoreSettings,
  "store_description" | "store_trading_name" | "store_contact_email" | "store_contact_phone" | "store_business_address" | "store_refund_policy"
> & { store_slug: string; store_name: string };

/** A starting point coaches can edit - fair, and in line with UK rules for digital content. */
export const DEFAULT_REFUND_POLICY = `Because programmes are digital and delivered to your training app straight away, you agree at checkout to immediate access, so the usual 14-day cancellation right doesn't apply once it's delivered.

If you haven't pressed Start on the programme yet, contact us within 14 days of buying and we'll refund you in full.

If something is wrong with the programme (for example it doesn't load or isn't as described), contact us and we'll fix it or refund you.

This doesn't affect your statutory rights.`;

export interface StoreProductRow {
  id: string;
  programme_id: string;
  title: string;
  description: string;
  price_pence: number;
  currency: string;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export interface PurchaseRow {
  id: string;
  buyer_name: string;
  buyer_email: string;
  amount_pence: number;
  currency: string;
  status: "pending" | "paid" | "refunded" | "failed";
  created_at: string;
  paid_at: string | null;
  athlete_id: string | null;
  product_id: string | null;
  failure_reason: string | null;
}

async function myOrg() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data: coach } = await supabase.from("coaches").select("*").eq("id", user.id).single();
  if (!coach) throw new Error("Coach profile not found");
  const isOwner = coach.role === "owner";
  return { supabase, orgId: coach.organisation_id as string, isOwner, canManage: isOwner || coach.can_manage_store === true };
}

/** Owner, or a coach the owner has given store access. */
export async function canManageStore(): Promise<boolean> {
  return (await myOrg()).canManage;
}

export async function getStoreSettings(): Promise<StoreSettings & { isOwner: boolean; canManage: boolean; athletesUsed: number; orgName: string }> {
  const { supabase, orgId, isOwner, canManage } = await myOrg();
  const [{ data: org, error }, { count }] = await Promise.all([
    supabase.from("organisations").select("*").eq("id", orgId).single(),
    supabase.from("athletes").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).eq("archived", false),
  ]);
  if (error) throw error;
  return {
    store_slug: org.store_slug ?? null,
    store_name: org.store_name ?? null,
    store_description: org.store_description ?? "",
    seat_limit: org.seat_limit ?? null,
    store_trading_name: org.store_trading_name ?? "",
    store_contact_email: org.store_contact_email ?? "",
    store_contact_phone: org.store_contact_phone ?? "",
    store_business_address: org.store_business_address ?? "",
    store_refund_policy: org.store_refund_policy ?? "",
    orgName: org.name ?? "",
    isOwner,
    canManage,
    athletesUsed: count ?? 0,
  };
}

export async function saveStoreSettings(patch: StoreSettingsForm): Promise<void> {
  const { supabase } = await myOrg();
  const slug = patch.store_slug.trim().toLowerCase();
  const contact = patch.store_contact_email.trim();
  if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact)) throw new Error("Check the contact email address.");
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) throw new Error("The store address can only use letters, numbers and dashes (2-40 characters).");
  const { error } = await supabase.rpc("update_store_settings", {
    p_slug: slug,
    p_name: patch.store_name,
    p_description: patch.store_description,
    p_trading_name: patch.store_trading_name,
    p_contact_email: patch.store_contact_email,
    p_contact_phone: patch.store_contact_phone,
    p_business_address: patch.store_business_address,
    p_refund_policy: patch.store_refund_policy,
  });
  if (error) {
    if (error.code === "42501") throw new Error("You don't have access to the online store.");
    if (error.code === "23505") throw new Error("That store address is taken - try another.");
    throw error;
  }
}

export async function listStoreProducts(): Promise<StoreProductRow[]> {
  const { supabase, orgId } = await myOrg();
  const { data, error } = await supabase.from("store_products").select("*").eq("organisation_id", orgId).order("sort_order").order("created_at");
  if (error) throw error;
  return (data ?? []) as StoreProductRow[];
}

export async function saveStoreProduct(p: { id?: string; programme_id: string; title: string; description: string; price_pence: number; active: boolean }): Promise<StoreProductRow> {
  const { supabase, orgId } = await myOrg();
  if (!p.title.trim()) throw new Error("Give the programme a title.");
  if (!(p.price_pence >= 50)) throw new Error("The price must be at least £0.50.");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const row = {
    organisation_id: orgId,
    programme_id: p.programme_id,
    title: p.title.trim(),
    description: p.description.trim(),
    price_pence: Math.round(p.price_pence),
    active: p.active,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = p.id
    ? await supabase.from("store_products").update(row).eq("id", p.id).select("*").single()
    : await supabase.from("store_products").insert({ ...row, created_by: user?.id ?? null }).select("*").single();
  if (error) throw error;
  return data as StoreProductRow;
}

export async function deleteStoreProduct(id: string): Promise<void> {
  const { supabase } = await myOrg();
  const { count } = await supabase.from("programme_purchases").select("id", { count: "exact", head: true }).eq("product_id", id).eq("status", "paid");
  // Keep sold products for the sales history - hide instead.
  if ((count ?? 0) > 0) {
    const { error } = await supabase.from("store_products").update({ active: false }).eq("id", id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("store_products").delete().eq("id", id);
  if (error) throw error;
}

export async function listPurchases(limit = 50): Promise<PurchaseRow[]> {
  const { supabase, orgId } = await myOrg();
  const { data, error } = await supabase
    .from("programme_purchases")
    .select("id, buyer_name, buyer_email, amount_pence, currency, status, created_at, paid_at, athlete_id, product_id, failure_reason")
    .eq("organisation_id", orgId)
    .neq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PurchaseRow[];
}
