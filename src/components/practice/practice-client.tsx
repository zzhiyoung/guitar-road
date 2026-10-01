"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { completeSessionAction } from "@/app/actions/sessions";
import { Icon } from "@/components/studio";
import { SessionDialog } from "@/components/practice/session-dialog";
import {
  ScorePlayer,
  type ScorePlayerHandle,
  type ScorePlayerPosition,
} from "@/components/player/score-player";
import { Metronome } from "@/lib/audio/metronome";
import type { BarTiming } from "@/lib/alphatab/score-utils";
import {
  BPM_MAX,
  BPM_MIN,
  BPM_STEP_BIG,
  BPM_STEP_SMALL,
  BPM_STEP_TINY,
  FEELINGS,
  FEELING_META,
  SPEED_PRESETS,
  TIME_SIGNATURES,
  clampBpm,
  type Feeling,
} from "@/lib/domain/constants";
import { formatDuration } from "@/lib/domain/date";
import { IDLE_FORM_STATE, type FormState } from "@/lib/domain/form-state";

export interface PracticeScoreFile {
  id: string;
  fileName: string;
  url: string;
  fileType: string;
  trackIndex: number;
}

export interface PracticePageData {
  block: {
    id: string;
    name: string;
    barStart: number;
    barEnd: number;
    currentBpm: number;
    targetBpm: number;
    defaultBpm: number;
    defaultLoop: boolean;
    note: string | null;
    speedTrainingConfig: {
      start: number;
      target: number;
      step: number;
      repeats: number;
    } | null;
  };
  song: { id: string; title: string; artist: string | null };
  scoreFile: PracticeScoreFile | null;
  pdfFile: { url: string; fileName: string } | null;
  notes: { id: string; content: string; barNumber: number | null }[];
  sessions: {
    id: string;
    date: string;
    durationMin: number;
    startBpm: number | null;
    bestBpm: number | null;
    finalBpm: number | null;
    feeling: Feeling | null;
    note: string | null;
  }[];
  todayTaskId: string | null;
  recommendedStartBpm: number;
  personalBestBpm: number | null;
  today: string;
}

interface TrainerState {
  active: boolean;
  config: { start: number; target: number; step: number; repeats: number };
  completedInStep: number;
}

