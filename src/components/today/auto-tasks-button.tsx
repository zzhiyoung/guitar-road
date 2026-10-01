"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateAutoTasksAction } from "@/app/actions/tasks";
export function AutoTasksButton({ hasFrequentBlocks }: { hasFrequentBlocks: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  if (!hasFrequentBlocks) return null;
  return <div className="text-right"><button type="button" className="btn btn-sm btn-ghost" disabled={pending} onClick={() => startTransition(async () => {
    try { const result = await generateAutoTasksAction(); setMessage(result.message ?? "今日任务已更新"); router.refresh(); }
    catch { setMessage("暂时无法安排任务，请重试。"); }
  })} title="按各练习段落设置的每周频率补齐今日任务">{pending ? "安排中…" : "按练习频率安排 ↻"}</button>{message ? <p className="max-w-60 text-[11px] text-muted" role="status">{message}</p> : null}</div>;
}
