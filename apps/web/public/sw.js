/* Encore Flow · Web Push Service Worker
 * 锁屏 / 杀进程后仍可由系统推送通道唤醒并弹通知。
 */
/* eslint-disable no-restricted-globals */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {
    title: "\u200b",
    body: "角色：点开看看",
    url: "/chat",
    tag: "ef-heartbeat",
    unreadCount: 1,
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    try {
      const text = event.data?.text();
      if (text) data.body = `角色：${text.slice(0, 100)}`;
    } catch {
      /* ignore */
    }
  }

  const title = data.title || "\u200b";
  const options = {
    body: data.body || "",
    icon: "/pwa-icon/192",
    badge: "/pwa-icon/192",
    tag: data.tag || "ef-heartbeat",
    renotify: true,
    data: { url: data.url || "/chat" },
    vibrate: [120, 60, 120],
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      const n = Number(data.unreadCount) || 1;
      if (n > 0 && self.registration.setAppBadge) {
        try {
          await self.registration.setAppBadge(n);
        } catch {
          /* ignore */
        }
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/chat";
  const path = typeof raw === "string" && raw.startsWith("/") ? raw : "/chat";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && typeof client.navigate === "function") {
            try {
              await client.navigate(path);
            } catch {
              /* ignore */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(path);
      }
    })()
  );
});
