"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import {
  createAlbumAction,
  deleteAlbumAction,
  moveAlbumAction,
  renameAlbumAction,
} from "@/app/actions/albums";
import { Icon } from "@/components/studio";
import { ALBUM_TITLE_MAX } from "@/lib/domain/constants";
import { IDLE_FORM_STATE, type FormState } from "@/lib/domain/form-state";

export interface AlbumOption {
  id: string;
  title: string;
  count: number;
}

/**
 * 专辑管理（SPEC §2.10）。
 *
 * MVP 只做：新建 / 重命名 / 删除 / 上下移动。
 * 不做封面、拖拽排序、分享与多级目录。
 */
export function AlbumManager({ albums }: { albums: AlbumOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [createState, createAction, createPending] = useActionState<
    FormState,
    FormData
  >(createAlbumAction, IDLE_FORM_STATE);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const overflowRef = useRef("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      overflowRef.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      dialog.showModal();
    } else {
      dialog.close();
      document.body.style.overflow = overflowRef.current;
    }
  }, [open]);

  useEffect(() => {
    if (createState.status === "ok") {
      setError(null);
      router.refresh();
    } else if (createState.status === "error") {
      setError(createState.message ?? "创建失败");
    }
  }, [createState, router]);

  const run = (fn: () => Promise<{ status: string; message?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.status === "error" ? (res.message ?? "操作失败") : null);
      router.refresh();
    });

  const startRename = (album: AlbumOption) => {
    setEditingId(album.id);
    setDraft(album.title);
  };

  const commitRename = () => {
    if (!editingId) return;
    const title = draft.trim();
    if (!title) {
      setError("专辑名称不能为空");
      return;
    }
    const id = editingId;
    setEditingId(null);
    run(() => renameAlbumAction(id, title));
  };

  return (
    <>
      <button
        type="button"
        className="chip min-h-11 cursor-pointer border-dashed"
        onClick={() => setOpen(true)}
      >
        <Icon name="library" width="14" />
        管理专辑
      </button>

      <dialog
        ref={dialogRef}
        className="session-dialog"
        aria-labelledby="album-manager-title"
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="album-manager-title" className="serif-heading">
            专辑管理
          </h2>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setOpen(false)}
          >
            关闭
          </button>
        </div>
        <p className="mt-1 text-[12.5px] text-muted">
          专辑只是曲库的整理方式，与「教材」互不冲突。删除专辑不会删除曲目。
        </p>

        <ul className="mt-5 divide-y divide-line">
          {albums.length === 0 ? (
            <li className="py-3 text-[12.5px] text-faint">
              还没有专辑。先在下面新建一个试试。
            </li>
          ) : (
            albums.map((album, index) => (
              <li
                key={album.id}
                className="flex flex-wrap items-center gap-2 py-2.5"
              >
                {editingId === album.id ? (
                  <>
                    <input
                      className="input !min-h-11 flex-1 py-2 text-[13px]"
                      value={draft}
                      maxLength={ALBUM_TITLE_MAX}
                      autoFocus
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      aria-label={`重命名 ${album.title}`}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={commitRename}
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => setEditingId(null)}
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 break-words text-[13.5px] font-semibold">
                      {album.title}
                    </span>
                    <span className="chip">{album.count} 首</span>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={pending || index === 0}
                      onClick={() => run(() => moveAlbumAction(album.id, "up"))}
                      aria-label={`${album.title} 上移`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={pending || index === albums.length - 1}
                      onClick={() => run(() => moveAlbumAction(album.id, "down"))}
                      aria-label={`${album.title} 下移`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => startRename(album)}
                    >
                      重命名
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost text-danger"
                      disabled={pending}
                      onClick={() => {
                        if (
                          confirm(
                            `删除专辑「${album.title}」？\n专辑内的 ${album.count} 首曲目会保留，并移回未分类。`,
                          )
                        ) {
                          run(() => deleteAlbumAction(album.id));
                        }
                      }}
                    >
                      删除
                    </button>
                  </>
                )}
              </li>
            ))
          )}
        </ul>

        {error ? (
          <p role="alert" className="mt-3 text-[12.5px] text-danger">
            {error}
          </p>
        ) : null}

        <form action={createAction} className="mt-5 flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <label className="min-w-[180px] flex-1">
            <span className="label">新建专辑</span>
            <input
              className="input"
              name="title"
              maxLength={ALBUM_TITLE_MAX}
              placeholder="例如：Fingerstyle / 最近想练"
              required
            />
          </label>
          <button
            type="submit"
            className="btn btn-accent"
            disabled={createPending}
          >
            {createPending ? "创建中…" : "＋ 新建专辑"}
          </button>
        </form>
      </dialog>
    </>
  );
}
