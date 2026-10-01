"use client";

import { useEffect } from "react";

/**
 * SPEC §7.0 PWA 能力本地阶段即启用。
 * 只在生产环境注册，避免 next dev 下 Service Worker 缓存干扰热更新。
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const timer = window.setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* PWA 注册失败不影响核心练习流程 */
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
