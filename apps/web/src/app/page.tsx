"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { clearColdBootNow, isStandaloneDisplay } from "@/components/ColdBootClearer";
import { apiFetch } from "@/lib/api";
import { touchLocalActivity } from "@/lib/sessionIdle";
import {
  chatThemeToCssVars,
  loadLoginPageTheme,
  subscribeChatTheme,
  type ChatTheme,
} from "@/lib/chatTheme";

function goChat(router: ReturnType<typeof useRouter>): boolean {
  clearColdBootNow();
  if (isStandaloneDisplay()) {
    try {
      const n = Number(sessionStorage.getItem("ef-pwa-chat-nav") || "0");
      if (n >= 2) {
        sessionStorage.removeItem("ef-pwa-chat-nav");
        return false;
      }
      sessionStorage.setItem("ef-pwa-chat-nav", String(n + 1));
    } catch {
      /* ignore */
    }
    window.location.assign("/chat");
    return true;
  }
  router.replace("/chat");
  return true;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** 背景单独一层，保证永远在登录框下面（避免 Edge 独立窗口叠层错乱） */
function LoginShell({
  theme,
  children,
}: {
  theme: ChatTheme | null;
  children: ReactNode;
}) {
  const hasBg = Boolean(theme?.loginBgImage);
  const pageVars = theme ? (chatThemeToCssVars(theme) as CSSProperties) : undefined;
  const bgStyle: CSSProperties | undefined = hasBg
    ? {
        backgroundImage: `url(${theme!.loginBgImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;

  return (
    <div
      className={hasBg ? "login-page login-page-has-bg" : "login-page"}
      style={pageVars}
    >
      {hasBg ? <div className="login-page-bg" style={bgStyle} aria-hidden /> : null}
      <div className="login-page-foreground">{children}</div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [bootError, setBootError] = useState("");
  const [theme, setTheme] = useState<ChatTheme | null>(null);

  useEffect(() => {
    loadLoginPageTheme().then(setTheme);
    return subscribeChatTheme(() => {
      void loadLoginPageTheme().then(setTheme);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBootError("");
    withTimeout(
      apiFetch<{ authenticated: boolean }>("/auth/status"),
      10000,
      "连接超时，请检查网络后重试"
    )
      .then((data) => {
        if (cancelled) return;
        if (data.authenticated) {
          const left = goChat(router);
          if (!left) {
            setBootError("自动进入受阻，请输入密码再进一次");
            setChecking(false);
            clearColdBootNow();
          }
        } else {
          clearColdBootNow();
          setChecking(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "无法确认登录状态";
        setBootError(msg);
        setChecking(false);
        clearColdBootNow();
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      touchLocalActivity();
      const left = goChat(router);
      if (!left) {
        setError("自动进入受阻，请再点一次进入");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  function retryStatus() {
    setChecking(true);
    setBootError("");
    withTimeout(
      apiFetch<{ authenticated: boolean }>("/auth/status"),
      10000,
      "连接超时，请检查网络后重试"
    )
      .then((data) => {
        if (data.authenticated) {
          const left = goChat(router);
          if (!left) {
            setBootError("自动进入受阻，请输入密码再进一次");
            setChecking(false);
            clearColdBootNow();
          }
        } else {
          clearColdBootNow();
          setChecking(false);
        }
      })
      .catch((err) => {
        setBootError(err instanceof Error ? err.message : "无法确认登录状态");
        setChecking(false);
        clearColdBootNow();
      });
  }

  if (checking) {
    return (
      <LoginShell theme={theme}>
        <div className="card login-card auth-boot-card" role="status">
          <h1 className="login-brand">WE-E</h1>
          <p className="auth-boot-hint">正在检查登录状态…</p>
        </div>
      </LoginShell>
    );
  }

  return (
    <LoginShell theme={theme}>
      <div className="card login-card">
        <h1 className="login-brand">WE-E</h1>
        {bootError ? (
          <>
            <p className="error">{bootError}</p>
            <p className="hint">服务器暂时不可达时会出现此提示；连上后点重试或直接登录。</p>
            <button
              type="button"
              className="btn btn-outline"
              style={{ width: "100%", marginBottom: "0.75rem" }}
              onClick={retryStatus}
            >
              重试连接
            </button>
          </>
        ) : null}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              aria-label="密码"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="error">{error}</p>}
          <div className="login-form-actions">
            <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? "登录中…" : "进入"}
            </button>
          </div>
        </form>
      </div>
    </LoginShell>
  );
}
