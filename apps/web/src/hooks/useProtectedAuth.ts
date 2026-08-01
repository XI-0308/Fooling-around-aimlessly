"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearColdBootNow, isStandaloneDisplay } from "@/components/ColdBootClearer";
import { apiFetch, isTransientFetchError } from "@/lib/api";

type AuthPhase = "loading" | "authenticated" | "unauthenticated" | "error";

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

/**
 * 受保护页面的登录门：网络失败 / 超时只展示重试，不踢回登录页（避免 PWA 黑屏环）。
 */
export function useProtectedAuth() {
  const router = useRouter();
  const [phase, setPhase] = useState<AuthPhase>("loading");
  const [error, setError] = useState("");

  const check = useCallback(() => {
    setPhase("loading");
    setError("");
    withTimeout(
      apiFetch<{ authenticated: boolean }>("/auth/status"),
      10000,
      "连接超时，请检查网络后重试"
    )
      .then((data) => {
        if (data.authenticated) {
          setPhase("authenticated");
          clearColdBootNow();
          try {
            sessionStorage.removeItem("ef-pwa-chat-nav");
          } catch {
            /* ignore */
          }
          return;
        }
        setPhase("unauthenticated");
        clearColdBootNow();
        if (isStandaloneDisplay()) {
          window.location.assign("/");
        } else {
          router.replace("/");
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "无法确认登录状态";
        setError(msg);
        setPhase("error");
        clearColdBootNow();
        if (!isTransientFetchError(msg) && /未登录|401|403/.test(msg)) {
          if (isStandaloneDisplay()) window.location.assign("/");
          else router.replace("/");
        }
      });
  }, [router]);

  useEffect(() => {
    check();
  }, [check]);

  return { phase, error, retry: check };
}
