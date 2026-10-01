import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import {
  practiceBlocks,
  practiceSessions,
  practiceTasks,
  songs,
} from "@/lib/db/schema";
import * as sessionsRepo from "@/lib/repositories/sessions";
import { addDaysKey, todayKey, weekStartKey } from "@/lib/domain/date";
import type { Feeling } from "@/lib/domain/constants";
import { SONG_STATUSES, type SongStatus } from "@/lib/domain/song-status";

export interface BlockProgressPoint {
  date: string;
  bestBpm: number;
}

export interface BlockProgress {
  blockId: string;
  blockName: string;
  songTitle: string;
  songId: string;
  currentBpm: number;
  targetBpm: number;
  points: BlockProgressPoint[];
  deltaBpm: number;
}

export interface Achievement {
  key: string;
  label: string;
  hint: string;
  unlocked: boolean;
  progress: number; // 0..1
}

export interface DashboardData {
  todayMinutes: number;
  weekMinutes: number;
  lastWeekMinutes: number;
  weekDelta: number;
  streakDays: number;
  longestStreak: number;
  totalMinutes: number;
  totalSessions: number;
  weekTasksDone: number;
  weekTasksTotal: number;
  completionRate: number;
  songsByStatus: Record<SongStatus, number>;
  songTotal: number;
  blocks: BlockProgress[];
  feelings: Record<Feeling, number>;
  achievements: Achievement[];
}

export async function getDashboardData(
  userId: string,
  today: string = todayKey(),
): Promise<DashboardData> {
  const db = getDb();

  const allSessions = await db.select().from(practiceSessions);
  const allSongs = await db.select().from(songs).where(eq(songs.userId, userId));
  const blocks = await db
    .select()
    .from(practiceBlocks)
    .where(eq(practiceBlocks.userId, userId));

  const weekStart = weekStartKey(today);
  const weekEnd = addDaysKey(weekStart, 6);
  const lastWeekStart = addDaysKey(weekStart, -7);

  const sumRange = (from: string, to: string) =>
    allSessions
      .filter((s) => s.date >= from && s.date <= to)
      .reduce((sum, s) => sum + s.durationMin, 0);

  const todayMinutes = sumRange(today, today);
  const weekMinutes = sumRange(weekStart, weekEnd);
  const lastWeekMinutes = sumRange(lastWeekStart, addDaysKey(weekStart, -1));

  // Streak：连续有练习记录的天数（今天没练但昨天有练，仍延续）
  const activeDays = new Set(allSessions.map((s) => s.date));
  let streakDays = 0;
  {
    let cursor = activeDays.has(today) ? today : addDaysKey(today, -1);
    while (activeDays.has(cursor)) {
      streakDays += 1;
      cursor = addDaysKey(cursor, -1);
    }
  }

  // 历史最长连续
  const sortedDays = [...activeDays].sort();
  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of sortedDays) {
    if (prev && addDaysKey(prev, 1) === day) run += 1;
    else run = 1;
    longestStreak = Math.max(longestStreak, run);
    prev = day;
  }

  const songsByStatus = Object.fromEntries(
    SONG_STATUSES.map((s) => [s, 0]),
  ) as Record<SongStatus, number>;
  for (const s of allSongs) songsByStatus[s.status] += 1;

  // 本周任务完成率
  const weekTasks = await db
    .select()
    .from(practiceTasks)
    .where(eq(practiceTasks.userId, userId));
  const inWeek = weekTasks.filter((t) => t.date >= weekStart && t.date <= weekEnd);
  const weekTasksTotal = inWeek.length;
  const weekTasksDone = inWeek.filter((t) => t.status === "done").length;

  // BPM Progress（D-2：Dashboard 最有价值的一张图）
  const blockProgress: BlockProgress[] = [];
  for (const block of blocks) {
    const points = await sessionsRepo.bpmProgressByBlock(block.id);
    if (points.length === 0) continue;
    const song = allSongs.find((s) => s.id === block.songId);
    blockProgress.push({
      blockId: block.id,
      blockName: block.name,
      songTitle: song?.title ?? "Unknown",
      songId: block.songId,
      currentBpm: block.currentBpm,
      targetBpm: block.targetBpm,
      points,
      deltaBpm: points[points.length - 1].bestBpm - points[0].bestBpm,
    });
  }
  blockProgress.sort((a, b) => b.points.length - a.points.length);

  const feelings = { good: 0, normal: 0, hard: 0 } as Record<Feeling, number>;
  for (const s of allSessions) if (s.feeling) feelings[s.feeling] += 1;

  const totalMinutes = allSessions.reduce((sum, s) => sum + s.durationMin, 0);
  const masteredCount = songsByStatus.mastered + songsByStatus.maintenance;
  const bestDelta = blockProgress.reduce(
    (max, b) => Math.max(max, b.deltaBpm),
    0,
  );

  const achievements: Achievement[] = [
    {
      key: "first-10-hours",
      label: "First 10 Hours",
      hint: "累计练习 10 小时",
      unlocked: totalMinutes >= 600,
      progress: Math.min(1, totalMinutes / 600),
    },
    {
      key: "streak-7",
      label: "7 Day Streak",
      hint: "连续练习 7 天",
      unlocked: longestStreak >= 7,
      progress: Math.min(1, longestStreak / 7),
    },
    {
      key: "first-mastered",
      label: "First Song Mastered",
      hint: "第一首曲目达到 Mastered",
      unlocked: masteredCount >= 1,
      progress: masteredCount >= 1 ? 1 : 0,
    },
    {
      key: "sessions-100",
      label: "100 Sessions",
      hint: "累计 100 次练习记录",
      unlocked: allSessions.length >= 100,
      progress: Math.min(1, allSessions.length / 100),
    },
    {
      key: "bpm-20",
      label: "+20 BPM",
      hint: "单个 Block 提升 20 BPM",
      unlocked: bestDelta >= 20,
      progress: Math.min(1, Math.max(0, bestDelta) / 20),
    },
  ];

  return {
    todayMinutes,
    weekMinutes,
    lastWeekMinutes,
    weekDelta: weekMinutes - lastWeekMinutes,
    streakDays,
    longestStreak,
    totalMinutes,
    totalSessions: allSessions.length,
    weekTasksDone,
    weekTasksTotal,
    completionRate:
      weekTasksTotal === 0 ? 0 : Math.round((weekTasksDone / weekTasksTotal) * 100),
    songsByStatus,
    songTotal: allSongs.length,
    blocks: blockProgress,
    feelings,
    achievements,
  };
}
