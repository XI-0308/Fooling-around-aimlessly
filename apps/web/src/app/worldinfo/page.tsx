"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 世界书已合并进记忆库 · 语意记忆，保留旧路径跳转 */
export default function WorldInfoRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/memory?section=semantic");
  }, [router]);
  return (
    <p className="hint" style={{ padding: 24 }}>
      正在跳转到记忆库…
    </p>
  );
}
