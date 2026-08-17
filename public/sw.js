// Minimal push-only service worker — no offline caching/asset
// interception here on purpose. lib/save-queue.ts already handles
// offline write resilience at the app level (localStorage retry
// queue); a caching service worker is a separate, much bigger concern
// (stale asset risk on a fast-moving app) that isn't part of this
// feature. This worker exists solely so the browser has something to
// register for Push API + Notification API access, and so iOS Safari
// treats the app as installable (a prerequisite for push on iOS).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "VIS BUILD", body: event.data.text() };
  }
  const { title, body, url } = payload;
  event.waitUntil(
    self.registration.showNotification(title || "VIS BUILD", {
      body: body || "",
      icon: "/logo/vis-build-square.png",
      badge: "/logo/vis-build-square.png",
      data: { url: url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
