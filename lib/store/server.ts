import "server-only";
import type Stripe from "stripe";
import { unstable_noStore as noStore } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { getStripe } from "@/lib/stripe";
import { sendEmail, simpleEmailHtml, escapeHtml } from "@/lib/email";
import { sendPushToCoaches } from "@/lib/push/send";
import type { ProgrammeSession, PrescribedExercise } from "@/types";

// Online Programme Store (0124) - everything that runs with the service
// role: public store reads, seat checks, and fulfilling a paid Stripe
// Checkout session (idempotent - called by both the Connect webhook and
// the buyer's thank-you page, whichever lands first).

type Service = ReturnType<typeof createServiceRoleClient>;

export const STORE_FEE_PERCENT = 0; // VIS BUILD takes no cut for now (application_fee_amount omitted)

export function fmtPrice(pence: number, currency = "gbp"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(pence / 100);
}

/** Weeks a programme spans, from its sessions' day offsets. */
export function programmeWeeks(sessions: { day_offset: number }[]): number {
  if (!sessions.length) return 0;
  const offsets = sessions.map((s) => s.day_offset ?? 0);
  return Math.max(1, Math.ceil((Math.max(...offsets) - Math.min(...offsets) + 1) / 7));
}

export interface SeatStatus {
  used: number;
  limit: number | null; // null = unlimited
  free: number | null;
}

export async function seatStatus(service: Service, organisationId: string): Promise<SeatStatus> {
  const [{ data: org }, { count }] = await Promise.all([
    service.from("organisations").select("seat_limit").eq("id", organisationId).single(),
    service.from("athletes").select("id", { count: "exact", head: true }).eq("organisation_id", organisationId).eq("archived", false),
  ]);
  const limit = (org?.seat_limit as number | null) ?? null;
  const used = count ?? 0;
  return { used, limit, free: limit == null ? null : Math.max(limit - used, 0) };
}

export interface PublicProduct {
  id: string;
  title: string;
  description: string;
  pricePence: number;
  currency: string;
  price: string;
  weeks: number;
  sessions: number;
}

export interface PublicStore {
  organisationId: string;
  slug: string;
  name: string;
  description: string;
  accountId: string | null;
  canSell: boolean; // Stripe connected and able to take payments
  products: PublicProduct[];
}

export async function getStoreBySlug(slug: string): Promise<PublicStore | null> {
  noStore(); // public page: prices/listings must never be served from Next's data cache
  const service = createServiceRoleClient();
  const { data: org } = await service
    .from("organisations")
    .select("id, name, store_slug, store_name, store_description, stripe_connect_account_id, stripe_connect_charges_enabled")
    .ilike("store_slug", slug)
    .maybeSingle();
  if (!org?.store_slug) return null;
  return buildStore(service, org);
}

export async function getStoreForOrg(organisationId: string): Promise<PublicStore | null> {
  noStore();
  const service = createServiceRoleClient();
  const { data: org } = await service
    .from("organisations")
    .select("id, name, store_slug, store_name, store_description, stripe_connect_account_id, stripe_connect_charges_enabled")
    .eq("id", organisationId)
    .maybeSingle();
  if (!org) return null;
  return buildStore(service, org);
}

async function buildStore(service: Service, org: Record<string, any>): Promise<PublicStore> {
  noStore();
  const { data: products } = await service
    .from("store_products")
    .select("id, title, description, price_pence, currency, programme_id, sort_order")
    .eq("organisation_id", org.id)
    .eq("active", true)
    .order("sort_order")
    .order("created_at");
  const programmeIds = Array.from(new Set((products ?? []).map((p) => p.programme_id)));
  const { data: sessions } = programmeIds.length
    ? await service.from("programme_sessions").select("programme_id, day_offset").in("programme_id", programmeIds)
    : { data: [] as { programme_id: string; day_offset: number }[] };
  const byProgramme: Record<string, { day_offset: number }[]> = {};
  for (const s of sessions ?? []) (byProgramme[s.programme_id] ??= []).push(s);

  return {
    organisationId: org.id,
    slug: org.store_slug ?? "",
    name: org.store_name || org.name || "Programmes",
    description: org.store_description ?? "",
    accountId: org.stripe_connect_account_id ?? null,
    canSell: !!org.stripe_connect_account_id && !!org.stripe_connect_charges_enabled,
    products: (products ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      pricePence: p.price_pence,
      currency: p.currency,
      price: fmtPrice(p.price_pence, p.currency),
      weeks: programmeWeeks(byProgramme[p.programme_id] ?? []),
      sessions: (byProgramme[p.programme_id] ?? []).length,
    })),
  };
}

