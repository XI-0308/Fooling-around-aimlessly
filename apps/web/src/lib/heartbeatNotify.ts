/** Heartbeat / 主动消息：角标 + 系统通知（页面存活时） */

import { LEGACY_CHAR } from "./legacyNames";

export const HEARTBEAT_NOTIFY_KEY = "ef_heartbeat_system_notify";
export const HEARTBEAT_NOTIFY_ASKED_KEY = "ef_heartbeat_notify_asked";
/** 已为哪条主动消息弹过窗（ISO createdAt）；v2：取消「在聊天页不弹」误跳过 */
export const HEARTBEAT_LAST_NOTIFIED_AT_KEY = "ef_heartbeat_last_notified_at_v2";

export function getLastNotifiedAt(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(HEARTBEAT_LAST_NOTIFIED_AT_KEY) || "";
  } catch {
    return "";
  }
}

export function setLastNotifiedAt(iso: string): void {
  if (!iso) return;
  try {
    localStorage.setItem(HEARTBEAT_LAST_NOTIFIED_AT_KEY, iso);
  } catch {
    /* ignore */
  }
}

export function isHeartbeatNotifyEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = localStorage.getItem(HEARTBEAT_NOTIFY_KEY);
    if (v === null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

export function setHeartbeatNotifyEnabled(on: boolean): void {
  try {
    localStorage.setItem(HEARTBEAT_NOTIFY_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestHeartbeatNotifyPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  try {
    localStorage.setItem(HEARTBEAT_NOTIFY_ASKED_KEY, "1");
  } catch {
    /* ignore */
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function applyAppBadge(count: number): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0 && typeof nav.setAppBadge === "function") {
    void nav.setAppBadge(count).catch(() => {});
  } else if (typeof nav.clearAppBadge === "function") {
    void nav.clearAppBadge().catch(() => {});
  }
}

const TITLE_BADGE_RE = /^\(\d+\)\s+/;

/** 标签页标题角标（不支持 App Badge 时的兜底） */
export function applyDocumentTitleBadge(count: number): void {
  if (typeof document === "undefined") return;
  const raw = document.title.replace(TITLE_BADGE_RE, "");
  document.title = count > 0 ? `(${count}) ${raw}` : raw;
}

/** 通知预览前缀：优先角色名，否则「角色」；兼容旧 legacy char 前缀 */
export function formatCharacterPreview(preview: string, characterName?: string): string {
  const raw = (preview || "点开看看").replace(/\s+/g, " ").trim().slice(0, 100);
  const prefix = characterName?.trim() || "角色";
  if (raw.startsWith(`${LEGACY_CHAR}：`) || raw.startsWith(`${LEGACY_CHAR}:`)) {
    return `${prefix}：${raw.replace(new RegExp(`^${LEGACY_CHAR}[：:]`), "")}`;
  }
  if (
    raw.startsWith("角色：") ||
    raw.startsWith("角色:") ||
    (characterName &&
      (raw.startsWith(`${characterName}：`) || raw.startsWith(`${characterName}:`)))
  ) {
    return raw;
  }
  return `${prefix}：${raw}`;
}

export function showHeartbeatNotification(input: {
  unreadCount: number;
  preview?: string;
  chatId?: string;
  characterName?: string;
}): void {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (!isHeartbeatNotifyEnabled()) return;
  if (Notification.permission !== "granted") return;

  const title = "Encore Flow";
  const body = formatCharacterPreview(input.preview || "", input.characterName);

  try {
    const opts: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
      body,
      tag: "ef-heartbeat",
      renotify: true,
      icon: "/pwa-icon/192",
      badge: "/pwa-icon/192",
      vibrate: [120, 60, 120],
    };
    const n = new Notification(title, opts);
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      const path = input.chatId ? `/chat/${input.chatId}` : "/chat";
      if (window.location.pathname !== path) {
        window.location.assign(path);
      }
      n.close();
    };
  } catch {
    /* 部分 WebView 禁止构造 Notification */
  }
}
