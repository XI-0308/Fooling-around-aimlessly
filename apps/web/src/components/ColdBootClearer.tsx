"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __efClearColdBoot?: () => void;
  }
}

/** 仅导出清除方法；不在挂载时自动清掉，避免 PWA 跳转空窗期只剩黑底 */
export default function ColdBootClearer() {
  useEffect(() => {
    // 保底：15 秒后若业务层仍未清除，交给冷启动脚本里的「重试」按钮
  }, []);
  return null;
}

export function clearColdBootNow() {
  if (typeof window !== "undefined") window.__efClearColdBoot?.();
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return (
      ios ||
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      /source=pwa/i.test(window.location.search)
    );
  } catch {
    return false;
  }
}

/** PWA / 独立窗口用整页跳转，避免客户端软路由留下黑屏 */
export function navigateAfterAuth(path: string) {
  clearColdBootNow();
  if (isStandaloneDisplay()) {
    window.location.assign(path);
    return;
  }
  // 非独立模式由调用方 router.replace；这里仅作兜底
  window.location.assign(path);
}