/** Who hears about sales and seat limits: the owner plus coaches with store access (0126). */
async function orgCoaches(service: Service, organisationId: string): Promise<{ id: string; name: string; email: string | null; role: string }[]> {
  const { data } = await service.from("coaches").select("*").eq("organisation_id", organisationId);
  return ((data ?? []) as any[]).filter((c) => !c.archived && (c.role === "owner" || c.can_manage_store === true));
}

/**
 * A sale was blocked because the organisation has no free seats - tell
 * the coaches straight away (at most once a day), so they can upgrade
 * or archive athletes before losing more sales.
 */
export async function notifySeatLimitBlocked(organisationId: string, productTitle: string, origin: string): Promise<void> {
  const service = createServiceRoleClient();
  const { data: org } = await service.from("organisations").select("store_seat_warned_at, store_seat_warn_level").eq("id", organisationId).single();
  const last = org?.store_seat_warned_at ? new Date(org.store_seat_warned_at).getTime() : 0;
  if (org?.store_seat_warn_level === 100 && Date.now() - last < 24 * 3600 * 1000) return;
  const seats = await seatStatus(service, organisationId);
  const coaches = await orgCoaches(service, organisationId);
  const url = `${origin}/settings`;
  for (const c of coaches) {
    if (!c.email) continue;
    await sendEmail({
      to: [c.email],
      subject: "Someone tried to buy a programme - you're out of athlete seats",
      html: simpleEmailHtml({
        brand: "VIS BUILD",
        heading: "A sale was blocked: no free athlete seats",
        paragraphs: [
          `Someone just tried to buy <b>${escapeHtml(productTitle)}</b> from your store, but your plan has no free athlete seats (${seats.used} of ${seats.limit} used), so they couldn't check out.`,
          "Every buyer becomes an athlete on your account. Upgrade your plan, or archive athletes you no longer coach, to keep selling.",
        ],
        button: { label: "Manage your plan", url },
      }),
      text: `Someone tried to buy ${productTitle} but you have no free athlete seats (${seats.used} of ${seats.limit} used). Upgrade or archive athletes: ${url}`,
    });
  }
  await sendPushToCoaches(coaches.map((c) => c.id), {
    title: "Store sale blocked - no free seats",
    body: `Someone tried to buy ${productTitle}. Upgrade or archive athletes to keep selling.`,
    url: "/shop",
  }).catch(() => {});
  await service.from("organisations").update({ store_seat_warned_at: new Date().toISOString(), store_seat_warn_level: 100 }).eq("id", organisationId);
}

/**
 * Daily: organisations selling programmes that are nearly (90%) or
 * completely out of seats get a reminder - once per level, repeated at
 * most weekly while it stays that way.
 */
