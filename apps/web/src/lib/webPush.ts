/** 客户端 Web Push 订阅（锁屏真推送） */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isWebPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return reg;
  } catch (err) {
    console.warn("[webPush] SW 注册失败:", err);
    return null;
  }
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  const reg = await ensureServiceWorker();
  if (!reg) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeWebPush(apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!isWebPushSupported()) {
    return { ok: false, message: "当前环境不支持 Web Push（请用 HTTPS 或本机，并尽量用「添加到主屏幕」的 PWA）。" };
  }
  if (Notification.permission === "denied") {
    return { ok: false, message: "通知权限已被拒绝，请到系统设置里允许后再试。" };
  }
  if (Notification.permission !== "granted") {
    const p = await Notification.requestPermission();
    if (p !== "granted") {
      return { ok: false, message: "需要允许通知权限才能开启锁屏推送。" };
    }
  }

  const reg = await ensureServiceWorker();
  if (!reg) {
    return { ok: false, message: "Service Worker 注册失败，无法订阅推送。" };
  }

  const { publicKey } = await apiFetch<{ publicKey: string }>("/push/vapid-public-key");
  if (!publicKey) {
    return { ok: false, message: "服务器未返回 VAPID 公钥。" };
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  const json = sub.toJSON();
  await apiFetch("/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      expirationTime: json.expirationTime ?? null,
      keys: json.keys,
    }),
  });

  return { ok: true, message: "锁屏推送已订阅。杀掉 App 后角色来找你，系统仍可能弹窗。" };
}

export async function unsubscribeWebPush(apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>): Promise<void> {
  const sub = await getCurrentPushSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch {
    /* ignore */
  }
  try {
    await apiFetch("/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    /* ignore */
  }
}
