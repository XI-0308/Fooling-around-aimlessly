"use client";

import { useEffect } from "react";

/** 检测「添加到主屏幕」独立/全屏模式，给 html 加 class 以启用沉浸样式 */
export default function StandaloneBoot() {
  useEffect(() => {
    const standaloneMq = window.matchMedia("(display-mode: standalone)");
    const fullscreenMq = window.matchMedia("(display-mode: fullscreen)");
    const apply = () => {
      const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const immersive = standaloneMq.matches || fullscreenMq.matches || iosStandalone;
      document.documentElement.classList.toggle("standalone-mode", immersive);
      document.documentElement.classList.toggle("fullscreen-mode", fullscreenMq.matches);
    };
    apply();
    standaloneMq.addEventListener("change", apply);
    fullscreenMq.addEventListener("change", apply);
    return () => {
      standaloneMq.removeEventListener("change", apply);
      fullscreenMq.removeEventListener("change", apply);
    };
  }, []);

  return null;
}