export async function runStoreSeatReminders(origin: string): Promise<number> {
  const service = createServiceRoleClient();
  const { data: sellers } = await service.from("store_products").select("organisation_id").eq("active", true);
  const orgIds = Array.from(new Set((sellers ?? []).map((s) => s.organisation_id)));
  let sent = 0;
  for (const orgId of orgIds) {
    const seats = await seatStatus(service, orgId);
    if (seats.limit == null) continue;
    const level = seats.used >= seats.limit ? 100 : seats.used / seats.limit >= 0.9 ? 90 : 0;
    const { data: org } = await service.from("organisations").select("store_seat_warned_at, store_seat_warn_level").eq("id", orgId).single();
    if (level === 0) {
      if (org?.store_seat_warn_level) await service.from("organisations").update({ store_seat_warn_level: null }).eq("id", orgId);
      continue;
    }
    const last = org?.store_seat_warned_at ? new Date(org.store_seat_warned_at).getTime() : 0;
    const prevLevel = org?.store_seat_warn_level ?? 0;
    if (prevLevel >= level && Date.now() - last < 7 * 24 * 3600 * 1000) continue;

    const coaches = await orgCoaches(service, orgId);
    const full = level === 100;
    const url = `${origin}/settings`;
    for (const c of coaches) {
      if (!c.email) continue;
      await sendEmail({
        to: [c.email],
        subject: full ? "Your store can't take new buyers - no athlete seats left" : "Your athlete seats are nearly full",
        html: simpleEmailHtml({
          brand: "VIS BUILD",
          heading: full ? "No athlete seats left for new buyers" : "You're nearly out of athlete seats",
          paragraphs: [
            `You're using <b>${seats.used} of ${seats.limit}</b> athlete seats. Every new programme buyer becomes an athlete on your account and uses a seat.`,
            full
              ? "New customers can't buy from your store until a seat is free. Existing athletes can still buy."
              : `Only ${seats.free} seat${seats.free === 1 ? "" : "s"} left before new customers can't buy from your store.`,
            "Upgrade your plan, or archive athletes you no longer coach.",
          ],
          button: { label: "Manage your plan", url },
        }),
        text: `You're using ${seats.used} of ${seats.limit} athlete seats. ${full ? "New customers can't buy from your store." : `${seats.free} left.`} Manage your plan: ${url}`,
      });
    }
    await service.from("organisations").update({ store_seat_warned_at: new Date().toISOString(), store_seat_warn_level: level }).eq("id", orgId);
    sent++;
  }
  return sent;
}

/**
 * Put a programme's sessions on an athlete's calendar from startDate,
 * keeping its day pattern (same rule as scheduleProgrammeSessions in
 * lib/data/programmes.ts). Service-role twin of
 * loadProgrammeSessionForAthlete.
 */
export async function loadProgrammeOntoCalendar(service: Service, athleteId: string, programmeId: string, startDate: string): Promise<number> {
  const { data: sessions, error } = await service.from("programme_sessions").select("*").eq("programme_id", programmeId);
  if (error) throw error;
  const ordered = [...((sessions ?? []) as ProgrammeSession[])].sort((a, b) => a.day_offset - b.day_offset || a.sort_order - b.sort_order);
  if (!ordered.length) return 0;
  const minOffset = ordered[0].day_offset;
  const created: string[] = [];
  try {
  for (const ps of ordered) {
    const d = new Date(startDate + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + (ps.day_offset - minOffset));
    const { data: session, error: sErr } = await service
      .from("sessions")
      .insert({
        athlete_id: athleteId,
        name: ps.name,
        date: d.toISOString().slice(0, 10),
        type: ps.type,
        hyrox_type: ps.hyrox_type,
        hyrox_config: ps.hyrox_config,
        cardio_type: ps.cardio_type,
        cardio_config: ps.cardio_config,
        recovery_category: ps.recovery_category,
        recovery_format: ps.recovery_format,
        recovery_config: ps.recovery_config,
        session_notes: ps.notes ?? "",
      })
      .select("id")
      .single();
    if (sErr) throw sErr;
    created.push(session.id);
    const exercises = (ps.exercises ?? []) as PrescribedExercise[];
    if (exercises.length) {
      const { error: exErr } = await service.from("session_exercises").insert(
        exercises.map((e, i) => ({
          session_id: session.id,
          name: e.name,
          order: e.order ?? "",
          sets: e.sets ?? 3,
          reps: e.reps ?? "",
          time: e.time ?? "",
          rest: e.rest ?? "",
          target_load: e.target_load ?? "",
          tempo: e.tempo ?? "2-0-2",
          each_side: e.each_side ?? false,
          notes: e.notes ?? "",
          video_url: e.video_url ?? "",
          rpe: e.rpe ?? null,
          percent_1rm: e.percent_1rm ?? null,
          use_percent_1rm: e.use_percent_1rm ?? false,
          set_percents: e.set_percents ?? [],
          sort_order: i,
          log: Array.from({ length: e.sets ?? 3 }, () => ({ weight: "", done: false, reps: "" })),
        }))
      );
      if (exErr) throw exErr;
    }
  }
  } catch (e) {
    // All or nothing: remove what was added so a retry doesn't double up.
    if (created.length) await service.from("sessions").delete().in("id", created);
    throw e;
  }
  return ordered.length;
}

