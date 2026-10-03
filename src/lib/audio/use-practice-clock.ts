"use client";

import { useEffect, useRef, useState } from "react";

/** Tab-local draft: navigation/refresh retain elapsed time, never time spent away. */
export function usePracticeClock(key: string) {
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const clock = useRef({ elapsed: 0, last: 0, paused: false, visible: false });
  const cleared = useRef(false);
  const save = () => {
    if (cleared.current) return;
    try { sessionStorage.setItem(key, JSON.stringify({ elapsed: clock.current.elapsed, paused: clock.current.paused })); }
    catch { /* Restricted browser storage: timing still works in memory. */ }
  };
  const flush = () => {
    const current = clock.current;
    const now = performance.now();
    if (!current.paused && current.visible && current.last) {
      // A suspended browser or sleeping computer must not count hours of absence.
      current.elapsed += Math.min(1500, Math.max(0, now - current.last));
    }
    current.last = now;
    setSeconds(Math.floor(current.elapsed / 1000));
    save();
  };
  useEffect(() => {
    const current = clock.current;
    Object.assign(current, { elapsed: 0, paused: false });
    cleared.current = false;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (saved && Number.isFinite(saved.elapsed) && saved.elapsed >= 0 && typeof saved.paused === "boolean") {
        current.elapsed = saved.elapsed; current.paused = saved.paused;
      }
    } catch { /* A malformed draft is ignored. */ }
    current.last = performance.now();
    current.visible = document.visibilityState === "visible";
    setSeconds(Math.floor(current.elapsed / 1000)); setPaused(current.paused);
    const visibility = () => { flush(); current.visible = document.visibilityState === "visible"; };
    const timer = window.setInterval(flush, 1000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", flush);
    return () => { flush(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", flush); };
  }, [key]);
  return {
    seconds, paused,
    setPaused: (next: boolean) => { flush(); clock.current.paused = next; setPaused(next); save(); },
    clear: () => { cleared.current = true; clock.current.elapsed = 0; clock.current.paused = true; try { sessionStorage.removeItem(key); } catch {} },
  };
}
