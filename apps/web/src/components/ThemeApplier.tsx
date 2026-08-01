"use client";

import { useEffect } from "react";
import { applyThemeToDocument, loadFullChatTheme, subscribeChatTheme } from "@/lib/chatTheme";

const RELOAD_DEBOUNCE_MS = 2500;

/** 启动时将装饰主题应用到全局 CSS 变量（含 IndexedDB 背景图）；前台恢复时节流重载 */
export default function ThemeApplier() {
  useEffect(() => {
    let cancelled = false;
    let debounceTimer: number | null = null;
    let lastReloadAt = 0;

    const runReload = () => {
      if (cancelled) return;
      lastReloadAt = Date.now();
      void loadFullChatTheme().then((theme) => {
        if (!cancelled) applyThemeToDocument(theme);
      });
    };

    const scheduleReload = () => {
      const elapsed = Date.now() - lastReloadAt;
      if (elapsed >= RELOAD_DEBOUNCE_MS) {
        runReload();
        return;
      }
      if (debounceTimer != null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(runReload, RELOAD_DEBOUNCE_MS - elapsed);
    };

    runReload();

    const unsub = subscribeChatTheme(runReload);

    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleReload();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", scheduleReload);
    // 不再监听 focus：手机 Edge 切键盘/标签会频繁触发，放大未登录 sync 风险

    return () => {
      cancelled = true;
      unsub();
      if (debounceTimer != null) window.clearTimeout(debounceTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", scheduleReload);
    };
  }, []);

  return null;
}
