"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deferTaskAction, deleteTaskAction, setTaskStatusAction } from "@/app/actions/tasks";
import { Icon } from "@/components/studio";
import { FEELING_META, type Feeling } from "@/lib/domain/constants";
import { formatDuration, shortDateLabel } from "@/lib/domain/date";
import type { FormState } from "@/lib/domain/form-state";
export interface TaskCardData {
  taskId: string;
  blockId: string;
  blockName: string;
  songId: string;
  songTitle: string;
  artist: string | null;
  barStart: number;
  barEnd: number;
  isWholeSong: boolean;
  currentBpm: number;
  targetBpm: number;
  targetDurationMin: number | null;
  status: "todo" | "done" | "skipped";
  source: "manual" | "auto";
  deferredCount: number;
  recommendedStartBpm: number;
  lastSession: {
    date: string;
    bestBpm: number | null;
    finalBpm: number | null;
    durationMin: number;
    feeling: Feeling | null;
  } | null;
  sessionCount: number;
}


export function TaskCard({ data }: { data: TaskCardData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (e: PointerEvent) => { if (menu.current && !menu.current.contains(e.target as Node)) menu.current.open = false; };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape" && menu.current?.open) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, []);
  const run = (key: string, fn: () => Promise<FormState>) => {
    setBusy(key); setError(null); if (menu.current) menu.current.open = false;
    startTransition(async () => {
      try { const result = await fn(); if (result.status === "error") setError(result.message ?? "操作没有完成，请重试。"); else router.refresh(); }
      catch { setError("暂时无法更新任务，请重试。"); }
      finally { setBusy(null); }
    });
  };
  const finished = data.status !== "todo";
  return <article className="card task-card" aria-busy={pending}>
    <div className="task-body">
      <span className={`task-icon ${finished ? "finished" : ""}`}><Icon name={data.status === "done" ? "check" : data.status === "skipped" ? "pause" : "music"} /></span>
      <div className="task-copy">
        <h3><Link href={`/practice/${data.blockId}`} className="hover:text-accent">{data.blockName}</Link></h3>
        <p><Link href={`/library/${data.songId}`} className="hover:underline">{data.songTitle}</Link> · {data.currentBpm} → {data.targetBpm} BPM</p>
        <p>{data.status === "done" ? "今日任务已完成" : data.status === "skipped" ? "今天暂时跳过，按自己的节奏来。" : `建议从 ${data.recommendedStartBpm} BPM 开始`}</p>
      </div>
      <div className="task-actions">
        <Link href={`/practice/${data.blockId}`} className={`btn ${finished ? "btn-ghost" : "btn-soft"}`}>{data.status === "done" ? "再练一轮" : "开始练习"}</Link>
        <details ref={menu} className="task-menu">
          <summary aria-label={`更多任务操作：${data.blockName}`}><Icon name="more" /></summary>
          <div className="task-menu-panel">
            <button type="button" disabled={pending} onClick={() => run(data.status === "done" ? "todo" : "done", () => setTaskStatusAction(data.taskId, data.status === "done" ? "todo" : "done"))}>{data.status === "done" ? "撤销完成" : "标记完成"}</button>
            <button type="button" disabled={pending} onClick={() => run("defer", () => deferTaskAction(data.taskId))}>延后到明天</button>
            <button type="button" disabled={pending} onClick={() => run(data.status === "skipped" ? "todo" : "skip", () => setTaskStatusAction(data.taskId, data.status === "skipped" ? "todo" : "skipped"))}>{data.status === "skipped" ? "恢复今日任务" : "今天先跳过"}</button>
            <button type="button" disabled={pending} onClick={() => run("del", () => deleteTaskAction(data.taskId))} className="text-danger">移除今日任务</button>
          </div>
        </details>
      </div>
    </div>
    <div className="task-meta">
      <span className="chip">{data.isWholeSong ? "整曲练习 · 全部小节" : `第 ${data.barStart}–${data.barEnd} 小节`}</span>
      {data.targetDurationMin ? <span className="chip">目标 {formatDuration(data.targetDurationMin)}</span> : null}
      {data.source === "auto" ? <span className="chip">按频率安排</span> : null}
      {data.deferredCount >= 2 ? <span className="chip border-warn/30 bg-warn-soft text-warn">已顺延 {data.deferredCount} 次</span> : null}
    </div>
    {data.lastSession ? <p className="mt-3 text-[11px] leading-relaxed text-muted">上次 {shortDateLabel(data.lastSession.date)}{data.lastSession.bestBpm ? ` · 最高 ${data.lastSession.bestBpm} BPM` : ""}{data.lastSession.feeling ? ` · ${FEELING_META[data.lastSession.feeling].label}` : ""} · 共 {data.sessionCount} 次记录</p> : null}
    {busy ? <p className="mt-2 text-[12px] text-muted" role="status">正在更新任务…</p> : null}
    {error ? <p className="mt-2 text-[12px] text-danger" role="alert">{error}</p> : null}
  </article>;
}
