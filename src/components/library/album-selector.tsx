"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { assignSongAlbumAction } from "@/app/actions/albums";

export interface AlbumChoice {
  id: string;
  title: string;
}

/**
 * SPEC §2.11：曲目归入专辑。
 *
 * 支持选择 / 更换 / 设为未分类；Book（教材）与本选择器并存，互不排斥。
 */
export function AlbumSelector({
  songId,
  albums,
  currentAlbumId,
}: {
  songId: string;
  albums: AlbumChoice[];
  currentAlbumId: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentAlbumId ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onChange = (next: string) => {
    setValue(next);
    startTransition(async () => {
      const res = await assignSongAlbumAction(songId, next || null);
      setError(res.status === "error" ? (res.message ?? "更新失败") : null);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-[13px] text-muted" htmlFor={`album-${songId}`}>
        所属专辑
      </label>
      <select
        id={`album-${songId}`}
        className="input !min-h-11 w-auto min-w-[180px] flex-1 py-2 text-[13px] sm:flex-none"
        value={value}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">未分类</option>
        {albums.map((a) => (
          <option key={a.id} value={a.id}>
            {a.title}
          </option>
        ))}
      </select>
      {pending ? <span className="text-[12px] text-faint">保存中…</span> : null}
      {error ? (
        <span className="text-[12px] text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
