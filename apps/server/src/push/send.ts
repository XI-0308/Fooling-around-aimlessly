import webpush from "web-push";
import { ensureWebPushConfigured } from "./vapid.js";
import {
  listPushSubscriptions,
  removePushSubscriptionByEndpoints,
  type StoredPushSubscription,
} from "./store.js";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  unreadCount?: number;
}

function toWebPushSub(s: StoredPushSubscription) {
  return {
    endpoint: s.endpoint,
    expirationTime: s.expirationTime ?? undefined,
    keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
  };
}

/** 向所有已订阅设备发送 Web Push（锁屏/杀进程仍可能送达） */
export async function sendWebPushToAll(payload: PushPayload): Promise<{
  sent: number;
  failed: number;
  removed: number;
  lastError?: string;
}> {
  ensureWebPushConfigured();
  const subs = listPushSubscriptions();
  if (subs.length === 0) {
    return { sent: 0, failed: 0, removed: 0 };
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/chat",
    tag: payload.tag || "ef-heartbeat",
    unreadCount: payload.unreadCount ?? 1,
  });

  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;
  const stale: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(toWebPushSub(sub), body, {
          TTL: 60 * 60 * 12,
          urgency: "high",
        });
        sent += 1;
      } catch (err: unknown) {
        failed += 1;
        const status =
          err && typeof err === "object" && "statusCode" in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        const errBody =
          err && typeof err === "object" && "body" in err
            ? String((err as { body?: string }).body || "")
            : "";
        lastError =
          `${status || "?"} ${err instanceof Error ? err.message : "push failed"}` +
          (errBody ? ` ${errBody}` : "");
        // 410 Gone / 404：订阅失效
        if (status === 404 || status === 410) {
          stale.push(sub.endpoint);
        } else {
          console.warn("[push] 发送失败:", lastError);
        }
      }
    })
  );

  if (stale.length) removePushSubscriptionByEndpoints(stale);
  if (sent > 0 || failed > 0) {
    console.log(
      `[push] 推送完成 sent=${sent} failed=${failed} removed=${stale.length} title=${JSON.stringify(payload.title)}`
    );
  }
  return { sent, failed, removed: stale.length, lastError };
}
