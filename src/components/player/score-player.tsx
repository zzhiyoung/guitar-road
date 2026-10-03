"use client";

import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import type * as alphaTabNS from "@coderline/alphatab";
import { CountIn } from "@/lib/audio/count-in";

import {
  alphaTabAssets,
  loadAlphaTab,
  practiceNotationSettings,
} from "@/lib/alphatab/loader";
import {
  applyStaveView,
  barRangeToTicks,
  barTimings,
  locateTick,
  STAVE_VIEW_LABEL,
  summarizeScore,
  withLinearPracticePlayback,
  type BarTiming,
  type ScoreSummary,
  type StaveView,
} from "@/lib/alphatab/score-utils";

/**
 * 通用 alphaTab 播放器（SPEC §3.4 / §5）。
 *
 * 一个实例被三处复用：Practice / Song Player / Creator Preview。
 * 这里只负责「乐谱 + 播放」本身，不含任何练习业务（BPM 训练、Session、节拍器…）。
 */
export interface ScorePlayerSource {
  id: string;
  fileName: string;
  url: string;
  fileType: string;
  trackIndex: number;
}

export interface ScorePlayerHandle {
  getApi(): alphaTabNS.AlphaTabApi | null;
  playPause(): void;
  stop(): void;
  setTickPosition(tick: number): void;
  getTickPosition(): number;
  readyForPlayback(): boolean;
  getTimings(): BarTiming[];
}

export interface ScorePlayerPosition {
  tick: number;
  previousTick: number;
  isSeek: boolean;
  bar: number | null;
  beat: number | null;
  beatsPerBar: number | null;
}

export interface ScorePlayerProps {
  ref?: Ref<ScorePlayerHandle>;
  source: ScorePlayerSource | null;
  /** practice = 按练习段落区间播放；song = 整曲播放 */
  mode: "song" | "practice";
  /** 播放区间（1-based 小节，闭区间）。null = 整曲 */
  barRange?: { start: number; end: number } | null;
  loop?: boolean;
  /** 播放速度倍率，1 = 原速 */
  playbackSpeed?: number;
  /** Pre-roll follows the starting bar's meter/tempo on the WebAudio clock. */
  countIn?: boolean;
  defaultStaveView?: StaveView;
  /** Creator 的已对齐 TAB 文件需要把标准谱表恢复为五线；仅按调用方请求应用。 */
  normalizeGuitarStaff?: boolean;
  allowedStaveViews?: StaveView[];
  onScoreLoaded?(info: { summary: ScoreSummary; timings: BarTiming[] }): void;
  onPlayerReadyChange?(ready: boolean): void;
  onPlayerStateChange?(playing: boolean): void;
  onPositionChange?(position: ScorePlayerPosition): void;
  onRangeChange?(range: { startTick: number; endTick: number } | null): void;
  onLoopCompleted?(): void;
  onCountInChange?(preparing: boolean): void;
  /** 谱面区下方（同一张 card 内）的附加内容，例如 Practice 的 PDF 行 */
  children?: ReactNode;
  /** 谱面解析失败时浮层里的补救入口（例如「重新导入」） */
  errorAction?: ReactNode;
}

type Phase = "loading" | "ready" | "error";

