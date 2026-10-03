"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ScorePlayer, type ScorePlayerHandle } from "@/components/player/score-player";
import { Icon } from "@/components/studio";
import {
  MAX_OMR_UPLOAD_BYTES,
  OMR_IMAGE_MIME_TYPES,
} from "@/lib/domain/constants";
import type { OmrStatus, OmrInputMode } from "@/lib/creator/types";

const ACCEPTED: readonly string[] = OMR_IMAGE_MIME_TYPES;

interface RecognitionResult {
  id: string;
  musicXml: string;
  downloadName: string;
  engine: string;
  warnings: string[];
}

/**
 * Guitar Road Creator MVP（SPEC §4.4）。
 *
 * 链路：截图 / 图片 → OMR → MusicXML → alphaTab 预览 → 下载 → Guitar Pro 校正。
 * 第一阶段**不写数据库**（不创建 Song / ScoreFile / Block）。
 */
export function CreatorClient({ initialStatus }: { initialStatus: OmrStatus }) {
  const [status, setStatus] = useState<OmrStatus>(initialStatus);
  const [checking, setChecking] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [scoreUrl, setScoreUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputMode, setInputMode] = useState<OmrInputMode>("auto");
  const playerRef = useRef<ScorePlayerHandle>(null);
  const busyRef = useRef(false);
  const startingRef = useRef(false);
  const startTickRef = useRef(0);
  const [playerReady, setPlayerReady] = useState(false);
  const [scoreReady, setScoreReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);

  const clearResult = useCallback(() => {
    playerRef.current?.stop();
    setResult(null);
    setPlayerReady(false);
    setScoreReady(false);
    setPlaying(false);
    startingRef.current = false;
    setStarting(false);
  }, []);

  const recheck = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/creator/status", { cache: "no-store" });
      setStatus((await res.json()) as OmrStatus);
    } catch {
      setStatus({ available: false, message: "无法检测识别引擎状态" });
    } finally {
      setChecking(false);
    }
  }, []);

  const pick = useCallback((next: File | null) => {
    if (busyRef.current) return;
    setError(null);
    clearResult();
    if (!next) {
      setFile(null);
      return;
    }
    if (!ACCEPTED.includes(next.type)) {
      setFile(null);
      setError("只支持 PNG / JPG 图片");
      return;
    }
    if (next.size > MAX_OMR_UPLOAD_BYTES) {
      setFile(null);
      setError(`图片超过 ${Math.round(MAX_OMR_UPLOAD_BYTES / 1024 / 1024)} MB，请先裁剪乐谱区域`);
      return;
    }
    setFile(next);
  }, [clearResult]);

  // 输入图片预览 URL 的生命周期
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // 识别结果 MusicXML 的 Blob URL（alphaTab 需要一个可加载的 URL）
  useEffect(() => {
    if (!result) {
      setScoreUrl(null);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([result.musicXml], { type: "application/xml" }),
    );
    setScoreUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);

  // Ctrl + V 粘贴截图（SPEC §4.2）
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((i) =>
        ACCEPTED.includes(i.type),
      );
      const pasted = item?.getAsFile();
      if (pasted) pick(pasted);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pick]);

  const recognize = async () => {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    clearResult();
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("mode", inputMode);
      const res = await fetch("/api/creator/recognize", { method: "POST", body });
      const payload = (await res.json()) as
        | { ok: true; musicXml: string; downloadName: string; engine: string; warnings?: string[] }
        | { ok: false; error: string };

      if (!payload.ok) {
        setError(payload.error);
        setResult(null);
        return;
      }
      setResult({
        id: crypto.randomUUID(),
        musicXml: payload.musicXml,
        downloadName: payload.downloadName,
        engine: payload.engine,
        warnings: payload.warnings ?? [],
      });
    } catch {
      setError("识别请求失败，请检查服务是否在运行。");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ---------------- 引擎状态 ---------------- */}
      <div
        className={`card card-pad flex flex-wrap items-center justify-between gap-3 ${
          status.available ? "" : "bg-warn-soft"
        }`}
      >
        <div className="min-w-0">
          <div className="text-[14px] font-semibold">
            识别引擎：{status.available ? "已就绪" : "未安装"}
          </div>
          <p className="mt-1 text-[12.5px] text-muted">
            {status.available
              ? `${status.engine ?? "homr"} · ${status.device === "cuda" ? "GPU" : "CPU"} 推理 · 图片传到本机服务处理，不发送到第三方。`
              : (status.message ??
                "OMR 识别引擎尚未安装。Guitar Road 其他功能不受影响。")}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={recheck}
          disabled={checking}
        >
          {checking ? "检测中…" : "重新检测"}
        </button>
      </div>

      <div className="card card-pad space-y-3">
        <label htmlFor="creator-mode" className="label">乐谱类型</label>
        <select id="creator-mode" className="input" value={inputMode} disabled={busy}
          onChange={(e) => { setInputMode(e.target.value as OmrInputMode); clearResult(); setError(null); }}>
          <option value="auto">自动：五线谱 / 五线谱＋TAB</option>
          <option value="standard-tab">五线谱＋TAB（实验）</option>
          <option value="standard">仅五线谱（组合谱会先隔离 TAB）</option>
        </select>
        <p className="text-[12.5px] text-muted">
          TAB 首版支持清晰的单音组合谱，标准 EADGBE、无变调夹。请裁剪到少量完整小节；纯 TAB、和弦、倚音及复杂奏法尚不支持。无法可靠对齐时会提示，不生成猜测指法。
        </p>
      </div>

      {/* ---------------- 输入区 ---------------- */}
      <div
        className={`dropzone ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0] ?? null);
        }}
      >
        <p className="text-[15px] font-semibold">拖入乐谱图片</p>
        <p className="mt-1.5 text-[12.5px] text-muted">
          支持 PNG / JPG，最大 {Math.round(MAX_OMR_UPLOAD_BYTES / 1024 / 1024)} MB
        </p>
        <p className="mt-1 text-[12.5px] text-muted">
          也可以直接 <kbd className="chip">Ctrl</kbd> + <kbd className="chip">V</kbd> 粘贴截图
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          disabled={busy}
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="btn mt-4"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="upload" width="18" />
          选择图片
        </button>
      </div>

      {previewUrl ? (
        <div className="card card-pad">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold">{file?.name}</div>
              <p className="mt-0.5 text-[11.5px] text-faint">
                {file ? `${Math.round(file.size / 1024)} KB` : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={busy}
                onClick={() => pick(null)}
              >
                移除
              </button>
              <button
                type="button"
                className="btn btn-accent"
                onClick={recognize}
                disabled={busy || !status.available}
              >
                {busy ? "识别中…" : "开始识别"}
              </button>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="待识别的乐谱图片"
            className="mt-3 max-h-[320px] w-full rounded-xl border border-line object-contain"
          />
          {!status.available ? (
            <p className="mt-2 text-[12px] text-warn">
              识别引擎未安装，无法开始识别。
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : null}

      {/* ---------------- 识别结果 ---------------- */}
      {result && scoreUrl ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="section-title">识别结果</h2>
            <form action="/api/creator/download" method="post">
              <input type="hidden" name="musicXml" value={result.musicXml} readOnly />
              <input type="hidden" name="fileName" value={result.downloadName} readOnly />
              <button type="submit" className="btn btn-accent">
                <Icon name="upload" width="18" />
                下载 MusicXML
              </button>
            </form>
          </div>

          <ScorePlayer
            key={result.id}
            ref={playerRef}
            source={{
              id: result.id,
              fileName: result.downloadName,
              url: scoreUrl,
              fileType: "musicxml",
              trackIndex: 0,
            }}
            mode="song"
            defaultStaveView={result.engine === "homr+tab" ? "scoreTab" : "score"}
            allowedStaveViews={result.engine === "homr+tab" ? undefined : ["score"]}
            normalizeGuitarStaff={result.engine === "homr+tab"}
            onScoreLoaded={() => setScoreReady(true)}
            onPlayerReadyChange={setPlayerReady}
            onPlayerStateChange={(next) => {
              setPlaying(next);
              if (!next) { startingRef.current = false; setStarting(false); }
            }}
            onPositionChange={(p) => {
              if (startingRef.current && !p.isSeek && p.tick !== startTickRef.current) {
                startingRef.current = false; setStarting(false);
              }
            }}
          />

          <div className="card card-pad flex flex-wrap items-center gap-3" aria-label="识别草稿试听">
            <button type="button" className="btn btn-accent"
              disabled={!scoreReady || !playerReady || starting}
              onClick={() => {
                const player = playerRef.current;
                if (!player?.readyForPlayback() || startingRef.current) return;
                if (!playing) { startTickRef.current = player.getTickPosition(); startingRef.current = true; setStarting(true); }
                player.playPause();
              }}>
              <Icon name={playing ? "pause" : "play"} width="18" />
              {starting ? "正在启动…" : playing ? "暂停试听" : "试听草稿"}
            </button>
            <button type="button" className="btn" disabled={!scoreReady || !playerReady || starting}
              onClick={() => { playerRef.current?.stop(); playerRef.current?.setTickPosition(0); }}>
              <Icon name="stop" width="18" />停止并回到开头
            </button>
            <span className="text-[12px] text-muted">试听不计入练习记录</span>
          </div>

          <div className="flex items-start gap-3 rounded-3xl bg-warn-soft p-6 text-[13px] leading-7 text-warn">
            <Icon name="music" className="mt-1 shrink-0" />
            <div>
              <p>
                自动识别只是草稿，请用 Guitar Pro 打开并校正后，再从「导入曲谱」加入
                Guitar Road。
              </p>
              <p className="mt-1">
                下载文件名：{result.downloadName} · 引擎 {result.engine}
              </p>
              {result.warnings.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5">
                  {result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                </ul>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
