"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";

import {
  deleteBlockAction,
  setBlockStatusAction,
  updateBlockAction,
} from "@/app/actions/blocks";
import { addNoteAction, deleteNoteAction } from "@/app/actions/notes";
import { changeSongStatusAction, deleteSongAction } from "@/app/actions/songs";
import { addBlockToTodayAction } from "@/app/actions/tasks";
import {
  allowedTransitions,
  SONG_STATUS_LABEL,
  type SongStatus,
} from "@/lib/domain/song-status";
import { IDLE_FORM_STATE, type FormState } from "@/lib/domain/form-state";

export function StatusChanger({
  songId,
  current,
}: {
  songId: string;
  current: SongStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const options = allowedTransitions(current);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[13px] text-muted">调整曲目状态</span>
      {options.map((s) => (
        <button
          key={s}
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await changeSongStatusAction(songId, s);
              setError(res.status === "error" ? (res.message ?? "切换失败") : null);
              router.refresh();
            })
          }
        >
          → {SONG_STATUS_LABEL[s]}
        </button>
      ))}
      {error ? <span className="text-[12px] text-danger">{error}</span> : null}
    </div>
  );
}

export function BlockRowActions({
  blockId,
  status,
}: {
  blockId: string;
  status: "active" | "paused" | "mastered";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link href={`/practice/${blockId}`} className="btn btn-sm btn-accent">
        开始练习
      </Link>
      <button
        type="button"
        className="btn btn-sm"
        disabled={pending}
        onClick={() => run(() => addBlockToTodayAction(blockId))}
      >
        加入今日
      </button>
      {status === "active" ? (
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={() => run(() => setBlockStatusAction(blockId, "paused"))}
        >
          暂停
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={() => run(() => setBlockStatusAction(blockId, "active"))}
        >
          恢复
        </button>
      )}
      {status !== "mastered" ? (
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={() => run(() => setBlockStatusAction(blockId, "mastered"))}
        >
          标记掌握
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn-sm btn-ghost text-faint"
        disabled={pending}
        onClick={() => {
          if (confirm("删除这个练习段落？相关任务与练习记录也会被删除。")) {
            run(() => deleteBlockAction(blockId));
          }
        }}
      >
        删除
      </button>
    </div>
  );
}

export function BlockEditForm({
  block,
}: {
  block: {
    id: string;
    name: string;
    barStart: number;
    barEnd: number;
    isWholeSong: boolean;
    currentBpm: number;
    targetBpm: number;
    note: string | null;
    priority: number;
    frequencyPerWeek: number | null;
  };
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateBlockAction,
    IDLE_FORM_STATE,
  );

  useEffect(() => {
    if (state.status === "ok") router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="grid gap-2 sm:grid-cols-3">
      <input type="hidden" name="blockId" value={block.id} />
      <label className="block sm:col-span-2">
        <span className="label">名称</span>
        <input className="input" name="name" defaultValue={block.name} />
      </label>
      <label className="block">
        <span className="label">频率（次/周）</span>
        <input
          className="input"
          type="number"
          name="frequencyPerWeek"
          min={0}
          max={14}
          defaultValue={block.frequencyPerWeek ?? ""}
        />
      </label>
      <label className="block">
        <span className="label">起始小节</span>
        <input
          className="input"
          type="number"
          name="barStart"
          disabled={block.isWholeSong}
          min={1}
          defaultValue={block.barStart}
        />
      </label>
      <label className="block">
        <span className="label">结束小节</span>
        <input
          className="input"
          type="number"
          name="barEnd"
          disabled={block.isWholeSong}
          min={1}
          defaultValue={block.barEnd}
        />
      </label>
      {block.isWholeSong ? <p className="text-[12px] text-muted sm:col-span-3">整曲练习始终覆盖最新乐谱的全部小节；节选请另外创建段落。</p> : null}
      <label className="block">
        <span className="label">当前 BPM</span>
        <input
          className="input"
          type="number"
          name="currentBpm"
          min={30}
          max={300}
          defaultValue={block.currentBpm}
        />
      </label>
      <label className="block">
        <span className="label">目标 BPM</span>
        <input
          className="input"
          type="number"
          name="targetBpm"
          min={30}
          max={300}
          defaultValue={block.targetBpm}
        />
      </label>
      <label className="block">
        <span className="label">优先级</span>
        <input
          className="input"
          type="number"
          name="priority"
          defaultValue={block.priority}
        />
      </label>
      <label className="block sm:col-span-3">
        <span className="label">备注</span>
        <input className="input" name="note" defaultValue={block.note ?? ""} />
      </label>
      <div className="flex items-center gap-2 sm:col-span-3">
        <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
          {pending ? "保存中…" : "保存段落"}
        </button>
        {state.status === "error" ? (
          <span className="text-[12.5px] text-danger">{state.message}</span>
        ) : null}
        {state.status === "ok" ? (
          <span className="text-[12.5px] text-good">已保存</span>
        ) : null}
      </div>
    </form>
  );
}

export function NoteEditor({
  parentType,
  parentId,
}: {
  parentType: "song" | "block";
  parentId: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(
    addNoteAction,
    IDLE_FORM_STATE,
  );

  useEffect(() => {
    if (state.status === "ok") router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="parentType" value={parentType} />
      <input type="hidden" name="parentId" value={parentId} />
      <input
        className="input min-w-[180px] flex-1"
        name="content"
        aria-label="笔记内容"
        placeholder={
          parentType === "song"
            ? "例如：Drop D tuning，原曲 105 BPM"
            : "例如：Bar 23 Bend 容易偏低"
        }
      />
      <input
        className="input w-[92px]"
        type="number"
        name="barNumber"
        aria-label="笔记小节（选填）"
        placeholder="小节"
        min={1}
      />
      <button type="submit" className="btn btn-sm shrink-0" disabled={pending}>
        {pending ? "…" : "添加笔记"}
      </button>
      {state.status === "error" ? (
        <span className="w-full text-[12px] text-danger">{state.message}</span>
      ) : null}
    </form>
  );
}

export function NoteList({
  notes,
}: {
  notes: { id: string; content: string; barNumber: number | null; createdAt: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (notes.length === 0) {
    return <p className="text-[12.5px] text-faint">还没有笔记</p>;
  }

  return (
    <ul className="space-y-1.5">
      {notes.map((n) => (
        <li
          key={n.id}
          className="group flex items-start gap-2 rounded-lg bg-surface2 px-3 py-2 text-[12.5px]"
        >
          {n.barNumber ? <span className="chip shrink-0">第 {n.barNumber} 小节</span> : null}
          <span className="flex-1 text-muted">{n.content}</span>
          <span className="shrink-0 text-[11px] text-faint">{n.createdAt}</span>
          <button
            type="button"
            className="btn btn-sm btn-ghost shrink-0 text-muted"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await deleteNoteAction(n.id);
                router.refresh();
              })
            }
            aria-label="删除笔记"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

export function DeleteSongButton({ songId }: { songId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost text-danger"
      disabled={pending}
      onClick={() => {
        if (
          confirm("删除曲目会同时删除它的乐谱文件、练习段落、任务与练习记录。确认删除？")
        ) {
          startTransition(async () => {
            await deleteSongAction(songId);
            router.push("/library");
            router.refresh();
          });
        }
      }}
    >
      删除曲目
    </button>
  );
}
