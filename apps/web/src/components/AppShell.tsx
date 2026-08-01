"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import AppSidebarNav from "@/components/AppSidebarNav";
import EncoreIcon from "@/components/EncoreIcon";
import IdleSessionGuard from "@/components/IdleSessionGuard";
import { ProactiveUnreadProvider } from "@/components/ProactiveUnreadProvider";
import { useProtectedAuth } from "@/hooks/useProtectedAuth";
import { findNavItem, navActiveKey } from "@/lib/encoreNav";

type AppShellApi = { openDrawer: () => void };

const AppShellApiContext = createContext<AppShellApi | null>(null);

export function useAppShellApi(): AppShellApi {
  const ctx = useContext(AppShellApiContext);
  return ctx ?? { openDrawer: () => {} };
}

export default function AppShell({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <ProactiveUnreadProvider>
      <AppShellInner title={title}>{children}</AppShellInner>
    </ProactiveUnreadProvider>
  );
}

function AppShellInner({ children, title }: { children: React.ReactNode; title: string }) {
  const pathname = usePathname();
  const { phase, error, retry } = useProtectedAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isChatDetail = /^\/chat\/[^/]+$/.test(pathname);
  const activeNav = findNavItem(navActiveKey(pathname));

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  function menuBtn(label: string, extraClass?: string) {
    return (
      <span className={`topbar-menu-btn-wrap${extraClass ? ` ${extraClass}` : ""}`}>
        <button
          type="button"
          className="topbar-menu-btn"
          aria-label={label}
          onClick={() => setDrawerOpen(true)}
        >
          ☰
        </button>
      </span>
    );
  }

  if (phase === "loading" || phase === "unauthenticated") {
    return (
      <div className="login-page auth-boot-page" role="status">
        <div className="card login-card auth-boot-card">
          <h1 className="login-brand">WE-E</h1>
          <p className="auth-boot-hint">加载中…</p>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="login-page auth-boot-page">
        <div className="card login-card auth-boot-card">
          <h1 className="login-brand">WE-E</h1>
          <p className="error">{error || "暂时连不上服务器"}</p>
          <p className="hint">网络恢复后点重试即可，不必退出桌面图标。</p>
          <button type="button" className="btn btn-outline" style={{ width: "100%" }} onClick={retry}>
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <AppShellApiContext.Provider value={{ openDrawer: () => setDrawerOpen(true) }}>
    <div className={`app-shell${isChatDetail ? " app-shell-chat-immersive" : ""}`}>
      <IdleSessionGuard />
      {drawerOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="关闭菜单"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside className={`sidebar${drawerOpen ? " sidebar-open" : ""}`}>
        <div className="sidebar-brand"><span className="login-brand">WE-E</span></div>
        <div className="sidebar-nav">
          <AppSidebarNav onNavigate={() => setDrawerOpen(false)} />
        </div>
      </aside>

      <div className="main">
        {!isChatDetail && (
        <header className="topbar">
          {menuBtn("打开菜单")}
          <h1 className="topbar-title">
            {activeNav ? (
              <span className="topbar-title-inner">
                <EncoreIcon color={activeNav.color} size={22}>
                  <activeNav.Icon />
                </EncoreIcon>
                <span>{title}</span>
              </span>
            ) : (
              title
            )}
          </h1>
        </header>
        )}
        <div className={`content${isChatDetail ? "" : " content-scrollable"}`}>{children}</div>
      </div>
    </div>
    </AppShellApiContext.Provider>
  );
}
