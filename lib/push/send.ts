// Server-only Web Push sending — never import from a "use client"
// file. Uses the standard Push API (VAPID), not a third-party push
// service: free at any scale, delivered via each browser's own push
// service (Chrome/Firefox/Edge natively, Safari via VAPID since 16,
// including installed PWAs on iOS 16.4+).
import webpush from "web-push";
import { createServiceRoleClient } from "@/lib/supabase-service";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("Push notifications are not configured (missing VAPID env vars)");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string; // opened on notification click, see public/sw.js
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Sends to every subscribed device for the given rows, dropping any
// subscription the push service reports as gone (404/410 — the
// browser unsubscribed, the device was reset, etc.) rather than
// leaving a dead row to keep failing forever. Never throws — a push
// failure should never break the caller's actual write (logging a
// set, detecting a PB), so every error is swallowed after cleanup.
async function sendToRows(rows: SubscriptionRow[], payload: PushPayload) {
  if (!rows.length) return;
  try {
    ensureConfigured();
  } catch {
    // VAPID env vars not set (e.g. local dev without them) - a
    // notification failing to configure should never break the write
    // that triggered it.
    return;
  }
  const service = createServiceRoleClient();
  const body = JSON.stringify(payload);

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body
        );
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await service.from("push_subscriptions").delete().eq("id", row.id);
        }
        // Any other error (network blip, push service hiccup) - leave
        // the subscription in place, just skip this send.
      }
    })
  );
}

export async function sendPushToCoaches(coachIds: string[], payload: PushPayload) {
  if (!coachIds.length) return;
  const service = createServiceRoleClient();
  const { data } = await service
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("subscriber_type", "coach")
    .in("coach_id", coachIds);
  await sendToRows(data ?? [], payload);
}

// PB alerts go to every coach in the athlete's org who hasn't turned
// this specific notification off (not just one "assigned" coach) -
// there's no per-athlete coach assignment concept in this app, any
// coach on the team can see any athlete (see CLAUDE.md's architecture
// note). notify_pb (0062) is separate from being subscribed to push
// at all - a coach can keep push on but turn off just PB alerts.
export async function notifyCoachesOfPB(organisationId: string, payload: PushPayload) {
  const service = createServiceRoleClient();
  const { data: coaches } = await service
    .from("coaches")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("archived", false)
    .eq("notify_pb", true);
  await sendPushToCoaches((coaches ?? []).map((c) => c.id), payload);
}

export async function sendPushToAthlete(athleteId: string, payload: PushPayload) {
  const service = createServiceRoleClient();
  const { data } = await service
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("subscriber_type", "athlete")
    .eq("athlete_id", athleteId);
  await sendToRows(data ?? [], payload);
}
