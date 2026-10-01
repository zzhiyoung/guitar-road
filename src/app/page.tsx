import Link from "next/link";
import { AutoTasksButton } from "@/components/today/auto-tasks-button";
import { SessionSummaryBanner } from "@/components/today/session-summary-banner";
import { TaskCard, type TaskCardData } from "@/components/today/task-card";
import { GuitarIllustration, Icon, PageHeading } from "@/components/studio";
import { SectionTitle } from "@/components/ui";
import { addDaysKey, formatDateLabel, formatDuration, todayKey, weekStartKey } from "@/lib/domain/date";
import { getCurrentUserId } from "@/lib/repositories";
import * as blocksRepo from "@/lib/repositories/blocks";
import * as sessionsRepo from "@/lib/repositories/sessions";
import { getDashboardData } from "@/lib/services/dashboard";
import { getSessionSummary, getTodayData } from "@/lib/services/today";
export const dynamic = "force-dynamic";
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const [userId, params] = await Promise.all([getCurrentUserId(), searchParams]);
  const today = todayKey();
  const [data, growth, activeBlocks, summary] = await Promise.all([
    getTodayData(userId, today), getDashboardData(userId, today), blocksRepo.listActiveBlocks(userId),
    params.done ? getSessionSummary(userId, params.done) : Promise.resolve(null),
  ]);
  const frequent = activeBlocks.some(({ block }) => (block.frequencyPerWeek ?? 0) > 0);
  const inToday = new Set(data.items.map(i => i.block.id));
  const suggestions: TaskCardData[] = [];
  for (const { block, song } of activeBlocks) {
    if (inToday.has(block.id)) continue;
    const latest = await sessionsRepo.latestSessionByBlock(block.id);
    suggestions.push({
      taskId: "", blockId: block.id, blockName: block.name, songId: song.id, songTitle: song.title, artist: song.artist,
      barStart: block.barStart, barEnd: block.barEnd, currentBpm: block.currentBpm, targetBpm: block.targetBpm,
      targetDurationMin: null, status: "todo", source: "manual", deferredCount: 0,
      recommendedStartBpm: latest?.bestBpm ?? latest?.finalBpm ?? block.currentBpm, lastSession: null, sessionCount: 0,
    });
    if (suggestions.length >= 3) break;
  }
  const taskData = data.items.map(({ task, block, song, recommendedStartBpm, latestSession, sessionCount }): TaskCardData => ({
    taskId: task.id, blockId: block.id, blockName: block.name, songId: song.id, songTitle: song.title, artist: song.artist,
    barStart: block.barStart, barEnd: block.barEnd, currentBpm: block.currentBpm, targetBpm: task.targetBpm ?? block.targetBpm,
    targetDurationMin: task.targetDurationMin, status: task.status, source: task.source, deferredCount: task.deferredCount,
    recommendedStartBpm, sessionCount,
    lastSession: latestSession ? { date: latestSession.date, bestBpm: latestSession.bestBpm, finalBpm: latestSession.finalBpm, durationMin: latestSession.durationMin, feeling: latestSession.feeling } : null,
  }));
  const next = taskData.find(t => t.status === "todo") ?? suggestions[0];
  const weekStart = weekStartKey(today);
  const weekSessions = await sessionsRepo.listSessionsInRange(userId, weekStart, addDaysKey(weekStart, 6));
  const practiced = new Set(weekSessions.map(s => s.date));
  const firstVisit = growth.songTotal === 0;
  return <div>
    <PageHeading title={firstVisit ? "你的音乐旅程，从这里开始。" : "今天，让手指找到节奏。"} hint={`${formatDateLabel(today)}，${WEEKDAYS[new Date().getDay()]} · 每一次拿起吉他，都算数。`} action={<span className="chip border-transparent bg-good-soft text-good">个人音乐工作室</span>} />
    {summary ? <SessionSummaryBanner summary={summary} /> : null}
    <section className="studio-hero" aria-labelledby="next-practice-heading">
      <div className="hero-copy">
        <span className="eyebrow">{firstVisit ? "YOUR MUSIC JOURNEY" : "TODAY’S SESSION"}</span>
        <h2 id="next-practice-heading" className="serif-heading">{firstVisit ? <>让喜欢的音乐，<br />慢慢变成你的声音。</> : next ? "从熟悉的一段，进入状态。" : data.totalCount > 0 && data.doneCount === data.totalCount ? "今天的小目标，已经完成。" : "从一小段，开始今天的音乐。"}</h2>
        {next ? <>
          <p className="!text-[15px]">{next.songTitle} · {next.blockName}</p>
          <p className="mt-2">第 {next.barStart}–{next.barEnd} 小节 · 建议起手 {next.recommendedStartBpm} BPM{next.targetDurationMin ? ` · 目标 ${next.targetDurationMin} 分钟` : ""}</p>
        </> : <p>{firstVisit ? "导入一份喜欢的曲谱，选择一小段，从舒服的速度开始。" : "想再弹一点，或为下一次练习挑一首喜欢的曲子？"}</p>}
        <div className="hero-actions"><Link href={next ? `/practice/${next.blockId}` : firstVisit ? "/import" : "/library"} className="btn btn-accent">{next ? "开始这段练习" : firstVisit ? "导入第一份曲谱" : "去曲库看看"}<Icon name="arrow" width="18" /></Link><span>{next ? "接着自己的节奏来" : "一次专注一小段"}</span></div>
      </div><GuitarIllustration className="hero-guitar" />
    </section>
    {firstVisit ? <div className="mt-7 grid gap-4 sm:grid-cols-3">{[["01", "选一首喜欢的", "从自己的曲谱开始"], ["02", "拆成小段落", "一次专注几个小节"], ["03", "记下这次练习", "看到自己的节奏与变化"]].map(([n,title,hint]) => <div key={n} className="card card-pad"><span className="stat-value text-accent">{n}</span><h2 className="mt-4 text-lg font-bold">{title}</h2><p className="mt-2 text-[13px] text-muted">{hint}</p></div>)}</div> : <div className="today-grid">
      <div className="min-w-0">
        <SectionTitle action={<AutoTasksButton hasFrequentBlocks={frequent} />}>今天的练习</SectionTitle>
        {taskData.length > 0 ? <div className="mt-4 space-y-3">{taskData.map(item => <TaskCard key={item.taskId} data={item} />)}</div> : <div className="card card-pad mt-4"><h3 className="font-semibold">今天还没有安排任务</h3><p className="mt-2 text-[13px] leading-relaxed text-muted">可以从下面的段落直接开练，或在曲库里把一段加入今天。</p><Link href="/library" className="btn btn-soft mt-4">去曲库挑一段</Link></div>}
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-good-soft px-5 py-4 text-[13px] text-good"><Icon name="clock" /><span>今天已练 {formatDuration(data.todayMinutes)}{data.totalCount > 0 ? ` · 已完成 ${data.doneCount}/${data.totalCount} 段` : ""}</span></div>
        {suggestions.length > 0 ? <section className="mt-7"><SectionTitle action={<Link href="/library" className="btn btn-sm btn-ghost">全部曲目 →</Link>}>也可以练这些</SectionTitle><div className="mt-3 space-y-3">{suggestions.map(s => <QuickBlock key={s.blockId} data={s} />)}</div></section> : null}
      </div>
      <aside className="card rhythm-card">
        <h2 className="text-[17px] font-bold">把练习，变成自己的节奏</h2>
        <div className="mt-4 flex items-baseline gap-3"><strong className="font-mono text-[48px] font-bold text-good">{growth.streakDays}</strong><span className="text-[13px] text-muted">天连续练习</span></div>
        <div className="rhythm-week">{["一", "二", "三", "四", "五", "六", "日"].map((label, i) => { const date = addDaysKey(weekStart, i); const didPractice = practiced.has(date); return <div key={date} className={`rhythm-day ${didPractice ? "practiced" : ""} ${date === today ? "today" : ""}`} aria-label={`${date} ${didPractice ? "已有练习记录" : "暂无练习记录"}`}><i>{didPractice ? <Icon name="check" width="15" /> : date === today ? "♪" : "·"}</i><span>{label}</span></div>; })}</div>
        <div className="border-t border-line pt-5"><p className="text-[14px] font-semibold">本周已练 {formatDuration(growth.weekMinutes)}</p><p className="mt-3 text-[12px] leading-7 text-muted">{growth.streakDays > 0 ? "慢一点也没关系，每一次记录都会留在这里。" : "休息之后，随时可以重新开始。今天弹一点，也很好。"}</p><Link href="/dashboard" className="btn btn-sm btn-ghost mt-3 !px-0 text-good">看看成长足迹<Icon name="arrow" width="16" /></Link></div>
      </aside>
    </div>}
    {!firstVisit ? <section className="import-invitation"><Icon name="upload" width="26" /><div className="min-w-0 flex-1"><h2 className="text-[16px] font-bold">下一首想弹什么？</h2><p className="mt-2 text-[12px] leading-relaxed text-muted">把喜欢的曲谱带进来，拆成一段段可练的小目标。</p></div><Link href="/import" className="btn border-transparent">导入曲谱</Link></section> : null}
  </div>;
}
function QuickBlock({ data }: { data: TaskCardData }) {
  return <div className="card task-card"><div className="task-body"><span className="task-icon"><Icon name="music" /></span><div className="task-copy"><h3>{data.blockName}</h3><p>{data.songTitle} · 第 {data.barStart}–{data.barEnd} 小节</p><p>建议起手 {data.recommendedStartBpm} BPM · 目标 {data.targetBpm} BPM</p></div><div className="task-actions"><Link href={`/practice/${data.blockId}`} className="btn btn-soft">开始练习</Link></div></div></div>;
}
