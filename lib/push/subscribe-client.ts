"use client";

// Shared by both the coach dashboard and the athlete share-link app -
// only the endpoint each posts to differs. Registers the push-only
// service worker (public/sw.js) if not already, requests Notification
// permission, subscribes via the standard Push API, then hands the
// subscription to the caller to persist against whichever identity
// applies (coach session vs athlete share token).

export type SubscribeResult = "subscribed" | "unsupported" | "denied" | "error";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function subscribeToPush(
  postSubscription: (sub: PushSubscriptionJSON) => Promise<void>
): Promise<SubscribeResult> {
  if (!isPushSupported()) return "unsupported";
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return "unsupported";

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";

    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));

    await postSubscription(sub.toJSON() as PushSubscriptionJSON);
    return "subscribed";
  } catch {
    return "error";
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  const sub = await currentPushSubscription();
  if (sub) await sub.unsubscribe();
}