export interface FulfilResult {
  status: "paid" | "pending" | "failed";
  athleteToken?: string;
  programmeTitle?: string;
  reason?: string;
}

/**
 * Fulfil a completed Checkout session on a connected account. Safe to
 * call more than once: the purchase row (unique on the session id) is
 * the lock, and a paid purchase just returns its result again.
 */
export async function fulfilCheckoutSession(checkout: Stripe.Checkout.Session, accountId: string, origin: string): Promise<FulfilResult> {
  const service = createServiceRoleClient();
  if (checkout.payment_status !== "paid") return { status: "pending" };

  const { data: org } = await service.from("organisations").select("id, name, store_name").eq("stripe_connect_account_id", accountId).maybeSingle();
  if (!org) return { status: "failed", reason: "Unknown store" };

  const { data: purchase } = await service.from("programme_purchases").select("*").eq("stripe_checkout_session_id", checkout.id).maybeSingle();
  if (!purchase || purchase.organisation_id !== org.id) return { status: "failed", reason: "Purchase not found" };

  const tokenFor = async (athleteId: string | null) => {
    if (!athleteId) return undefined;
    const { data } = await service.from("athletes").select("share_token").eq("id", athleteId).maybeSingle();
    return data?.share_token as string | undefined;
  };
  const { data: product } = purchase.product_id
    ? await service.from("store_products").select("id, title, programme_id, created_by").eq("id", purchase.product_id).maybeSingle()
    : { data: null };
  const programmeTitle = product?.title ?? "your programme";

  if (purchase.status === "paid") return { status: "paid", athleteToken: await tokenFor(purchase.athlete_id), programmeTitle };
  if (purchase.status === "failed" || purchase.status === "refunded") return { status: "failed", reason: purchase.failure_reason ?? "This purchase was refunded." };

  // Claim the purchase so a concurrent call (webhook + thank-you page)
  // can't fulfil it twice.
  const { data: claimed } = await service
    .from("programme_purchases")
    .update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent_id: typeof checkout.payment_intent === "string" ? checkout.payment_intent : checkout.payment_intent?.id ?? null })
    .eq("id", purchase.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) {
    const { data: again } = await service.from("programme_purchases").select("status, athlete_id, failure_reason").eq("id", purchase.id).single();
    return again?.status === "paid" ? { status: "paid", athleteToken: await tokenFor(again.athlete_id), programmeTitle } : { status: "failed", reason: again?.failure_reason ?? "Purchase could not be completed" };
  }

  const fail = async (reason: string) => {
    // Refund in full - never keep money for something we couldn't deliver.
    try {
      const pi = typeof checkout.payment_intent === "string" ? checkout.payment_intent : checkout.payment_intent?.id;
      if (pi) await getStripe().refunds.create({ payment_intent: pi }, { stripeAccount: accountId });
    } catch (e) {
      console.error("[store] refund failed", e);
    }
    await service.from("programme_purchases").update({ status: "refunded", refunded_at: new Date().toISOString(), failure_reason: reason }).eq("id", purchase.id);
    if (purchase.buyer_email) {
      await sendEmail({
        to: [purchase.buyer_email],
        subject: "Your programme purchase was refunded",
        html: simpleEmailHtml({
          brand: org.store_name || org.name || "VIS BUILD",
          heading: "Sorry - we couldn't complete your purchase",
          paragraphs: [`We couldn't set up <b>${escapeHtml(programmeTitle)}</b> for you, so your payment has been refunded in full. It can take 5-10 days to show on your statement.`, "Please contact the coach directly - they've been told."],
        }),
        text: `We couldn't set up ${programmeTitle} for you, so your payment has been refunded in full.`,
      });
    }
    if (reason.includes("SEAT_LIMIT")) await notifySeatLimitBlocked(org.id, programmeTitle, origin);
    return { status: "failed" as const, reason };
  };

  if (!product?.programme_id) return fail("Programme no longer available");

  // The athlete: the one who bought in-app, else match the buyer's email
  // to an existing athlete in this org, else create a new athlete (uses a seat).
  let athleteId: string | null = purchase.athlete_id;
  const email = String(purchase.buyer_email || "").toLowerCase();
  if (!athleteId && email) {
    const { data: existing } = await service.from("athletes").select("id").eq("organisation_id", org.id).ilike("contact_email", email).eq("archived", false).limit(1);
    athleteId = existing?.[0]?.id ?? null;
  }
  let createdAthlete = false;
  if (!athleteId) {
    const { data: created, error } = await service
      .from("athletes")
      .insert({ organisation_id: org.id, name: purchase.buyer_name || email || "New athlete", group: "Online", contact_email: email || null })
      .select("id")
      .single();
    if (error || !created) return fail(error?.message?.includes("SEAT_LIMIT") ? "SEAT_LIMIT_REACHED" : `Could not create athlete: ${error?.message ?? "unknown"}`);
    athleteId = created.id;
    createdAthlete = true;
    if (product.created_by) await service.from("coach_athletes").insert({ coach_id: product.created_by, athlete_id: athleteId });
  }

  const { error: libErr } = await service.from("athlete_programmes").insert({
    organisation_id: org.id,
    athlete_id: athleteId,
    programme_id: product.programme_id,
    purchase_id: purchase.id,
    title: product.title,
    source: "purchase",
  });
  if (libErr && libErr.code !== "23505") {
    console.error("[store] library insert failed", libErr);
    if (createdAthlete) await service.from("athletes").delete().eq("id", athleteId);
    return fail("Could not add the programme to the library");
  }
  await service.from("programme_purchases").update({ athlete_id: athleteId }).eq("id", purchase.id);

  const token = await tokenFor(athleteId);
  const appUrl = token ? `${origin}/a/${token}/programmes` : origin;
  const storeName = org.store_name || org.name || "VIS BUILD";

  if (email) {
    await sendEmail({
      to: [email],
      subject: `You're in: ${programmeTitle}`,
      fromName: storeName,
      html: simpleEmailHtml({
        brand: storeName,
        heading: `Thanks for buying ${programmeTitle}`,
        paragraphs: [
          `Your programme is waiting in your training app. Open it, go to <b>My Programmes</b> and press <b>Start</b> when you're ready - every session will appear on your calendar from that day.`,
          "Bookmark the link or add it to your home screen: it's your personal login, so don't share it.",
        ],
        button: { label: "Open my training app", url: appUrl },
        footer: `Paid ${fmtPrice(purchase.amount_pence, purchase.currency)}. Questions? Just reply to this email.`,
      }),
      text: `Thanks for buying ${programmeTitle}. Open your training app and press Start when you're ready: ${appUrl}`,
    });
  }

  const coaches = await orgCoaches(service, org.id);
  await sendPushToCoaches(coaches.map((c) => c.id), {
    title: `New sale: ${programmeTitle}`,
    body: `${purchase.buyer_name || email || "A customer"} paid ${fmtPrice(purchase.amount_pence, purchase.currency)}`,
    url: "/shop",
  }).catch(() => {});

  return { status: "paid", athleteToken: token, programmeTitle };
}
