"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addWholeSongToTodayAction } from "@/app/actions/tasks";

export function AddWholeSong({ songId, alreadyAdded = false }: { songId: string; alreadyAdded?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [added, setAdded] = useState(alreadyAdded);
  useEffect(() => setAdded(alreadyAdded), [alreadyAdded]);
  return <div>
    <button type="button" className="btn btn-soft w-full" disabled={pending || added} onClick={() => start(async () => {
      try {
        const result = await addWholeSongToTodayAction(songId);
        setMessage(result.message ?? "");
        if (result.status === "ok") { setAdded(true); router.refresh(); }
      } catch { setMessage("暂时无法加入今日，请重试。"); }
    })}>{pending ? "加入中…" : added ? "整曲已加入今日" : "＋ 整曲加入今日练习"}</button>
    {message ? <p className="mt-2 text-[12px] text-muted" role="status">{message}</p> : null}
  </div>;
}
