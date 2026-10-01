"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function SessionDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>('input[type="number"]')?.focus();
    return () => { dialog?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="session-dialog" aria-labelledby="session-dialog-title" onCancel={e => { e.preventDefault(); onClose(); }}>{children}</dialog>;
}
