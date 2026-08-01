"use client";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import { XProvider } from "@ant-design/x";
import { theme as antTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useEffect, useMemo, useState } from "react";
import { CHAT_THEME_EVENT } from "@/lib/chatTheme";

function readCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function buildAntdThemeConfig() {
  const uiFont = parseFloat(readCssVar("--chat-ui-font-size", "14")) || 14;
  return {
    algorithm: antTheme.darkAlgorithm,
    token: {
      colorPrimary: readCssVar("--accent", "#7c3aed"),
      colorBgContainer: readCssVar("--app-surface", "#161922"),
      colorBgElevated: readCssVar("--app-surface", "#161922"),
      colorBgLayout: readCssVar("--app-bg", "#0f1117"),
      colorBorder: readCssVar("--app-border", "#2a2f3a"),
      colorText: readCssVar("--app-text", "#e8eaed"),
      colorTextSecondary: readCssVar("--muted", "#9ca3af"),
      colorLink: readCssVar("--app-link", "#a78bfa"),
      colorLinkHover: readCssVar("--app-link-hover", "#c4b5fd"),
      borderRadius: 12,
      fontSize: uiFont,
      fontFamily:
        '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    },
    components: {
      Bubble: {
        colorBgContainer: readCssVar("--app-surface", "#161922"),
      },
      Sender: {
        colorBgContainer: readCssVar("--chat-input-bg", "#12151c"),
      },
    },
  };
}

/** Ant Design X 主题：跟随装饰页 CSS 变量，保存后立即生效 */
export default function AntdProviders({ children }: { children: React.ReactNode }) {
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    const refresh = () => setThemeTick((n) => n + 1);
    refresh();
    window.addEventListener(CHAT_THEME_EVENT, refresh);
    return () => window.removeEventListener(CHAT_THEME_EVENT, refresh);
  }, []);

  const xTheme = useMemo(() => buildAntdThemeConfig(), [themeTick]);

  return (
    <AntdRegistry>
      <XProvider locale={zhCN} theme={xTheme}>
        {children}
      </XProvider>
    </AntdRegistry>
  );
}
