"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import {
  ScorePlayer,
  type ScorePlayerHandle,
  type ScorePlayerPosition,
} from "@/components/player/score-player";
import { Icon } from "@/components/studio";
import { ProgressBar } from "@/components/ui";
import { totalTicks, type BarTiming } from "@/lib/alphatab/score-utils";
import { SONG_SPEED_PRESETS } from "@/lib/domain/constants";

export interface SongPlayerScoreFile {
  id: string;
  fileName: string;
  url: string;
  fileType: string;
  trackIndex: number;
}

export interface SongPlayerData {
  song: { id: string; title: string; artist: string | null };
  scoreFile: SongPlayerScoreFile | null;
}

/**
 * 整曲播放（SPEC §3.2 / §3.7）。
 *
 * 关键约束：这是**只读**的听/看体验 —— 不创建 Practice Block、不产生
 * Practice Session、不计入练习时长与 Streak。需要针对性练习时才去建 Block。
 */
export function SongPlayer({ data }: { data: SongPlayerData }) {
  const { song, scoreFile } = data;

  const playerRef = useRef<ScorePlayerHandle>(null);
  const timingsRef = useRef<BarTiming[]>([]);
  const startingRef = useRef(false);
  const startTickRef = useRef(0);

  const [scoreReady, setScoreReady] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tick, setTick] = useState(0);
  const [total, setTotal] = useState(0);
  const [positionBar, setPositionBar] = useState<number | null>(null);
  const [barCount, setBarCount] = useState(0);

  const handlePosition = useCallback((p: ScorePlayerPosition) => {
    // AudioWorklet 首次启动是异步的；等真实推进后再放开暂停/停止
    if (startingRef.current && !p.isSeek && p.tick !== startTickRef.current) {
      startingRef.current = false;
      setStarting(false);
    }
    setTick(p.tick);
    if (p.bar) setPositionBar(p.bar);
  }, []);

  const togglePlay = () => {
    const player = playerRef.current;
    if (!player || !player.readyForPlayback() || startingRef.current) return;
    if (!isPlaying) {
      startTickRef.current = player.getTickPosition();
      startingRef.current = true;
      setStarting(true);
    }
    player.playPause();
  };

  /** ■ 停止并回到开头 */
  const stopPlayback = () => {
    const player = playerRef.current;
    if (!player || startingRef.current) return;
    player.stop();
    player.setTickPosition(0);
  };

  /** |◀ 从头开始播放 */
  const playFromStart = () => {
    const player = playerRef.current;
    if (!player || !player.readyForPlayback()) return;
    player.stop();
    player.setTickPosition(0);
    startTickRef.current = 0;
    startingRef.current = true;
    setStarting(true);
    player.playPause();
  };

  const progress = total > 0 ? Math.min(100, (tick / total) * 100) : 0;
  const transportDisabled = !scoreReady || !playerReady || starting;

  return (
    <div className="space-y-6">
      <header className="practice-header">
        <div className="min-w-0">
          <nav
            className="flex flex-wrap gap-2 text-[12px] text-muted"
            aria-label="播放位置"
          >
            <Link
              href={`/library/${song.id}`}
              className="inline-flex min-h-11 items-center hover:text-accent"
            >
              ‹ 返回曲目
            </Link>
          </nav>
          <h1 className="break-words">{song.title}</h1>
          {song.artist ? (
            <p className="mt-1 text-[13px] text-muted">{song.artist}</p>
          ) : null}
        </div>
        <div className="practice-top-actions">
          <span className="chip border-transparent bg-good-soft text-good">
            整曲播放 · 不计入练习记录
          </span>
          <Link href={`/library/${song.id}?setup=1`} className="btn">
            ＋ 新建练习段落
          </Link>
        </div>
      </header>

      <ScorePlayer
        ref={playerRef}
        source={scoreFile}
        mode="song"
        playbackSpeed={speed}
        onScoreLoaded={({ summary, timings }) => {
          timingsRef.current = timings;
          setTotal(totalTicks(timings));
          setBarCount(summary.barCount);
          setScoreReady(true);
        }}
        onPlayerReadyChange={setPlayerReady}
        onPlayerStateChange={(playing) => {
          setIsPlaying(playing);
          if (!playing && startingRef.current) {
            startingRef.current = false;
            setStarting(false);
          }
        }}
        onPositionChange={handlePosition}
      />

      <section className="card card-pad practice-transport" aria-label="整曲播放控制">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-icon"
            onClick={playFromStart}
            disabled={transportDisabled}
            aria-label="从头播放"
          >
            <Icon name="loop" width="18" />
          </button>
          <button
            type="button"
            className="btn btn-accent btn-icon !h-14 !w-14 !rounded-full"
            onClick={togglePlay}
            disabled={transportDisabled}
            aria-label={starting ? "正在启动播放" : isPlaying ? "暂停" : "播放"}
          >
            <Icon name={isPlaying ? "pause" : "play"} width="24" />
          </button>
          <button
            type="button"
            className="btn btn-icon"
            onClick={stopPlayback}
            disabled={transportDisabled}
            aria-label="停止"
          >
            <Icon name="stop" width="18" />
          </button>

          <div className="min-w-[180px] flex-1">
            <div className="mb-1.5 flex items-center justify-between text-[11.5px]">
              <span>
                {positionBar && barCount
                  ? `第 ${positionBar} / ${barCount} 小节`
                  : "—"}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <ProgressBar value={progress} max={100} color="var(--color-accent)" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/20 pt-4">
          <div>
            <span className="label">速度</span>
            <div className="flex flex-wrap gap-2">
              {SONG_SPEED_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`btn btn-sm ${Math.round(speed * 100) === p ? "btn-primary" : ""}`}
                  aria-pressed={Math.round(speed * 100) === p}
                  onClick={() => setSpeed(p / 100)}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
          <p className="min-w-[220px] flex-1 text-[11.5px] text-white/80">
            整曲播放不会影响 BPM 进度与连续练习天数。想攻克某个段落时，再去创建练习段落。
          </p>
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-3xl bg-good-soft p-6 text-[13px] leading-7 text-good">
        <Icon name="music" className="mt-1 shrink-0" />
        <p>
          需要循环某个段落、逐步提速并记录成绩时，用「新建练习段落」进入练习模式。
        </p>
      </div>
    </div>
  );
}
