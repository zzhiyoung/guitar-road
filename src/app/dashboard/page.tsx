import Link from "next/link";
import { BpmProgressPanel, WeeklyMinutesChart } from "@/components/dashboard/charts";
import { Card, SectionTitle, StatCard, ProgressBar } from "@/components/ui";
import { Icon, PageHeading } from "@/components/studio";
import { formatDuration, addDaysKey, todayKey, weekStartKey } from "@/lib/domain/date";
import { FEELING_META, type Feeling } from "@/lib/domain/constants";
import { SONG_STATUSES, SONG_STATUS_COLOR, SONG_STATUS_LABEL } from "@/lib/domain/song-status";
import { getCurrentUserId } from "@/lib/repositories";
import * as sessionsRepo from "@/lib/repositories/sessions";
import { getDashboardData } from "@/lib/services/dashboard";
export const dynamic = "force-dynamic";
const ACHIEVEMENT_LABELS: Record<string,string> = { "first-10-hours":"十小时音乐时光", "streak-7":"连续练习七天", "first-mastered":"掌握第一首曲目", "sessions-100":"一百次练习", "bpm-20":"向前二十 BPM" };
export default async function DashboardPage() {
  const userId = await getCurrentUserId(); const today = todayKey(); const data = await getDashboardData(userId,today);
  const weekStart = weekStartKey(today);
  const sessions = await sessionsRepo.listSessionsInRange(userId,weekStart,addDaysKey(weekStart,6));
  const weekDays = Array.from({length:7}, (_,i) => {const date = addDaysKey(weekStart,i);return {date,minutes:sessions.filter(s=>s.date===date).reduce((n,s)=>n+s.durationMin,0),isToday:date===today};});
  const unlocked = data.achievements.filter(a=>a.unlocked).length;
  const highlight = data.totalSessions === 0 ? "第一轮练习，会从这里留下足迹。" : data.weekMinutes === 0 ? "休息之后，随时可以重新开始。" : data.weekDelta > 0 ? "这周，比上周多了一点音乐。" : "每一段音乐，都留下了你的时间。";
  return <div className="space-y-7">
    <PageHeading title="你在一点一点，弹得更好。" hint="看看真实的练习记录，发现自己的变化。" />
    <section className="growth-highlight"><div><h2 className="serif-heading">{highlight}</h2><p>本周 {formatDuration(data.weekMinutes)}{data.weekDelta !== 0 ? ` · 比上周${data.weekDelta > 0 ? "多" : "少"} ${formatDuration(Math.abs(data.weekDelta))}` : " · 与上周持平"} · 连续练习 {data.streakDays} 天</p></div><Icon name="star" width="44" height="44" className="shrink-0 text-good" /></section>
    <div className="grid gap-4 sm:grid-cols-3"><StatCard label="累计练习" value={formatDuration(data.totalMinutes)} sub={`${data.totalSessions} 次练习的积累`} /><StatCard label="本周音乐时光" value={formatDuration(data.weekMinutes)} sub={`今天已练 ${formatDuration(data.todayMinutes)}`} accent="var(--color-good)" /><StatCard label="连续练习" value={`${data.streakDays} 天`} sub={`历史最长 ${data.longestStreak} 天 · 保持自己的节奏`} accent="var(--color-accent)" /></div>
    <div className="growth-charts">
      <section><SectionTitle>同一段落，慢慢进步</SectionTitle><Card className="card-pad">{data.blocks.length === 0 ? <div className="py-8 text-center"><Icon name="chart" width="38" height="38" className="mx-auto text-good" /><p className="my-4 text-[13px] leading-7 text-muted">还没有速度曲线。完成练习并保存记录后，<br />这一段的变化就会出现在这里。</p><Link href="/" className="btn btn-soft">去今日练习</Link></div> : <BpmProgressPanel blocks={data.blocks.map(b=>({blockId:b.blockId,blockName:b.blockName,songTitle:b.songTitle,currentBpm:b.currentBpm,targetBpm:b.targetBpm,deltaBpm:b.deltaBpm,points:b.points}))} />}<p className="mt-4 text-[11px] leading-6 text-muted">最高 BPM 来自你保存的练习记录，用来比较同一段落的练习速度。</p></Card></section>
      <section><SectionTitle>这周的音乐时光</SectionTitle><Card className="card-pad"><WeeklyMinutesChart days={weekDays} /><p className="mt-4 text-[11px] text-muted">实际练习时长（分钟）</p><div className="mt-5 border-t border-line pt-5"><p className="text-[13px] font-semibold">本周任务{data.weekTasksTotal > 0 ? ` ${data.weekTasksDone}/${data.weekTasksTotal} 完成` : "还没有安排"}</p>{data.weekTasksTotal > 0 ? <div className="mt-3"><ProgressBar value={data.weekTasksDone} max={data.weekTasksTotal} color="var(--color-good)" /></div> : null}<p className="mt-3 text-[12px] text-muted">共 {data.songTotal} 首曲目 · {data.songsByStatus.mastered + data.songsByStatus.maintenance} 首已掌握</p></div></Card></section>
    </div>
    <section><SectionTitle action={<span className="text-[12px] text-muted">已达成 {unlocked}/{data.achievements.length}</span>}>一路积累的小里程碑</SectionTitle><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{data.achievements.map(a=><div key={a.key} className={`card p-5 ${a.unlocked ? "!bg-warn-soft !border-warn/25" : ""}`}><div className="mb-4 flex items-center justify-between"><Icon name="star" className={a.unlocked ? "text-warn" : "text-muted"} /><span className="text-[11px] text-muted">{a.unlocked ? "已达成" : "慢慢来"}</span></div><h3 className="text-[13px] font-bold">{ACHIEVEMENT_LABELS[a.key] ?? a.label}</h3><p className="mb-4 mt-2 text-[11px] leading-6 text-muted">{a.hint.replace("Mastered","已掌握").replace("Block","练习段落")}</p><ProgressBar value={a.progress} max={1} color={a.unlocked ? "var(--color-warn)" : "var(--color-line-strong)"} /></div>)}</div></section>
    <div className="grid gap-6 lg:grid-cols-2">
      <section><SectionTitle>曲库中的每一站</SectionTitle><Card className="card-pad space-y-4">{SONG_STATUSES.map(s=><div key={s} className="flex items-center gap-3"><span className="w-24 shrink-0 text-[12px] text-muted">{SONG_STATUS_LABEL[s]}</span><ProgressBar value={data.songsByStatus[s]} max={data.songTotal} color={SONG_STATUS_COLOR[s]} /><span className="w-7 text-right text-[12px]">{data.songsByStatus[s]}</span></div>)}</Card></section>
      <section><SectionTitle>最近弹起来的感觉</SectionTitle><Card className="card-pad space-y-4">{(Object.keys(FEELING_META) as Feeling[]).map(f=><div key={f} className="flex items-center gap-3"><span className="w-24 shrink-0 text-[12px] text-muted">{FEELING_META[f].emoji} {FEELING_META[f].label}</span><ProgressBar value={data.feelings[f]} max={data.feelings.good+data.feelings.normal+data.feelings.hard} color={f==="good" ? "var(--color-good)" : f==="normal" ? "var(--color-accent)" : "var(--color-warn)"} /><span className="w-7 text-right text-[12px]">{data.feelings[f]}</span></div>)}<p className="pt-3 text-[12px] leading-7 text-muted">有点难，也是练习的一部分。记录感觉，给下一次起手速度一个参考。</p></Card></section>
    </div>
  </div>;
}
