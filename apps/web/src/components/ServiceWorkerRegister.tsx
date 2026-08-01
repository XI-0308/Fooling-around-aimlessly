"use client";

import { useEffect } from "react";
import { ensureServiceWorker } from "@/lib/webPush";

/** 尽早注册 SW，供 Web Push 在后台接收 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    void ensureServiceWorker();
  }, []);
  return null;
}