export function ScorePlayer({
  ref,
  source,
  mode,
  barRange = null,
  loop = false,
  playbackSpeed = 1,
  countIn = false,
  defaultStaveView = "scoreTab",
  normalizeGuitarStaff = false,
  allowedStaveViews,
  onScoreLoaded,
  onPlayerReadyChange,
  onPlayerStateChange,
  onPositionChange,
  onRangeChange,
  onLoopCompleted,
  onCountInChange,
  children,
  errorAction,
}: ScorePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTabNS.AlphaTabApi | null>(null);
  const timingsRef = useRef<BarTiming[]>([]);
  const prevTickRef = useRef<number>(-1);
  const staveViewRef = useRef<StaveView>(defaultStaveView);
  const appliedViewRef = useRef<StaveView | null>(null);
  const activeTrackRef = useRef<number>(source?.trackIndex ?? 0);
  const rangeRef = useRef<{ startTick: number; endTick: number } | null>(null);
  const countInUsedRef = useRef(false);
  const countInRef = useRef<CountIn | null>(null);
  const preparingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>(source ? "loading" : "ready");
  const [phaseMessage, setPhaseMessage] = useState("");
  const [summary, setSummary] = useState<ScoreSummary | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [midiRevision, setMidiRevision] = useState(0);
  const [volume, setVolume] = useState(1.5);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const playbackConfigRef = useRef({ barRange, loop, playbackSpeed, countIn });
  playbackConfigRef.current = { barRange, loop, playbackSpeed, countIn };
  const [positionBar, setPositionBar] = useState<number | null>(null);
  const [staveView, setStaveView] = useState<StaveView>(defaultStaveView);

  // 回调放进 ref：alphaTab 初始化只依赖 source.id，不因回调变化重建实例
  const callbacksRef = useRef({
    onScoreLoaded,
    onPlayerReadyChange,
    onPlayerStateChange,
    onPositionChange,
    onRangeChange,
    onLoopCompleted,
    onCountInChange,
  });
  callbacksRef.current = {
    onScoreLoaded,
    onPlayerReadyChange,
    onPlayerStateChange,
    onPositionChange,
    onRangeChange,
    onLoopCompleted,
    onCountInChange,
  };
  const loopRef = useRef(loop);
  loopRef.current = loop;

  // ---------------------------------------------------------------------
  // alphaTab 初始化与谱面加载
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!source) return;
    let disposed = false;
    let api: alphaTabNS.AlphaTabApi | null = null;
    let practiceMidiPrepared = false;
    let practiceMidiLoaded = false;
    setPhase("loading");
    setPlayerReady(false);
    setPositionBar(null);
    timingsRef.current = [];
    rangeRef.current = null;
    prevTickRef.current = -1;
    countInUsedRef.current = false;
    callbacksRef.current.onPlayerReadyChange?.(false);

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
          // 曲目/艺术家等信息已由页面头承担，乐谱区只保留谱面本身
          notation: practiceNotationSettings(alphaTab),
          player: {
            enablePlayer: true,
            soundFont: assets.soundFont,
            scrollElement: scrollRef.current ?? undefined,
            scrollMode: alphaTab.ScrollMode.Continuous,
            enableCursor: true,
            enableAnimatedBeatCursor: true,
          },
        });
        apiRef.current = api;
        api.masterVolume = volumeRef.current;

        api.midiLoaded.on(() => {
          if (disposed) return;
          // scoreLoaded precedes async MIDI loading. Loading MIDI resets its range;
          // install the practice MIDI first, then reapply the range after loading.
          if (mode === "practice" && !practiceMidiPrepared && api!.score) {
            practiceMidiPrepared = true;
            setPlayerReady(false);
            callbacksRef.current.onPlayerReadyChange?.(false);
            withLinearPracticePlayback(api!.score, () => api!.loadMidiForScore());
            return;
          }
          practiceMidiLoaded = true;
          setMidiRevision((revision) => revision + 1);
        });

        api.playerReady.on(() => {
          if (disposed || (mode === "practice" && !practiceMidiLoaded)) return;
          setPlayerReady(true);
          callbacksRef.current.onPlayerReadyChange?.(true);
        });

        api.error.on((err) => {
          if (disposed) return;
          setPlayerReady(false);
          setPhase("error");
          setPhaseMessage(
            err instanceof Error ? err.message : String(err ?? "乐谱解析失败"),
          );
        });

        api.scoreLoaded.on((score) => {
          if (disposed) return;
          if (normalizeGuitarStaff) {
            for (const track of score.tracks) {
              for (const staff of track.staves) {
                if (staff.tuning.length === 6) staff.standardNotationLineCount = 5;
              }
            }
          }
          const timings = barTimings(score);
          timingsRef.current = timings;

          const info = summarizeScore(score);
          setSummary(info);
          setPhase("ready");

          // 只渲染选定的 Track，且同时给出五线谱与 TAB
          const trackIndex = Math.min(
            Math.max(0, source.trackIndex),
            Math.max(0, score.tracks.length - 1),
          );
          activeTrackRef.current = trackIndex;
          applyStaveView(score, trackIndex, staveViewRef.current);
          appliedViewRef.current = staveViewRef.current;
          if (score.tracks.length > 1) {
            const others = score.tracks.filter((_, i) => i !== trackIndex);
            api!.changeTrackMute(others, true);
            api!.renderTracks([score.tracks[trackIndex]]);
          } else {
            api!.render();
          }

          callbacksRef.current.onScoreLoaded?.({ summary: info, timings });
        });

        api.playerStateChanged.on((args) => {
          if (disposed) return;
          const playing = args.state === 1;
          setIsPlaying(playing);
          if (!playing) prevTickRef.current = -1;
          callbacksRef.current.onPlayerStateChange?.(playing);
        });

        api.playerFinished.on(() => {
          if (disposed) return;
          if (loopRef.current) callbacksRef.current.onLoopCompleted?.();
          else countInUsedRef.current = false;
        });

        api.playerPositionChanged.on((args) => {
          if (disposed) return;
          const tick = args.currentTick;
          const previousTick = prevTickRef.current;
          const loc = locateTick(timingsRef.current, tick);
          if (loc) setPositionBar(loc.bar);
          callbacksRef.current.onPositionChange?.({
            tick,
            previousTick,
            isSeek: args.isSeek,
            bar: loc?.bar ?? null,
            beat: loc?.beat ?? null,
            beatsPerBar: loc?.beatsPerBar ?? null,
          });
          prevTickRef.current = tick;
        });

        api.load(source.url);
      } catch (err) {
        if (disposed) return;
        setPhase("error");
        setPhaseMessage(
          err instanceof Error ? err.message : "alphaTab 初始化失败",
        );
      }
    })();

    return () => {
      disposed = true;
      countInRef.current?.dispose();
      countInRef.current = null;
      preparingRef.current = false;
      try {
        api?.destroy();
      } catch {
        /* 忽略销毁异常 */
      }
      apiRef.current = null;
    };
  }, [source?.id, source?.url, source?.trackIndex, normalizeGuitarStaff, mode]);

  // ---------------------------------------------------------------------
  // 对外暴露的命令式接口
  // ---------------------------------------------------------------------
  useImperativeHandle(
    ref,
    () => ({
      getApi: () => apiRef.current,
      playPause: () => {
        const api = apiRef.current;
        if (!api || !api.isReadyForPlayback) return;
        const config = playbackConfigRef.current;
        const range = rangeRef.current;
        if (preparingRef.current) {
          countInRef.current?.cancel();
          preparingRef.current = false;
          countInUsedRef.current = false;
          callbacksRef.current.onCountInChange?.(false);
          return;
        }
        // A click/drag on the score may change alphaTab's own selection.
        // The practice block remains the authoritative playback boundary.
        api.playbackRange = range;
        api.isLooping = config.loop;
        if (api.playerState !== 1) {
          if (range && (api.tickPosition < range.startTick || api.tickPosition >= range.endTick)) {
            api.tickPosition = range.startTick;
          }
          const needsCountIn = config.countIn && !countInUsedRef.current && Math.abs(api.tickPosition - (range?.startTick ?? 0)) < 10;
          countInUsedRef.current = true;
          // Native count-in can retain the previous meter at an exact bar boundary.
          // Read the score directly and schedule this one measure independently.
          if (needsCountIn && api.score) {
            const barIndex = (locateTick(timingsRef.current, api.tickPosition)?.bar ?? 1) - 1;
            const bar = api.score.masterBars[barIndex];
            let tempo = api.score.tempo;
            for (let i = 0; i <= barIndex; i++) {
              for (const automation of api.score.masterBars[i].tempoAutomations) {
                if (i < barIndex || automation.ratioPosition === 0) tempo = automation.value;
              }
            }
            preparingRef.current = true;
            callbacksRef.current.onCountInChange?.(true);
            countInRef.current ??= new CountIn();
            void countInRef.current.start({ bpm: tempo * config.playbackSpeed,
              numerator: bar.timeSignatureNumerator, denominator: bar.timeSignatureDenominator, volume: 0.6 }, () => {
              preparingRef.current = false;
              callbacksRef.current.onCountInChange?.(false);
              if (apiRef.current === api) { api.countInVolume = 0; api.playPause(); }
            });
            return;
          }
        }
        api.countInVolume = 0;
        api.playPause();
      },
      stop: () => {
        countInRef.current?.cancel(); preparingRef.current = false;
        callbacksRef.current.onCountInChange?.(false);
        countInUsedRef.current = false; apiRef.current?.stop();
      },
      setTickPosition: (tick: number) => {
        const api = apiRef.current;
        if (api) api.tickPosition = tick;
      },
      getTickPosition: () => apiRef.current?.tickPosition ?? 0,
      readyForPlayback: () => !!apiRef.current?.isReadyForPlayback,
      getTimings: () => timingsRef.current,
    }),
    [],
  );

  // ---------------------------------------------------------------------
  // 谱表显示范围切换（仅 TAB / 五线谱 + TAB / 仅五线谱）
  // ---------------------------------------------------------------------
  useEffect(() => {
    staveViewRef.current = staveView;
    const api = apiRef.current;
    const score = api?.score;
    if (!api || !score) return;
    if (appliedViewRef.current === staveView) return;
    appliedViewRef.current = staveView;
    applyStaveView(score, activeTrackRef.current, staveView);
    if (score.tracks.length > 1) {
      api.renderTracks([score.tracks[activeTrackRef.current]]);
    } else {
      api.render();
    }
  }, [staveView, phase]);

  // ---------------------------------------------------------------------
  // 播放速度（音调不变）
  // ---------------------------------------------------------------------
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const speed = Math.min(4, Math.max(0.1, playbackSpeed));
    try {
      api.playbackSpeed = speed;
    } catch {
      /* 播放器未就绪时忽略 */
    }
  }, [playbackSpeed, phase, midiRevision, playerReady]);

  useEffect(() => { if (apiRef.current) apiRef.current.masterVolume = volume; }, [volume, midiRevision]);

  // ---------------------------------------------------------------------
  // 播放区间与循环
  // ---------------------------------------------------------------------
  const rangeKey = barRange ? `${barRange.start}:${barRange.end}` : "";
  useEffect(() => {
    if (!preparingRef.current) return;
    countInRef.current?.cancel();
    preparingRef.current = false;
    countInUsedRef.current = false;
    callbacksRef.current.onCountInChange?.(false);
  }, [countIn, playbackSpeed, rangeKey]);
  useEffect(() => {
    const api = apiRef.current;
    const timings = timingsRef.current;
    if (!api || timings.length === 0) return;

    const next = barRange ? barRangeToTicks(timings, barRange.start, barRange.end) : null;
    rangeRef.current = next;
    try {
      if (next) {
        api.playbackRange = { startTick: next.startTick, endTick: next.endTick };
        api.isLooping = loopRef.current;
      } else {
        api.playbackRange = null;
        api.isLooping = loopRef.current;
      }
      if (next && (api.tickPosition < next.startTick || api.tickPosition >= next.endTick)) api.tickPosition = next.startTick;
    } catch {
      /* 忽略 */
    }
    callbacksRef.current.onRangeChange?.(next);
  }, [phase, rangeKey, loop, midiRevision, playerReady]);

  const barCount = summary?.barCount ?? null;

  return (
    <div className="card overflow-hidden">
      {source && phase === "ready" ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
          <span className="text-[12px] font-semibold text-muted">谱表</span>
          {(allowedStaveViews ?? Object.keys(STAVE_VIEW_LABEL) as StaveView[]).map((v) => (
            <button
              key={v}
              type="button"
              className={`btn btn-sm ${staveView === v ? "btn-primary" : ""}`}
              aria-pressed={staveView === v}
              onClick={() => setStaveView(v)}
            >
              {STAVE_VIEW_LABEL[v]}
            </button>
          ))}
          <label className="flex items-center gap-2 text-[12px] text-muted">
            乐谱音量
            <input type="range" min={0} max={300} step={10} value={Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)} aria-label="乐谱音量"
              className="w-24" />
            <span className="w-9 tabular-nums">{Math.round(volume * 100)}%</span>
          </label>
          {positionBar ? (
            <span className="chip ml-auto">当前第 {positionBar} 小节</span>
          ) : null}
          {!positionBar && barCount ? (
            <span className="chip ml-auto">共 {barCount} 小节</span>
          ) : null}
          {mode === "practice" && loop && isPlaying && positionBar ? (
            <span className="chip">循环播放中</span>
          ) : null}
        </div>
      ) : null}

      {/* alphaTab 量取容器宽度排版，容器绝不能用 display:none，
          因此这里让容器始终参与布局，加载/错误状态用绝对定位浮层覆盖。 */}
      <div
        ref={scrollRef}
        className="score-scroll relative max-h-[46vh] min-h-[220px] overflow-auto bg-white px-2 py-3 sm:max-h-[52vh] sm:px-4"
      >
        <div ref={containerRef} className={source ? "min-h-[200px]" : "hidden"} />

        {phase === "loading" && source ? (
          <div className="absolute inset-0 grid place-items-center bg-white/92 text-[13px] text-muted">
            <div className="text-center">
              <div className="pulse-dot text-lg">♪</div>
              <div className="mt-2">正在解析乐谱…</div>
            </div>
          </div>
        ) : null}

        {phase === "error" && source ? (
          <div className="absolute inset-0 grid place-items-center bg-white/95 px-4 text-center">
            <div>
              <div className="text-[14px] font-semibold text-danger">
                乐谱加载失败
              </div>
              <p className="mt-1 max-w-md text-[12.5px] text-muted">
                {phaseMessage || "请确认上传的是有效的 Guitar Pro / MusicXML 文件。"}
              </p>
              {errorAction ? <div className="mt-3">{errorAction}</div> : null}
            </div>
          </div>
        ) : null}

        {!source ? (
          <div className="grid h-[200px] place-items-center px-4 text-center">
            <div>
              <div className="text-[14px] font-semibold">
                这个{mode === "practice" ? "段落" : "曲目"}还没有可播放的乐谱
              </div>
              <p className="mt-1 max-w-md text-[12.5px] text-muted">
                上传 Guitar Pro 或 MusicXML 文件后即可在这里渲染五线谱 + TAB
                并跟练。教材 PDF 只作资料查看。
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {children}
    </div>
  );
}
