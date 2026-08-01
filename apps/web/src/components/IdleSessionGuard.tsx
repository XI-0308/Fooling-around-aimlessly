"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  clearLocalActivity,
  isLocallyIdle,
  SESSION_IDLE_MS,
  touchLocalActivity,
} from "@/lib/sessionIdle";

/** 前端无操作超时：到期自动退出并回到登录页 */
export default function IdleSessionGuard() {
  const router = useRouter();
  const loggingOutRef = useRef(false);

  useEffect(() => {
    touchLocalActivity();

    async function forceLogout() {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      clearLocalActivity();
      await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
      router.replace("/");
    }

    function checkIdle() {
      if (isLocallyIdle()) void forceLogout();
    }

    let lastTouch = Date.now();
    function onActivity() {
      const now = Date.now();
      if (now - lastTouch < 15_000) return;
      lastTouch = now;
      touchLocalActivity();
    }

    const events: (keyof WindowEventMap)[] = [
      "click",
      "keydown",
      "touchstart",
      "scroll",
      "mousemove",
    ];
    for (const event of events) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    function onVisibility() {
      if (document.visibilityState === "visible") checkIdle();
    }
    document.addEventListener("visibilitychange", onVisibility);

    const timer = window.setInterval(checkIdle, 60_000);
    checkIdle();

    return () => {
      for (const event of events) {
        window.removeEventListener(event, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [router]);

  return null;
}

export { SESSION_IDLE_MS };
