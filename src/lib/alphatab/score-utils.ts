import type * as alphaTabNS from "@coderline/alphatab";

type Score = alphaTabNS.model.Score;

/** Practice follows written bar order; the practice loop owns all repetition.
 * Restore notation immediately after synchronous MIDI generation. */
export function withLinearPracticePlayback(score: Score, generate: () => void): void {
  const originals = score.masterBars.map((bar) => ({ bar, repeatCount: bar.repeatCount,
    alternateEndings: bar.alternateEndings, directions: bar.directions }));
  const groups = new Map(score.masterBars.map((bar) => [bar.repeatGroup, bar.repeatGroup.isClosed]));
  try {
    for (const { bar } of originals) { bar.repeatCount = 0; bar.alternateEndings = 0; bar.directions = null; }
    for (const group of groups.keys()) group.isClosed = false;
    generate();
  } finally {
    for (const { bar, repeatCount, alternateEndings, directions } of originals) {
      bar.repeatCount = repeatCount; bar.alternateEndings = alternateEndings; bar.directions = directions;
    }
    for (const [group, closed] of groups) group.isClosed = closed;
  }
}

export interface BarTiming {
  /** 该小节起始 tick */
  startTick: number;
  /** 该小节时长（tick） */
  durationTicks: number;
  /** 每拍 tick 数 */
  ticksPerBeat: number;
  /** 分子（拍数） */
  beatsPerBar: number;
}

/**
 * SPEC §5.3 P-3：Loop 按 Block 的起止小节循环。
 * alphaTab 的 playbackRange 用 midi tick 表达，这里把 1-based 小节号换算为 tick 区间。
 */
export function barTimings(score: Score): BarTiming[] {
  const bars = score.masterBars;
  const out: BarTiming[] = [];
  let startTick = 0;
  for (let i = 0; i < bars.length; i++) {
    const mb = bars[i];
    const durationTicks = Math.max(1, mb.calculateDuration());
    const beatsPerBar = Math.max(1, mb.timeSignatureNumerator);
    out.push({
      startTick,
      durationTicks,
      ticksPerBeat: 960 * 4 / Math.max(1, mb.timeSignatureDenominator),
      beatsPerBar,
    });
    startTick += durationTicks;
  }
  return out;
}

export function totalTicks(timings: BarTiming[]): number {
  if (timings.length === 0) return 0;
  const last = timings[timings.length - 1];
  return last.startTick + last.durationTicks;
}

/** 1-based 小节区间 → tick 区间（自动夹取到合法范围） */
export function barRangeToTicks(
  timings: BarTiming[],
  barStart: number,
  barEnd: number,
): { startTick: number; endTick: number } {
  if (timings.length === 0) return { startTick: 0, endTick: 0 };
  const s = Math.min(Math.max(1, Math.floor(barStart)), timings.length);
  const e = Math.min(Math.max(s, Math.floor(barEnd)), timings.length);
  const startTick = timings[s - 1].startTick;
  const endTick =
    e < timings.length
      ? timings[e].startTick
      : timings[e - 1].startTick + timings[e - 1].durationTicks;
  return { startTick, endTick };
}

/** tick → 所在小节（1-based）与拍序号（0-based） */
export function locateTick(
  timings: BarTiming[],
  tick: number,
): { bar: number; beat: number; beatsPerBar: number } | null {
  if (timings.length === 0) return null;
  let index = 0;
  for (let i = timings.length - 1; i >= 0; i--) {
    if (tick >= timings[i].startTick) {
      index = i;
      break;
    }
  }
  const t = timings[index];
  const offset = Math.max(0, tick - t.startTick);
  const beat = Math.min(
    t.beatsPerBar - 1,
    Math.floor(offset / Math.max(1, t.ticksPerBeat)),
  );
  return { bar: index + 1, beat, beatsPerBar: t.beatsPerBar };
}

/** SPEC §5.6 I-2/I-3：GP 文件里可读到的曲名 / 艺术家 / 轨道清单 */
export interface ScoreSummary {
  title: string;
  artist: string;
  tempo: number;
  barCount: number;
  tracks: { index: number; name: string; isPercussion: boolean }[];
  initialTimeSignature: { numerator: number; denominator: number };
}

export function summarizeScore(score: Score): ScoreSummary {
  const firstBar = score.masterBars[0];
  return {
    title: (score.title || "").replace(/\u00a0/g, " ").trim(),
    artist: (score.artist || score.music || score.words || "").replace(/\u00a0/g, " ").trim(),
    tempo: score.tempo > 0 ? score.tempo : 120,
    barCount: score.masterBars.length,
    tracks: score.tracks.map((track, index) => ({
      index,
      name: track.name || `Track ${index + 1}`,
      isPercussion: !!track.isPercussion,
    })),
    initialTimeSignature: {
      numerator: firstBar?.timeSignatureNumerator ?? 4,
      denominator: firstBar?.timeSignatureDenominator ?? 4,
    },
  };
}

/** SPEC §5.3 P-2：乐谱区展示什么 */
export type StaveView = "scoreTab" | "tab" | "score";

export const STAVE_VIEW_LABEL: Record<StaveView, string> = {
  scoreTab: "五线谱 + TAB",
  tab: "仅 TAB",
  score: "仅五线谱",
};

/**
 * 修正谱表显示范围。
 *
 * 注意（alphaTab 1.8 实测）：`display.staveProfile = ScoreTab` 并**不会**覆盖
 * 每个 `Staff` 自身的 `showStandardNotation` / `showTablature` 标记。
 * Guitar Pro 导入的吉他轨通常两者皆 true，但 MusicXML（以及部分 GP 变体）导入后
 * 可能只留下 `showTablature = true`，导致 SPEC P-2 要求的"五线谱 + TAB"只剩 TAB。
 * 因此这里在 scoreLoaded 后用公开 API 显式设置，再重新渲染。
 */
export function applyStaveView(
  score: Score,
  trackIndex: number,
  view: StaveView,
): void {
  const staff = score.tracks[trackIndex]?.staves?.[0];
  if (!staff) return;
  staff.showStandardNotation = view !== "tab";
  // 非弦乐器（如钢琴轨）不生成 TAB 谱表
  staff.showTablature = staff.isStringed ? view !== "score" : false;
}
