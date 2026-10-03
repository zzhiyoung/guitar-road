"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type * as alphaTabNS from "@coderline/alphatab";

import { createBlockAction } from "@/app/actions/blocks";
import { updateSongAction } from "@/app/actions/songs";
import { selectTrackAction } from "@/app/actions/upload";
import {
  alphaTabAssets,
  loadAlphaTab,
  practiceNotationSettings,
} from "@/lib/alphatab/loader";
import {
  applyStaveView,
  summarizeScore,
  type ScoreSummary,
} from "@/lib/alphatab/score-utils";
import { DIFFICULTY_LABELS } from "@/lib/domain/constants";
import { IDLE_FORM_STATE, type FormState } from "@/lib/domain/form-state";

export interface SongSetupProps {
  song: {
    id: string;
    title: string;
    artist: string | null;
    type: string;
    difficulty: number | null;
    tags: string[];
    status: string;
  };
  scoreFile: { id: string; url: string; fileName: string; trackIndex: number } | null;
  initialSetup: boolean;
}

/**
 * SPEC §5.6 I-2/I-3 + §5.4 B-3：
 * 上传后在浏览器端解析乐谱，带出真实曲名/艺术家/轨道，引导用户选定 Track 并创建第一个 Block。
 * alphaTab 在此处只做只读渲染（renderOnly），不加载音频。
 */
