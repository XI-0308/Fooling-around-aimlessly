"use client";

import { useEffect } from "react";

function isComposerTarget(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  return Boolean(el.closest(".chat-input-bar, .chat-input-wrap, .msg-edit"));
}

function isStandaloneMode(): boolean {
  if (typeof document === "undefined") return false;
  if (document.documentElement.classList.contains("standalone-mode")) return true;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
  } catch {
    /* ignore */
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * 手机键盘：把聊天沉浸壳高度缩到 visualViewport。
 *
 * iPhone 桌面图标（standalone）坑点：
 * 1) 键盘弹起时 innerHeight 常与 vv.height 一起变矮 → 用「收起基线」判断
 * 2) 缩壳时要 scrollTo(0,0)，否则会和 iOS 焦点滚动叠成两次上顶
 * 3) 失焦后必须强制复位；若基线被 innerHeight 抬太高，会永远判定键盘开着 → 底部黑条
 */
export function useMobileKeyboardLayout(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    const viewport = vv;

    let raf = 0;
    let retryTimers: number[] = [];
    let wasOpen = false;
    let composerFocused = false;
    /** 仅用 vv 高度作基线，避免 innerHeight 把基线抬飞 */
    let closedHeight = Math.round(viewport.height);

    function clearRetryTimers() {
      for (const t of retryTimers) window.clearTimeout(t);
      retryTimers = [];
    }

    function resetShellInline() {
      const shell = document.querySelector(".app-shell-chat-immersive") as HTMLElement | null;
      if (!shell) return;
      shell.style.removeProperty("top");
      shell.style.removeProperty("left");
      shell.style.removeProperty("right");
      shell.style.removeProperty("bottom");
      shell.style.removeProperty("width");
      shell.style.removeProperty("height");
      shell.style.removeProperty("max-height");
      shell.style.removeProperty("transform");
      shell.style.removeProperty("inset");
    }

    function clearExtras() {
      const bar = document.querySelector(".chat-input-wrap") as HTMLElement | null;
      if (bar) {
        bar.style.removeProperty("position");
        bar.style.removeProperty("top");
        bar.style.removeProperty("left");
        bar.style.removeProperty("right");
        bar.style.removeProperty("width");
        bar.style.removeProperty("bottom");
        bar.style.removeProperty("z-index");
        bar.classList.remove("chat-input-wrap-pinned");
      }
      root.style.removeProperty("--composer-pin-space");
      root.style.removeProperty("--keyboard-input-lift");
      root.style.removeProperty("--vv-page-lift");
      root.style.removeProperty("--vv-top");
      root.style.removeProperty("--vv-left");
      root.style.removeProperty("--vv-width");
      root.style.removeProperty("--ios-form-accessory");
      resetShellInline();
    }

    function closeKeyboardLayout(height: number, offsetTop: number) {
      const closing = wasOpen;
      wasOpen = false;
      clearRetryTimers();
      root.classList.remove("keyboard-open");
      root.style.removeProperty("--vv-height");
      root.style.removeProperty("--vv-offset-top");
      root.style.removeProperty("--vv-keyboard-gap");
      clearExtras();
      closedHeight = Math.round(height);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => window.scrollTo(0, 0));

      if (closing) {
        window.dispatchEvent(
          new CustomEvent("rp-keyboard-layout", {
            detail: { keyboardOpen: false, gap: 0, height, offsetTop, closing: true },
          })
        );
      }
    }

    /** 防止 vv 瞬时报过小；键盘+输入法条通常不超过屏高约 55% */
    function clampShellHeight(vvHeight: number): number {
      const maxCover = Math.round(Math.min(420, closedHeight * 0.55));
      const minShell = Math.max(300, closedHeight - maxCover);
      return Math.min(closedHeight, Math.max(vvHeight, minShell));
    }

    function apply(opts?: { fromFocus?: boolean }) {
      const height = Math.round(viewport.height);
      const offsetTop = Math.max(0, Math.round(viewport.offsetTop));
      const focused =
        composerFocused || opts?.fromFocus || isComposerTarget(document.activeElement);

      // 没在输入：一律拉满，并校准基线（消除底部黑条）
      if (!focused) {
        closeKeyboardLayout(height, offsetTop);
        return;
      }

      const gapFromBaseline = Math.max(0, closedHeight - height);
      const gapFromInner = Math.max(0, window.innerHeight - height - offsetTop);
      const gap = Math.max(gapFromBaseline, gapFromInner);
      const keyboardOpen = gapFromBaseline > 100 || gapFromInner > 100;

      if (!keyboardOpen) {
        // 聚焦但键盘尚未起来 / 已几乎收起：保持满屏，不要提前缩
        if (wasOpen) {
          closeKeyboardLayout(Math.max(height, closedHeight), offsetTop);
          closedHeight = Math.max(closedHeight, height);
        }
        return;
      }

      // 图标模式：若 innerHeight 已随键盘收缩，取与 vv 的较大值，填掉「假网址栏」黑缝
      // 浏览器标签页不走这条（避免和 Safari 底栏抢位）
      let rawH = height;
      if (isStandaloneMode()) {
        const inner = window.innerHeight;
        if (inner < closedHeight - 80) {
          rawH = Math.max(height, inner);
        }
      }

      const shellH = clampShellHeight(rawH);
      root.style.setProperty("--vv-height", `${shellH}px`);
      root.style.setProperty("--vv-offset-top", `${offsetTop}px`);
      root.style.setProperty("--vv-keyboard-gap", `${gap}px`);
      root.classList.add("keyboard-open");
      wasOpen = true;

      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => window.scrollTo(0, 0));

      if (opts?.fromFocus) {
        clearRetryTimers();
        retryTimers.push(window.setTimeout(() => apply(), 100));
        retryTimers.push(window.setTimeout(() => apply(), 280));
        retryTimers.push(window.setTimeout(() => apply(), 480));
      }

      window.dispatchEvent(
        new CustomEvent("rp-keyboard-layout", {
          detail: { keyboardOpen: true, gap, height: shellH, offsetTop },
        })
      );
    }

    function onViewportChange() {
      apply();
    }

    function onComposerFocus() {
      composerFocused = true;
      apply({ fromFocus: true });
    }

    function onFocusIn(ev: FocusEvent) {
      if (!isComposerTarget(ev.target)) return;
      composerFocused = true;
      apply({ fromFocus: true });
    }

    function onFocusOut(ev: FocusEvent) {
      if (!isComposerTarget(ev.target)) return;
      window.setTimeout(() => {
        if (isComposerTarget(document.activeElement)) {
          composerFocused = true;
          return;
        }
        composerFocused = false;
        apply();
      }, 60);
    }

    vv.addEventListener("resize", onViewportChange);
    vv.addEventListener("scroll", onViewportChange);
    window.addEventListener("rp-composer-focus", onComposerFocus);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    apply();

    return () => {
      cancelAnimationFrame(raf);
      clearRetryTimers();
      vv.removeEventListener("resize", onViewportChange);
      vv.removeEventListener("scroll", onViewportChange);
      window.removeEventListener("rp-composer-focus", onComposerFocus);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      root.classList.remove("keyboard-open");
      root.style.removeProperty("--vv-height");
      root.style.removeProperty("--vv-offset-top");
      root.style.removeProperty("--vv-keyboard-gap");
      clearExtras();
    };
  }, [enabled]);
}
