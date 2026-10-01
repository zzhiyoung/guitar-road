/**
 * SPEC §5.5 节拍器（M-1 / M-2）—— 内嵌于 Practice 页，不做独立页面。
 *
 * 两种工作模式：
 *  1. 跟随模式（正在播放乐谱）：由 alphaTab 的 tick 位置驱动，保证与乐谱严格同步，
 *     并且随播放速度（Speed%）与 Loop 自动走。
 *  2. 独立模式（未播放）：WebAudio 前瞻调度器（lookahead scheduler）按 BPM 精确发拍，
 *     用于脱离乐谱的纯节拍练习。
 *
 * 实现上用 WebAudio 直接合成 click（正弦短音 + 指数衰减），第一拍 Accent 用更高的音高与音量。
 */

export interface MetronomeOptions {
  bpm: number;
  beatsPerBar: number;
  accentFirst: boolean;
  volume: number; // 0..1
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.12;

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class Metronome {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private beat = 0;

  private following = false;

  /**
   * 代数计数器：stop()/start()/enterFollowMode() 每次调用都递增。
   * start() 在 await ctx.resume() 挂起期间可能被 stop() 或新 start() 超越，
   * 恢复执行时若发现 epoch 已变则立即中止，否则会留下"僵尸定时器"——
   * 表现为 UI 已关闭但节拍器继续响、或与跟随模式同时发声（叠加）。
   */
  private epoch = 0;

  options: MetronomeOptions = {
    bpm: 90,
    beatsPerBar: 4,
    accentFirst: true,
    volume: 0.6,
  };

  /** iOS Safari 要求用户手势内 unlock AudioContext */
  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* 忽略：播放时 alphaTab 也会自行解锁 */
      }
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.options.volume;
      this.gain.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  setVolume(volume: number): void {
    this.options.volume = Math.min(1, Math.max(0, volume));
    if (this.gain) this.gain.gain.value = this.options.volume;
  }

  /** 独立模式启动 */
  async start(): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const myEpoch = ++this.epoch;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* 无音频权限时静默降级 */
      }
      // resume() 挂起期间被 stop()/新 start()/enterFollowMode() 超越 → 放弃本次启动
      if (this.epoch !== myEpoch) return;
    }
    this.stopTimer();
    this.following = false;
    this.beat = 0;
    this.nextNoteTime = ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.schedulerTick(), LOOKAHEAD_MS);
  }

  stop(): void {
    this.epoch++;
    this.stopTimer();
    this.following = false;
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 跟随乐谱播放时调用：切换到 tick 驱动的静默模式（外部负责触发 click） */
  enterFollowMode(): void {
    this.epoch++; // 使仍在挂起的独立模式 start() 作废，防止它恢复后覆盖跟随模式
    this.stopTimer();
    this.following = true;
  }

  get isFollowingPlayback(): boolean {
    return this.following;
  }

  private schedulerTick(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      this.click(this.nextNoteTime, this.beat === 0);
      this.beat = (this.beat + 1) % Math.max(1, this.options.beatsPerBar);
      this.nextNoteTime += 60 / Math.max(20, this.options.bpm);
    }
  }

  /** 按指定拍号位置立即触发一次 click（跟随模式用） */
  triggerBeat(beatInBar: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.click(ctx.currentTime + 0.008, beatInBar === 0);
  }

  private click(time: number, accent: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.gain) return;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    const freq = accent && this.options.accentFirst ? 1760 : 1174.7;
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, time);

    const peak = (accent && this.options.accentFirst ? 0.85 : 0.42) * this.options.volume;
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);

    osc.connect(env);
    env.connect(this.gain);
    osc.start(time);
    osc.stop(time + 0.07);
  }

  dispose(): void {
    this.epoch++;
    this.stopTimer();
    try {
      this.gain?.disconnect();
      void this.ctx?.close();
    } catch {
      /* 忽略 */
    }
    this.ctx = null;
    this.gain = null;
  }
}
