"use client";

import { useMemo, useState } from "react";

import { shortDateLabel } from "@/lib/domain/date";

export interface BlockProgressInput {
  blockId: string;
  blockName: string;
  songTitle: string;
  currentBpm: number;
  targetBpm: number;
  deltaBpm: number;
  points: { date: string; bestBpm: number }[];
}

/**
 * SPEC §5.10 D-2 —— BPM Progress 曲线（Dashboard 最有价值的一张图）。
 * 手写 SVG，避免为一张图引入图表库。
 */
export function BpmProgressPanel({ blocks }: { blocks: BlockProgressInput[] }) {
  const [activeId, setActiveId] = useState(blocks[0]?.blockId ?? "");
  const active = blocks.find((b) => b.blockId === activeId) ?? blocks[0];

  const chart = useMemo(() => buildChart(active), [active]);

  if (!active || !chart) {
    return (
      <div className="py-8 text-center text-[12.5px] text-muted">
        还没有练习记录，练一次并完成后就会出现在这里。
      </div>
    );
  }

  const last = active.points[active.points.length - 1];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {blocks.map((b) => (
          <button
            key={b.blockId}
            type="button"
            className={`btn btn-sm ${b.blockId === active.blockId ? "btn-primary" : ""}`}
            aria-pressed={b.blockId === active.blockId}
            onClick={() => setActiveId(b.blockId)}
          >
            {b.blockName}
            <span className="opacity-60">· {b.songTitle}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
        <span>
          {active.points.length} 个数据点 · {active.points[0].date} → {last.date}
        </span>
        <span>
          最近最高 <strong className="text-ink">{last.bestBpm}</strong> BPM
        </span>
        <span>
          目标 <strong className="text-accent">{active.targetBpm}</strong> BPM
        </span>
        {active.deltaBpm !== 0 ? (
          <span className={active.deltaBpm > 0 ? "text-good" : "text-faint"}>
            {active.deltaBpm > 0 ? "↑" : "↓"} {Math.abs(active.deltaBpm)} BPM
          </span>
        ) : null}
      </div>

      <svg
        viewBox="0 0 660 240"
        className="mt-2 w-full"
        role="img"
        aria-label="记录的最高 BPM 随时间变化曲线"
      >
        {/* Y 轴网格 */}
        {chart.ticks.map((t) => (
          <g key={t.value}>
            <line
              x1={chart.padLeft}
              x2={chart.width - chart.padRight}
              y1={t.y}
              y2={t.y}
              stroke="var(--color-line)"
              strokeWidth={1}
            />
            <text
              x={chart.padLeft - 8}
              y={t.y + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--color-faint)"
            >
              {t.value}
            </text>
          </g>
        ))}

        {/* 目标线 */}
        {chart.targetY !== null ? (
          <>
            <line
              x1={chart.padLeft}
              x2={chart.width - chart.padRight}
              y1={chart.targetY}
              y2={chart.targetY}
              stroke="var(--color-accent)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <text
              x={chart.width - chart.padRight}
              y={chart.targetY - 6}
              textAnchor="end"
              fontSize={11}
              fill="var(--color-accent)"
            >
              目标 {active.targetBpm}
            </text>
          </>
        ) : null}

        {/* 折线 */}
        <polyline
          points={chart.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="var(--color-info)"
          strokeWidth={2.4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* 面积填充 */}
        <polygon
          points={`${chart.points[0].x},${chart.baseY} ${chart.points
            .map((p) => `${p.x},${p.y}`)
            .join(" ")} ${chart.points[chart.points.length - 1].x},${chart.baseY}`}
          fill="var(--color-info)"
          opacity={0.08}
        />

        {/* 数据点 + 数值 */}
        {chart.points.map((p) => (
          <g key={p.date}>
            <circle cx={p.x} cy={p.y} r={4} fill="#fff" stroke="var(--color-info)" strokeWidth={2} />
            <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={10.5} fill="var(--color-muted)">
              {p.bestBpm}
            </text>
          </g>
        ))}

        {/* X 轴标签 */}
        {chart.xLabels.map((l) => (
          <text
            key={l.date}
            x={l.x}
            y={chart.height - 26}
            textAnchor="middle"
            fontSize={11}
            fill="var(--color-faint)"
          >
            {shortDateLabel(l.date)}
          </text>
        ))}

        {/* 轴 */}
        <line
          x1={chart.padLeft}
          x2={chart.width - chart.padRight}
          y1={chart.baseY}
          y2={chart.baseY}
          stroke="var(--color-line-strong)"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}

interface ChartPoint {
  date: string;
  bestBpm: number;
  x: number;
  y: number;
}

function buildChart(block: BlockProgressInput | undefined) {
  if (!block || block.points.length === 0) return null;

  const width = 660;
  const height = 240;
  const padLeft = 44;
  const padRight = 16;
  const padTop = 24;
  const padBottom = 44;
  const baseY = height - padBottom;

  const points = block.points;
  const values = points.map((p) => p.bestBpm);
  const lo = Math.min(...values, block.targetBpm);
  const hi = Math.max(...values, block.targetBpm);
  const span = Math.max(6, hi - lo);
  const yMin = Math.floor(lo - span * 0.15);
  const yMax = Math.ceil(hi + span * 0.25);

  const dayNum = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return Date.UTC(y, (m ?? 1) - 1, dd ?? 1) / 86_400_000;
  };
  const days = points.map((p) => dayNum(p.date));
  const minDay = Math.min(...days);
  const maxDay = Math.max(...days);
  const daySpan = Math.max(1, maxDay - minDay);

  const xAt = (i: number) =>
    padLeft + ((days[i] - minDay) / daySpan) * (width - padLeft - padRight);
  const yAt = (v: number) =>
    padTop + (1 - (v - yMin) / Math.max(1, yMax - yMin)) * (baseY - padTop);

  const chartPoints: ChartPoint[] = points.map((p, i) => ({
    date: p.date,
    bestBpm: p.bestBpm,
    x: points.length === 1 ? (padLeft + width - padRight) / 2 : xAt(i),
    y: yAt(p.bestBpm),
  }));

  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const value = Math.round(yMin + ((yMax - yMin) * i) / tickCount);
    return { value, y: yAt(value) };
  });

  const labelIdx = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

  return {
    width,
    height,
    padLeft,
    padRight,
    baseY,
    points: chartPoints,
    ticks,
    targetY: yAt(block.targetBpm),
    xLabels: labelIdx.map((i) => ({ date: points[i].date, x: chartPoints[i].x })),
  };
}

/** 本周每日练习时长柱状图 */
export function WeeklyMinutesChart({
  days,
}: {
  days: { date: string; minutes: number; isToday: boolean }[];
}) {
  const max = Math.max(30, ...days.map((d) => d.minutes));
  const width = 660;
  const height = 170;
  const padLeft = 32;
  const padBottom = 30;
  const plotH = height - padBottom - 16;
  const slot = (width - padLeft - 12) / days.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="本周每日练习时长">
      {[0.5, 1].map((r) => (
        <line
          key={r}
          x1={padLeft}
          x2={width - 12}
          y1={16 + plotH * (1 - r)}
          y2={16 + plotH * (1 - r)}
          stroke="var(--color-line)"
        />
      ))}
      <text x={padLeft - 6} y={20} textAnchor="end" fontSize={10.5} fill="var(--color-faint)">
        {Math.round(max)}
      </text>
      <text
        x={padLeft - 6}
        y={16 + plotH + 4}
        textAnchor="end"
        fontSize={10.5}
        fill="var(--color-faint)"
      >
        0
      </text>

      {days.map((d, i) => {
        const h = (d.minutes / max) * plotH;
        const x = padLeft + i * slot + slot * 0.22;
        const w = slot * 0.56;
        const y = 16 + plotH - h;
        return (
          <g key={d.date}>
            <rect
              x={x}
              y={y}
              width={w}
              height={Math.max(d.minutes > 0 ? 3 : 0, h)}
              rx={4}
              fill={d.isToday ? "var(--color-accent)" : "var(--color-good)"}
            />
            {d.minutes > 0 ? (
              <text
                x={x + w / 2}
                y={y - 5}
                textAnchor="middle"
                fontSize={10.5}
                fill="var(--color-muted)"
              >
                {d.minutes}
              </text>
            ) : null}
            <text
              x={x + w / 2}
              y={height - 10}
              textAnchor="middle"
              fontSize={11}
              fill={d.isToday ? "var(--color-accent)" : "var(--color-faint)"}
            >
              {shortDateLabel(d.date)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
