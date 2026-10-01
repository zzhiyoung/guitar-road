"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/studio";
import { uploadScoreFileAction } from "@/app/actions/upload";
import { ACCEPT_ATTRIBUTE, DIFFICULTY_LABELS } from "@/lib/domain/constants";
import { IDLE_FORM_STATE, type FormState } from "@/lib/domain/form-state";

export function UploadForm({ songId }: { songId?: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(
    uploadScoreFileAction,
    IDLE_FORM_STATE,
  );
  const [fileName, setFileName] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status === "ok" && state.redirectTo) {
      router.push(state.redirectTo);
    }
  }, [state, router]);

  return (
    <form action={action} className="space-y-6">
      {songId ? <input type="hidden" name="songId" value={songId} /> : null}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file && inputRef.current) {
            const dt = new DataTransfer();
            dt.items.add(file);
            inputRef.current.files = dt.files;
            setFileName(file.name);
          }
        }}
        className={`rounded-xl border-2 border-dashed px-5 py-8 text-center transition-colors ${
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-surface2"
        }`}
      >
        <div className="upload-symbol"><Icon name="upload" width="30" height="30" /></div>
        <p className="mt-2 text-[13.5px] font-semibold">
          {songId ? "上传新版本，保留已有练习段落" : "把想弹的音乐，带到这里"}
        </p>
        <p className="mt-1 text-[12px] text-muted">
          Guitar Pro：.gp / .gpx / .gp5 / .gp4 / .gp3 · MusicXML：.musicxml / .xml · 资料：.pdf
        </p>
        <button
          type="button"
          className="btn btn-sm mt-3"
          onClick={() => inputRef.current?.click()}
        >
          选择文件
        </button>
        {fileName ? (
          <p className="mt-2 truncate text-[12.5px] text-accent">{fileName}</p>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept={ACCEPT_ATTRIBUTE}
          className="hidden"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
        />
      </div>

      {!songId ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="label">曲目名称（留空则用文件名）</span>
            <input className="input" name="title" placeholder="Hotel California" />
          </label>
          <label className="block">
            <span className="label">艺术家 / 教材</span>
            <input className="input" name="artist" placeholder="Eagles" />
          </label>
          <label className="block">
            <span className="label">类型</span>
            <select className="input" name="type" defaultValue="song">
              <option value="song">曲目</option>
              <option value="exercise">练习曲</option>
            </select>
          </label>
          <label className="block">
            <span className="label">难度</span>
            <select className="input" name="difficulty" defaultValue="">
              <option value="">未设置</option>
              {[1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={d}>
                  {d} · {DIFFICULTY_LABELS[d]}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
          {state.message}
        </p>
      ) : null}

      <button type="submit" className="btn btn-accent w-full" disabled={pending || !fileName}>
        {pending ? "上传中…" : "上传并继续"}
      </button>
    </form>
  );
}
