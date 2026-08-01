"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  applyAppBadge,
  applyDocumentTitleBadge,
  getLastNotifiedAt,
  isHeartbeatNotifyEnabled,
  notificationPermission,
  requestHeartbeatNotifyPermission,
  setLastNotifiedAt,
  showHeartbeatNotification,
  formatCharacterPreview,
} from "@/lib/heartbeatNotify";

type ProactiveChatUnread = {
  chatId: string;
  count: number;
  preview: string;
  latestAt?: string;
};

type ProactiveStatus = {
  unreadCount: number;
  chats: ProactiveChatUnread[];
};

type ProactiveUnreadContextValue = {
  unreadCount: number;
  chats: ProactiveChatUnread[];
  refresh: () => Promise<void>;
  markSeen: () => Promise<void>;
  ensureNotifyPermission: () => Promise<void>;
};

type InAppToast = {
  title: string;
  preview: string;
  chatId?: string;
  latestAt: string;
};

const ProactiveUnreadContext = createContext<ProactiveUnreadContextValue>({
  unreadCount: 0,
  chats: [],
  refresh: async () => {},
  markSeen: async () => {},
  ensureNotifyPermission: async () => {},
});

export function useProactiveUnread() {
  return useContext(ProactiveUnreadContext);
}

function newestUnreadAt(chats: ProactiveChatUnread[]): string {
  let best = "";
  for (const c of chats || []) {
    if (c.latestAt && c.latestAt > best) best = c.latestAt;
  }
  return best;
}

export function ProactiveUnreadProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ProactiveStatus>({ unreadCount: 0, chats: [] });
  const [toast, setToast] = useState<InAppToast | null>(null);
  const primedRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);

  const ensureNotifyPermission = useCallback(async () => {
    if (!isHeartbeatNotifyEnabled()) return;
    const perm = notificationPermission();
    if (perm === "unsupported" || perm === "granted" || perm === "denied") return;
    await requestHeartbeatNotifyPermission();
  }, []);

  const showInAppToast = useCallback((input: InAppToast) => {
    setToast(input);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 12_000);
  }, []);

  const maybeNotify = useCallback(
    (data: ProactiveStatus) => {
      const next = data.unreadCount || 0;
      if (next <= 0 || !isHeartbeatNotifyEnabled()) return;

      const top = data.chats?.[0];
      const latestAt = newestUnreadAt(data.chats) || top?.latestAt || "";
      if (!latestAt) return;

      const lastNotified = getLastNotifiedAt();
      if (lastNotified && latestAt <= lastNotified) return;

      const title = "Encore Flow";
      const preview = formatCharacterPreview(top?.preview || "");

      const fire = () => {
        // 系统弹窗：只要授权就弹（含人在聊天页——后台冻住后再打开常停在聊天页，旧逻辑会误跳过）
        if (notificationPermission() === "granted") {
          showHeartbeatNotification({
            unreadCount: next,
            preview,
            chatId: top?.chatId,
          });
        }
        // 页内条：系统通知被拒/冻醒后也至少有一条能看见的提醒
        showInAppToast({
          title,
          preview,
          chatId: top?.chatId,
          latestAt,
        });
        setLastNotifiedAt(latestAt);
      };

      if (notificationPermission() === "default" && !primedRef.current) {
        primedRef.current = true;
        void requestHeartbeatNotifyPermission().then((p) => {
          if (p === "granted") {
            showHeartbeatNotification({
              unreadCount: next,
              preview,
              chatId: top?.chatId,
            });
          }
          showInAppToast({ title, preview, chatId: top?.chatId, latestAt });
          setLastNotifiedAt(latestAt);
        });
        return;
      }

      fire();
    },
    [showInAppToast]
  );

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<ProactiveStatus>("/proactive/status");
      const next = data.unreadCount || 0;

      setStatus(data);
      applyAppBadge(next);
      applyDocumentTitleBadge(next);
      maybeNotify(data);
    } catch {
      /* 未登录或网络暂不可用时忽略 */
    }
  }, [maybeNotify]);

  const markSeen = useCallback(async () => {
    try {
      await apiFetch("/proactive/seen", { method: "POST" });
      setStatus({ unreadCount: 0, chats: [] });
      applyAppBadge(0);
      applyDocumentTitleBadge(0);
      setLastNotifiedAt(new Date().toISOString());
      setToast(null);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onPageShow = () => void refresh();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onPageShow);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onPageShow);
      window.removeEventListener("pageshow", onPageShow);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      unreadCount: status.unreadCount,
      chats: status.chats,
      refresh,
      markSeen,
      ensureNotifyPermission,
    }),
    [status, refresh, markSeen, ensureNotifyPermission]
  );

  return (
    <ProactiveUnreadContext.Provider value={value}>
      {children}
      {toast ? (
        <div className="heartbeat-toast" role="status">
          <Link
            href={toast.chatId ? `/chat/${toast.chatId}` : "/chat"}
            className="heartbeat-toast-link"
            onClick={() => setToast(null)}
          >
            <strong>{toast.title}</strong>
            <span>{toast.preview}</span>
          </Link>
          <button type="button" className="heartbeat-toast-close" aria-label="关闭" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      ) : null}
    </ProactiveUnreadContext.Provider>
  );
}
