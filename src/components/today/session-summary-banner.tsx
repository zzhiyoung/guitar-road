import Link from "next/link";
import { Icon } from "@/components/studio";
import { formatDuration } from "@/lib/domain/date";
import type { SessionSummary } from "@/lib/services/today";
export function SessionSummaryBanner({ summary }: { summary: SessionSummary }) {
  const { session } = summary;
  return <section className={`session-banner ${summary.isNewBest ? "is-best" : ""}`} aria-labelledby="session-feedback-heading" role="status">
    <div className="mb-3 flex flex-wrap items-center gap-2"><span className="chip border-transparent bg-good-soft text-good"><Icon name="check" width="15" />练习记录已保存</span>{summary.isNewBest ? <span className="chip border-warn/30 text-warn"><Icon name="star" width="15" />新的最佳记录</span> : null}</div>
    <h2 id="session-feedback-heading" className="serif-heading">{summary.isNewBest ? "这一小步，值得被记住。" : "这次练习，也留下了记录。"}</h2>
    <p className="mt-3 text-[13px] text-muted">{summary.songTitle} · {summary.blockName}</p>
    <div className="my-5 flex flex-wrap items-end gap-x-8 gap-y-4">
      <div><p className="label">本次练习时长</p><strong className="stat-value">{formatDuration(session.durationMin)}</strong></div>
      {session.bestBpm ? <div><p className="label">本次最高速度</p><div className="flex items-baseline gap-2">{summary.isNewBest && summary.previousBestBpm ? <span className="text-muted line-through">{summary.previousBestBpm}</span> : null}<strong className="stat-value text-accent">{session.bestBpm}</strong><span className="text-[12px] text-muted">BPM</span></div></div> : null}
      <div><p className="label">本周音乐时光</p><strong className="stat-value text-good">{formatDuration(summary.weekMinutes)}</strong></div>
    </div>
    <p className="mb-4 text-[12px] text-muted">{summary.dayTasksTotal > 0 ? `今日任务 ${summary.dayTasksDone}/${summary.dayTasksTotal} 完成 · ` : ""}明天，再从熟悉的节奏开始。</p>
    <div className="flex flex-wrap gap-3"><Link href={`/practice/${summary.blockId}`} className="btn btn-soft">再练一轮</Link><Link href="/dashboard" className="btn btn-ghost">查看成长足迹<Icon name="arrow" width="17" /></Link></div>
  </section>;
}