export function SongSetup({ song, scoreFile, initialSetup }: SongSetupProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTabNS.AlphaTabApi | null>(null);
  const [summary, setSummary] = useState<ScoreSummary | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [trackIndex, setTrackIndex] = useState(scoreFile?.trackIndex ?? 0);
  const [showScore, setShowScore] = useState(initialSetup);
  const [metaOpen, setMetaOpen] = useState(false);
  const [currentBpmInput, setCurrentBpmInput] = useState<string | null>(null);
  const [targetBpmInput, setTargetBpmInput] = useState<string | null>(null);
  const [barEndInput, setBarEndInput] = useState<string | null>(null);

  const [blockState, blockAction, blockPending] = useActionState<FormState, FormData>(
    createBlockAction,
    IDLE_FORM_STATE,
  );
  const [metaState, metaAction, metaPending] = useActionState<FormState, FormData>(
    updateSongAction,
    IDLE_FORM_STATE,
  );

  // 解析乐谱元信息（不需要用户展开预览才解析：先解析，展开时才渲染）
  useEffect(() => {
    if (!scoreFile) return;
    let disposed = false;
    let api: alphaTabNS.AlphaTabApi | null = null;

    (async () => {
      try {
        const alphaTab = await loadAlphaTab();
        if (disposed || !containerRef.current) return;
        const assets = alphaTabAssets();
        api = new alphaTab.AlphaTabApi(containerRef.current, {
          core: {
            scriptFile: assets.script,
            fontDirectory: assets.fontDirectory,
          },
          display: {
            layoutMode: alphaTab.LayoutMode.Page,
            staveProfile: alphaTab.StaveProfile.ScoreTab,
          },
          notation: practiceNotationSettings(alphaTab),
          player: { enablePlayer: false, playerMode: alphaTab.PlayerMode.Disabled },
        });
        apiRef.current = api;
        api.scoreLoaded.on((score) => {
          if (disposed) return;
          const info = summarizeScore(score);
          setSummary(info);
          setShowScore(true);
          const preferred = info.tracks.findIndex((t) => !t.isPercussion);
          if (scoreFile.trackIndex === 0 && preferred > 0) {
            setTrackIndex(preferred);
            void selectTrackAction(scoreFile.id, preferred);
          }
          const activeTrack = score.tracks[scoreFile.trackIndex] ? scoreFile.trackIndex : 0;
          // 与练习页保持一致：五线谱 + TAB 都展示（见 score-utils.applyStaveView）
          applyStaveView(score, activeTrack, "scoreTab");
          if (score.tracks.length > 1) {
            api!.renderTracks([score.tracks[activeTrack]]);
          }
        });
        api.error.on((err) => {
          setParseError(err instanceof Error ? err.message : "乐谱解析失败");
        });
        api.load(scoreFile.url);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "alphaTab 加载失败");
      }
    })();

    return () => {
      disposed = true;
      try {
        api?.destroy();
      } catch {
        /* ignore */
      }
      apiRef.current = null;
    };
  }, [scoreFile?.id]);

  useEffect(() => {
    if (blockState.status === "ok" && blockState.redirectTo) {
      router.push(blockState.redirectTo);
    }
  }, [blockState, router]);

  useEffect(() => {
    if (metaState.status === "ok") {
      setMetaOpen(false);
      router.refresh();
    }
  }, [metaState, router]);

  const barCount = summary?.barCount ?? null;

  const onTrackChange = (next: number) => {
    setTrackIndex(next);
    setShowScore(true);
    if (scoreFile) void selectTrackAction(scoreFile.id, next);
    const api = apiRef.current;
    const score = api?.score;
    if (api && score && score.tracks[next]) {
      api.renderTracks([score.tracks[next]]);
    }
    router.refresh();
  };

  return (
    <div className="space-y-3">
      {/* ---------------- 乐谱信息（解析结果） ---------------- */}
      <div className="card card-pad">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13.5px] font-semibold">乐谱信息</div>
          <div className="flex items-center gap-2">
            {scoreFile ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowScore((v) => !v)}
              >
                {showScore ? "收起预览" : "预览乐谱"}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setMetaOpen((v) => !v)}
            >
              {metaOpen ? "收起" : "编辑曲目信息"}
            </button>
          </div>
        </div>

        {!scoreFile ? (
          <p className="mt-2 text-[12.5px] text-muted">
            还没有可播放的乐谱文件。可在下方上传 Guitar Pro 或 MusicXML。
          </p>
        ) : parseError ? (
          <p className="mt-2 text-[12.5px] text-danger">
            解析失败：{parseError}。请确认文件未损坏，或重新上传。
          </p>
        ) : !summary ? (
          <p className="mt-2 text-[12.5px] text-muted">正在解析乐谱…</p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]">
              {summary.title ? (
                <span>
                  谱面标题 <strong className="text-ink">{summary.title}</strong>
                </span>
              ) : null}
              {summary.artist ? (
                <span>
                  艺术家 <strong className="text-ink">{summary.artist}</strong>
                </span>
              ) : null}
              <span>
                原速 <strong className="text-ink">{summary.tempo}</strong> BPM
              </span>
              <span>
                共 <strong className="text-ink">{summary.barCount}</strong> 小节
              </span>
              <span>
                {summary.initialTimeSignature.numerator}/
                {summary.initialTimeSignature.denominator} 拍
              </span>
            </div>

            {summary.tracks.length > 1 ? (
              <div className="mt-3">
                <span className="label">选择练习轨道</span>
                <div className="flex flex-wrap gap-1.5">
                  {summary.tracks.map((t) => (
                    <button
                      key={t.index}
                      type="button"
                      className={`btn btn-sm ${trackIndex === t.index ? "btn-primary" : ""}`}
                      aria-pressed={trackIndex === t.index}
                      onClick={() => onTrackChange(t.index)}
                    >
                      {t.name}
                      {t.isPercussion ? " 🥁" : ""}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Q3 决策：谱面元信息与 Song 记录不一致时，给一次性同步入口，
                而不是静默覆盖用户填写的曲名。 */}
            {summary.title && summary.title !== song.title ? (
              <form
                action={metaAction}
                className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-info-soft px-3 py-2"
              >
                <input type="hidden" name="songId" value={song.id} />
                <input type="hidden" name="title" value={summary.title} />
                <input
                  type="hidden"
                  name="artist"
                  value={summary.artist || song.artist || ""}
                />
                <input type="hidden" name="type" value={song.type} />
                <input
                  type="hidden"
                  name="difficulty"
                  value={song.difficulty ?? ""}
                />
                <input type="hidden" name="tags" value={song.tags.join(" ")} />
                <span className="min-w-0 flex-1 text-[12.5px] text-info">
                  谱面里写着「{summary.title}
                  {summary.artist ? ` · ${summary.artist}` : ""}」，与曲目名不一致。
                </span>
                <button
                  type="submit"
                  className="btn btn-sm shrink-0"
                  disabled={metaPending}
                >
                  {metaPending ? "更新中…" : "用谱面信息更新"}
                </button>
              </form>
            ) : null}
          </>
        )}

        {/* alphaTab 量取容器宽度排版，因此容器必须始终参与布局：收起时用 h-0+overflow-hidden 而非 hidden；
            展开时必须给 overflow-auto，否则内联 SVG 会溢出盖住下方表单。 */}
        <div
          ref={containerRef}
          className={`score-scroll mt-3 bg-white transition-all ${
            showScore
              ? "max-h-[40vh] overflow-auto rounded-lg border border-line px-2 py-2"
              : "h-0 overflow-hidden p-0 opacity-0"
          }`}
        />
      </div>

      {/* ---------------- 曲目信息编辑 ---------------- */}
      {metaOpen ? (
        <form action={metaAction} className="card card-pad space-y-2.5">
          <input type="hidden" name="songId" value={song.id} />
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="label">曲目名称</span>
              <input className="input" name="title" defaultValue={song.title} />
            </label>
            <label className="block">
              <span className="label">艺术家</span>
              <input className="input" name="artist" defaultValue={song.artist ?? ""} />
            </label>
            <label className="block">
              <span className="label">类型</span>
              <select className="input" name="type" defaultValue={song.type}>
                <option value="song">Song</option>
                <option value="exercise">Exercise</option>
              </select>
            </label>
            <label className="block">
              <span className="label">难度</span>
              <select
                className="input"
                name="difficulty"
                defaultValue={song.difficulty ?? ""}
              >
                <option value="">未设置</option>
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>
                    {d} · {DIFFICULTY_LABELS[d]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">标签（空格或逗号分隔）</span>
              <input className="input" name="tags" defaultValue={song.tags.join(" ")} />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-sm btn-primary" disabled={metaPending}>
              {metaPending ? "保存中…" : "保存曲目信息"}
            </button>
            {metaState.status === "error" ? (
              <span className="text-[12.5px] text-danger">{metaState.message}</span>
            ) : null}
          </div>
        </form>
      ) : null}

      {/* ---------------- 创建 Practice Block（B-1 / B-3） ---------------- */}
      <form action={blockAction} className="card card-pad space-y-2.5">
        <div className="text-[18px] font-semibold">圈出一段，慢慢练好。</div>
        <input type="hidden" name="songId" value={song.id} />

        <div className="grid gap-2.5 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="label">段落名称</span>
            <input
              className="input"
              name="name"
              placeholder="例如：独奏第 17–24 小节"
              required
            />
          </label>
          <label className="block">
            <span className="label">起始小节</span>
            <input
              className="input"
              type="number"
              name="barStart"
              min={1}
              max={barCount ?? undefined}
              defaultValue={1}
              required
            />
          </label>
          <label className="block">
            <span className="label">
              结束小节{barCount ? `（全曲 ${barCount} 小节）` : ""}
            </span>
            <input
              className="input"
              type="number"
              name="barEnd"
              min={1}
              max={barCount ?? undefined}
              value={barEndInput ?? String(barCount ?? 8)}
              onChange={(e) => setBarEndInput(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="label">当前 BPM</span>
            <input
              className="input"
              type="number"
              name="currentBpm"
              min={30}
              max={300}
              value={currentBpmInput ?? String(Math.min(300, Math.max(30, summary?.tempo ?? 90)))}
              onChange={(e) => setCurrentBpmInput(e.target.value)}
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
              value={targetBpmInput ?? String(Math.min(300, Math.max(30, summary?.tempo ?? 90)))}
              onChange={(e) => setTargetBpmInput(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="label">练习频率（次/周，可留空）</span>
            <input
              className="input"
              type="number"
              name="frequencyPerWeek"
              min={0}
              max={14}
              placeholder="3"
            />
          </label>
          <label className="block">
            <span className="label">优先级（越大越靠前）</span>
            <input className="input" type="number" name="priority" defaultValue={0} />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">备注 / 练习提示</span>
            <input className="input" name="note" placeholder="例如：Bend 音准注意" />
          </label>
        </div>

        {blockState.status === "error" ? (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
            {blockState.message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <button
            type="submit"
            name="intent"
            value="practice"
            className="btn btn-accent"
            disabled={blockPending || !scoreFile}
          >
            {blockPending ? "创建中…" : "创建并开始练习"}
          </button>
          <button
            type="submit"
            name="intent"
            value="today"
            className="btn"
            disabled={blockPending}
          >
            创建并加入今日
          </button>
          <button
            type="submit"
            name="intent"
            value="save"
            className="btn btn-ghost"
            disabled={blockPending}
          >
            仅保存
          </button>
        </div>
        {!scoreFile ? (
          <p className="text-[12px] text-faint">
            需要先上传可播放的乐谱文件，才能进入练习页。
          </p>
        ) : null}
      </form>
    </div>
  );
}