export function PracticeClient({ data }: { data: PracticePageData }) {
  const router = useRouter();
  const { block, song, scoreFile } = data;

  const playerRef = useRef<ScorePlayerHandle>(null);
  const timingsRef = useRef<BarTiming[]>([]);
  const rangeRef = useRef<{ startTick: number; endTick: number } | null>(null);
  const lastBeatKeyRef = useRef<number>(-1);
  const metroRef = useRef<Metronome | null>(null);
  const metroOnRef = useRef(false);
  const bpmRef = useRef(block.currentBpm);
  const playbackStartTickRef = useRef(0);
  const playbackStartingRef = useRef(false);
  const trainerRef = useRef<TrainerState>({
    active: false,
    config: block.speedTrainingConfig ?? {
      start: block.currentBpm,
      target: block.targetBpm,
      step: 5,
      repeats: 3,
    },
    completedInStep: 0,
  });

  const [scoreReady, setScoreReady] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playbackStarting, setPlaybackStarting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(block.currentBpm);
  const [scoreTempo, setScoreTempo] = useState<number>(0);
  const [loopEnabled, setLoopEnabled] = useState(block.defaultLoop);
  const [metroOn, setMetroOn] = useState(false);
  const [metroVolume, setMetroVolume] = useState(0.6);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [accentFirst, setAccentFirst] = useState(true);
  const [positionBar, setPositionBar] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [bestThisSession, setBestThisSession] = useState(block.currentBpm);
  const [trainer, setTrainer] = useState<TrainerState>(trainerRef.current);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [showPdf, setShowPdf] = useState(false);

  const [formState, formAction, formPending] = useActionState<FormState, FormData>(
    completeSessionAction,
    IDLE_FORM_STATE,
  );

  useEffect(() => {
    bpmRef.current = bpm;
    setBestThisSession((prev) => (bpm > prev ? bpm : prev));
  }, [bpm]);

  useEffect(() => {
    metroOnRef.current = metroOn;
  }, [metroOn]);

  // ---------------------------------------------------------------------
  // 练习计时（P-7）：进入页面自动开始；页面不可见时暂停，避免挂机虚增时长
  // ---------------------------------------------------------------------
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // ---------------------------------------------------------------------
  // 速度训练（B-4 / B-5）
  // ---------------------------------------------------------------------
  const onLoopCompleted = useCallback(() => {
    const prev = trainerRef.current;
    if (!prev.active) return;

    const { config } = prev;
    const completed = prev.completedInStep + 1;

    if (completed < config.repeats) {
      const next: TrainerState = { ...prev, completedInStep: completed };
      trainerRef.current = next;
      setTrainer(next);
      return;
    }

    // 本档做满：要么升档，要么到达 Target 收工
    const current = bpmRef.current;
    const reachedTarget = current >= config.target;
    if (reachedTarget) {
      const done: TrainerState = { ...prev, active: false, completedInStep: 0 };
      trainerRef.current = done;
      setTrainer(done);
      return;
    }

    const nextBpm = clampBpm(Math.min(config.target, current + config.step));
    const next: TrainerState = { ...prev, completedInStep: 0 };
    trainerRef.current = next;
    setTrainer(next);
    setBpm(nextBpm);
  }, []);

  // ---------------------------------------------------------------------
  // 播放位置变化：游标 / 节拍器跟随 / 速度训练计数
  // ---------------------------------------------------------------------
  const handlePosition = useCallback(
    (p: ScorePlayerPosition) => {
      // 首次播放时 AudioWorklet 异步启动；等真实播放推进后再开放暂停/停止。
      if (
        playbackStartingRef.current &&
        !p.isSeek &&
        p.tick !== playbackStartTickRef.current
      ) {
        playbackStartingRef.current = false;
        setPlaybackStarting(false);
      }

      if (p.bar) setPositionBar(p.bar);

      if (
        metroOnRef.current &&
        metroRef.current?.isFollowingPlayback &&
        timingsRef.current.length > 0
      ) {
        const key = (p.bar ?? 0) * 100 + (p.beat ?? 0);
        if (key !== lastBeatKeyRef.current) {
          if (lastBeatKeyRef.current !== -1) {
            metroRef.current?.triggerBeat(p.beat ?? 0);
          }
          lastBeatKeyRef.current = key;
        }
      }

      // 速度训练：识别「完整 Loop 一遍」
      const range = rangeRef.current;
      if (range && trainerRef.current.active && p.previousTick >= 0) {
        const wrapped =
          p.previousTick > p.tick &&
          p.tick <= range.startTick + 10 &&
          p.previousTick >= range.endTick - 480;
        if (wrapped) onLoopCompleted();
      }
    },
    [onLoopCompleted],
  );

  const handlePlayerState = useCallback((playing: boolean) => {
    setIsPlaying(playing);
    if (!playing) lastBeatKeyRef.current = -1;
  }, []);

  const startTrainer = () => {
    const config = { ...trainerRef.current.config };
    const next: TrainerState = { active: true, config, completedInStep: 0 };
    trainerRef.current = next;
    setTrainer(next);
    setBpm(clampBpm(config.start));
    setLoopEnabled(true);
  };

  const stopTrainer = () => {
    const next: TrainerState = {
      ...trainerRef.current,
      active: false,
      completedInStep: 0,
    };
    trainerRef.current = next;
    setTrainer(next);
  };

  const updateTrainerConfig = (
    key: keyof TrainerState["config"],
    value: number,
  ) => {
    const config = { ...trainerRef.current.config, [key]: value };
    const next: TrainerState = { ...trainerRef.current, config };
    trainerRef.current = next;
    setTrainer(next);
  };

  // ---------------------------------------------------------------------
  // 节拍器（P-6 / M-1）
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!metroRef.current) metroRef.current = new Metronome();
    const metro = metroRef.current;
    metro.options.bpm = bpm;
    metro.options.beatsPerBar = beatsPerBar;
    metro.options.accentFirst = accentFirst;
    metro.setVolume(metroVolume);
  }, [bpm, beatsPerBar, accentFirst, metroVolume]);

  useEffect(() => {
    const metro = metroRef.current;
    if (!metro) return;
    if (metroOn && !isPlaying) void metro.start();
    else if (!metroOn) metro.stop();
    else if (metroOn && isPlaying) metro.enterFollowMode();
  }, [metroOn, isPlaying]);

  useEffect(() => () => metroRef.current?.dispose(), []);

  // ---------------------------------------------------------------------
  // 播放控制
  // ---------------------------------------------------------------------
  const togglePlay = async () => {
    const player = playerRef.current;
    if (!player || !player.readyForPlayback() || playbackStartingRef.current) {
      return;
    }
    await metroRef.current?.unlock();

    if (!isPlaying && rangeRef.current && loopEnabled) {
      const { startTick, endTick } = rangeRef.current;
      const current = player.getTickPosition();
      if (current < startTick || current >= endTick) {
        player.setTickPosition(startTick);
      }
    }
    if (!isPlaying) {
      playbackStartTickRef.current = player.getTickPosition();
      playbackStartingRef.current = true;
      setPlaybackStarting(true);
    }
    player.playPause();
  };

  const stopPlayback = () => {
    const player = playerRef.current;
    if (!player || playbackStartingRef.current) return;
    player.stop();
    if (rangeRef.current) player.setTickPosition(rangeRef.current.startTick);
  };

  const nudgeBpm = (delta: number) => {
    setBpm((prev) => clampBpm(prev + delta));
  };

  const speedPercent = useMemo(
    () => (scoreTempo > 0 ? Math.round((bpm / scoreTempo) * 100) : 100),
    [bpm, scoreTempo],
  );

  const elapsedMinutes = Math.max(1, Math.round(seconds / 60));
  const todayBest = Math.max(bestThisSession, block.currentBpm);

  // 表单提交成功后跳转（服务端返回 redirectTo）
  useEffect(() => {
    if (formState.status === "ok" && formState.redirectTo) {
      router.push(formState.redirectTo);
    }
  }, [formState, router]);

  return (
    <div className="space-y-6">
      <header className="practice-header">
        <div className="min-w-0">
          <nav className="flex flex-wrap gap-2 text-[12px] text-muted" aria-label="练习位置"><Link href="/" className="inline-flex min-h-11 items-center hover:text-accent">‹ 今日练习</Link><span className="flex items-center">/</span><Link href={`/library/${song.id}`} className="inline-flex min-h-11 items-center hover:text-accent">{song.title}{song.artist ? ` · ${song.artist}` : ""}</Link></nav>
          <h1 className="break-words">{block.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted"><span className="chip">第 {block.barStart}–{block.barEnd} 小节</span><span>原速 {scoreTempo || "—"} BPM · 目标 {block.targetBpm} BPM</span>{data.personalBestBpm ? <span>· 历史最高 {data.personalBestBpm} BPM</span> : null}</div>
        </div>
        <div className="practice-top-actions"><span className="chip border-transparent bg-good-soft text-good"><Icon name="clock" width="15" />已停留 {formatDuration(elapsedMinutes)}</span><button type="button" className="btn btn-accent" onClick={() => setSessionOpen(true)}>结束并记录</button></div>
      </header>

      {/* ---------------- 乐谱区（P-2） ----------------
          复用通用 ScorePlayer：Practice 只补充段落区间 / 循环 / BPM 等业务语义。 */}
      <ScorePlayer
        ref={playerRef}
        source={scoreFile}
        mode="practice"
        barRange={{ start: block.barStart, end: block.barEnd }}
        loop={loopEnabled}
        playbackSpeed={scoreTempo > 0 ? Math.min(4, Math.max(0.1, bpm / scoreTempo)) : 1}
        onScoreLoaded={({ summary, timings }) => {
          timingsRef.current = timings;
          setScoreTempo(summary.tempo);
          setBeatsPerBar(summary.initialTimeSignature.numerator);
          setScoreReady(true);
        }}
        onPlayerReadyChange={setPlayerReady}
        onPlayerStateChange={handlePlayerState}
        onPositionChange={handlePosition}
        onRangeChange={(range) => {
          rangeRef.current = range;
        }}
        errorAction={
          <Link href={`/library/${song.id}?setup=1`} className="btn btn-sm">
            重新导入
          </Link>
        }
      >
        {data.pdfFile ? (
          <div className="flex items-center gap-2 border-t border-line px-3 py-2 text-[12.5px]">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setShowPdf((v) => !v)}
            >
              {showPdf ? "收起 PDF" : "📄 打开配套资料"}
            </button>
            <span className="truncate text-faint">{data.pdfFile.fileName}</span>
          </div>
        ) : null}
        {showPdf && data.pdfFile ? (
          <iframe
            src={data.pdfFile.url}
            className="h-[420px] w-full border-t border-line"
            title="练习资料"
          />
        ) : null}
      </ScorePlayer>

      <section className="card card-pad practice-transport" aria-label="播放与练习速度">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-accent btn-icon !h-14 !w-14 !rounded-full" onClick={togglePlay} disabled={!scoreReady || !playerReady || playbackStarting} aria-label={playbackStarting ? "正在启动播放" : isPlaying ? "暂停" : "播放"}><Icon name={isPlaying ? "pause" : "play"} width="24" /></button>
            <button type="button" className="btn btn-icon" onClick={stopPlayback} disabled={!scoreReady || !playerReady || playbackStarting} aria-label="停止"><Icon name="stop" width="18" /></button>
            <button type="button" className={`btn btn-sm ${loopEnabled ? "btn-accent" : ""}`} onClick={() => setLoopEnabled(v => !v)} disabled={!scoreReady} aria-pressed={loopEnabled} title="按练习段落的小节范围循环"><Icon name="loop" width="18" />循环{loopEnabled ? "开启" : "关闭"}</button>
            <button type="button" className={`btn btn-sm ${metroOn ? "btn-accent" : ""}`} onClick={() => { void metroRef.current?.unlock(); setMetroOn(v => !v); }} aria-pressed={metroOn}>节拍器{metroOn ? "开启" : "关闭"}</button>
          </div>
          <div>
            <label className="label" htmlFor="practice-bpm">练习速度</label>
            <div className="flex items-center gap-3">
              <button type="button" className="btn btn-sm" onClick={() => nudgeBpm(-BPM_STEP_SMALL)} aria-label="降低 5 BPM">−{BPM_STEP_SMALL}</button>
              <input id="practice-bpm" className="input !w-24 text-center font-mono font-bold" type="number" min={BPM_MIN} max={BPM_MAX} value={bpm} onChange={e => setBpm(clampBpm(Number(e.target.value)))} />
              <span className="text-[12px] text-white/80">BPM</span>
              <button type="button" className="btn btn-sm" onClick={() => nudgeBpm(BPM_STEP_SMALL)} aria-label="提高 5 BPM">＋{BPM_STEP_SMALL}</button>
            </div>
          </div>
        </div>
        <details className="mt-4 border-t border-white/20 pt-2">
          <summary className="justify-between text-[12px] text-white/85"><span>更多速度设置 · 播放速度 {speedPercent}%</span><span>展开 ↓</span></summary>
          <div className="grid gap-5 py-3 sm:grid-cols-2">
            <div><span className="label">精细调整</span><div className="flex flex-wrap items-center gap-2">
              {[-BPM_STEP_BIG,-BPM_STEP_TINY,BPM_STEP_TINY,BPM_STEP_BIG].map(step => <button key={step} type="button" className="btn btn-sm" onClick={() => nudgeBpm(step)}>{step > 0 ? "+" : ""}{step}</button>)}
              <input type="range" min={BPM_MIN} max={BPM_MAX} value={bpm} onChange={e => setBpm(clampBpm(Number(e.target.value)))} className="min-w-[120px] flex-1" aria-label="滑动调整练习 BPM" />
            </div></div>
            <div><span className="label">播放速度 · 音调不变</span><div className="flex flex-wrap gap-2">{SPEED_PRESETS.map(p => <button key={p} type="button" className={`btn btn-sm ${speedPercent === p ? "btn-primary" : ""}`} disabled={!scoreTempo} onClick={() => setBpm(clampBpm(Math.round(scoreTempo*p/100)))} aria-pressed={speedPercent === p}>{p}%</button>)}<button type="button" className="btn btn-sm btn-ghost" onClick={() => setBpm(clampBpm(data.recommendedStartBpm))}>建议起手 {data.recommendedStartBpm} BPM</button></div></div>
          </div>
        </details>
        {/* ---------------- 节拍器设置（M-1） ---------------- */}
        {metroOn ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 metro-settings rounded-xl border border-line bg-surface2 px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-semibold text-muted">拍号</span>
              {TIME_SIGNATURES.map((ts) => (
                <button
                  key={ts.value}
                  type="button"
                  className={`btn btn-sm ${
                    beatsPerBar === ts.numerator ? "btn-primary" : ""
                  }`}
                  onClick={() => setBeatsPerBar(ts.numerator)}
                  title="停止播放时按此拍号发拍；播放中跟随乐谱实际拍号"
                >
                  {ts.value}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={accentFirst}
                onChange={(e) => setAccentFirst(e.target.checked)}
              />
              第一拍重音
            </label>
            <label className="flex items-center gap-2 text-[12.5px]">
              音量
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(metroVolume * 100)}
                onChange={(e) => setMetroVolume(Number(e.target.value) / 100)}
                className="h-1.5 w-[110px] accent-[var(--color-accent)]"
              />
            </label>
            <span className="text-[11.5px] text-faint">
              {isPlaying ? "跟随乐谱拍号同步发拍" : "独立按设定拍号发拍"}
            </span>
          </div>
        ) : null}

      </section>

      <div className="practice-secondary-grid">
      {/* ---------------- 速度训练（B-4 / B-5） ---------------- */}
      <details className="card card-pad" open={trainer.active || undefined}><summary className="justify-between text-[17px] font-bold"><span>速度训练</span><span className="text-[12px] font-normal text-muted">{trainer.active ? "训练进行中" : "展开设置 ↓"}</span></summary><div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13.5px] font-semibold">速度训练</div>
          <div className="flex items-center gap-2">
            {trainer.active ? (
              <>
                <span className="chip border-accent/30 bg-accent-soft text-accent">
                  进行中 {trainer.completedInStep}/{trainer.config.repeats} 遍
                </span>
                <button type="button" className="btn btn-sm" onClick={stopTrainer}>
                  结束训练
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-sm" onClick={startTrainer}>
                开始训练
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["start", "起手 BPM"],
              ["target", "目标 BPM"],
              ["step", "每档递增 BPM"],
              ["repeats", "每档重复"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="text-[11.5px] font-semibold text-faint">{label}</span>
              <input
                type="number"
                className="input mt-0.5 py-1.5 text-[13px]"
                value={trainer.config[key]}
                min={key === "repeats" ? 1 : undefined}
                onChange={(e) => updateTrainerConfig(key, Number(e.target.value))}
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-faint">
          规则：从起手速度开始，每完整循环 {trainer.config.repeats} 遍自动 +
          {trainer.config.step} BPM，直到目标速度。结束时请核对本次最高速度。
        </p>
      </div></details>

      {/* ---------------- 目标 / 最佳 / Note / 完成（P-1 / P-8） ---------------- */}
      <div className="card card-pad">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              当前
            </div>
            <div className="text-[19px] font-bold">{bpm} BPM</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              目标
            </div>
            <div className="text-[19px] font-bold text-accent">
              {block.targetBpm} BPM
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              本次最高
            </div>
            <div className="text-[19px] font-bold">{todayBest} BPM</div>
          </div>
          {data.personalBestBpm ? (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                历史最高
              </div>
              <div className="text-[19px] font-bold">{data.personalBestBpm} BPM</div>
            </div>
          ) : null}
          <button
            type="button"
            className="btn btn-accent ml-auto"
            onClick={() => setSessionOpen(true)}
          >
            完成本次练习
          </button>
        </div>

        {block.note ? (
          <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
            练习提示：{block.note}
          </p>
        ) : null}
      </div>

      </div>
      {/* ---------------- Note 区（N-2） ---------------- */}
      <details className="card card-pad"><summary className="justify-between"><span className="font-semibold">段落笔记</span><span className="text-[12px] text-muted">展开 ↓</span></summary>

        <ul className="mt-2 space-y-1.5">
          {data.notes.length === 0 ? (
            <li className="text-[12.5px] text-faint">还没有笔记</li>
          ) : (
            data.notes.map((n) => (
              <li key={n.id} className="text-[12.5px] text-muted">
                {n.barNumber ? (
                  <span className="chip mr-1.5">第 {n.barNumber} 小节</span>
                ) : null}
                {n.content}
              </li>
            ))
          )}
        </ul>
        <Link
          href={`/library/${song.id}`}
          className="btn btn-sm btn-ghost mt-2 px-0 text-muted"
        >
          在曲目详情页管理笔记 →
        </Link>
      </details>

      {/* ---------------- 练习历史 ---------------- */}
      {data.sessions.length > 0 ? (
        <details className="card card-pad"><summary className="justify-between"><span className="font-semibold">该段落的练习记录</span><span className="text-[12px] text-muted">展开 ↓</span></summary>

          <div className="mt-2 divide-y divide-line">
            {data.sessions.slice(0, 8).map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[12.5px]"
              >
                <span className="w-[74px] text-faint">{s.date}</span>
                <span>{formatDuration(s.durationMin)}</span>
                {s.startBpm && s.finalBpm ? (
                  <span className="text-muted">
                    {s.startBpm} → {s.finalBpm} BPM
                  </span>
                ) : null}
                {s.bestBpm ? (
                  <span className="font-semibold text-accent">最高 {s.bestBpm}</span>
                ) : null}
                {s.feeling ? <span>{FEELING_META[s.feeling].emoji}</span> : null}
                {s.note ? (
                  <span className="text-faint">「{s.note}」</span>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {/* ---------------- 完成本次练习表单（P-8 / S-1~S-3） ---------------- */}
      {sessionOpen ? (
        <SessionDialog onClose={() => setSessionOpen(false)}>
          <div>
            <div className="flex items-center justify-between">
              <h2 id="session-dialog-title" className="serif-heading">给今天的练习，留一个脚印。</h2>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setSessionOpen(false)}
              >
                关闭
              </button>
            </div>
            <p className="mt-1 text-[12.5px] text-muted">
              页面停留 {formatDuration(elapsedMinutes)} · 最高练习速度 {todayBest} BPM，请核对实际练习时长和完成情况。
            </p>

            <form action={formAction} className="mt-6 space-y-5">
              <input type="hidden" name="blockId" value={block.id} />
              <input type="hidden" name="date" value={data.today} />
              {data.todayTaskId ? (
                <input type="hidden" name="taskId" value={data.todayTaskId} />
              ) : null}

              <div className="grid grid-cols-2 gap-2.5">
                <label className="block">
                  <span className="label">实际练习时长（分钟）</span>
                  <input
                    className="input"
                    type="number"
                    name="durationMin"
                    min={1}
                    defaultValue={elapsedMinutes}
                    required
                  />
                </label>
                <label className="block">
                  <span className="label">起手速度（BPM）</span>
                  <input
                    className="input"
                    type="number"
                    name="startBpm"
                    defaultValue={block.currentBpm}
                  />
                </label>
                <label className="block">
                  <span className="label">本次最高速度（BPM）</span>
                  <input
                    className="input"
                    type="number"
                    name="bestBpm"
                    defaultValue={todayBest}
                  />
                </label>
                <label className="block">
                  <span className="label">结束速度（BPM）</span>
                  <input
                    className="input"
                    type="number"
                    name="finalBpm"
                    defaultValue={bpm}
                  />
                </label>
              </div>

              <div>
                <span className="label">感觉</span>
                <div className="flex gap-2">
                  {FEELINGS.map((f) => (
                    <label
                      key={f}
                      className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line-strong min-h-12 px-3 py-3 text-[13px] has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                    >
                      <input
                        type="radio"
                        name="feeling"
                        value={f}
                        defaultChecked={f === "normal"}
                        className="sr-only peer"
                      />
                      <span className="rounded-md peer-focus-visible:outline-2 peer-focus-visible:outline-accent">{FEELING_META[f].emoji}</span>
                      {FEELING_META[f].label}
                    </label>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="label">留给下次的自己（选填）</span>
                <textarea
                  className="input min-h-[64px]"
                  name="note"
                  placeholder="例如：82 BPM 能弹，但 B 段换把还不稳定"
                />
              </label>

              {formState.status === "error" ? (
                <p role="alert" className="text-[12.5px] text-danger">{formState.message}</p>
              ) : null}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  className="btn btn-accent flex-1"
                  disabled={formPending}
                >
                  {formPending ? "保存中…" : "保存并结束"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSessionOpen(false)}
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </SessionDialog>
      ) : null}
    </div>
  );
}
