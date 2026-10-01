import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import {
  practiceBlocks,
  practiceSessions,
  practiceTasks,
  songs,
} from "@/lib/db/schema";
import * as blocksRepo from "@/lib/repositories/blocks";
import * as sessionsRepo from "@/lib/repositories/sessions";
import * as tasksRepo from "@/lib/repositories/tasks";
import { addDaysKey, todayKey, weekStartKey } from "@/lib/domain/date";

export interface TodayTaskItem {
  task: typeof practiceTasks.$inferSelect;
  block: typeof practiceBlocks.$inferSelect;
  song: typeof songs.$inferSelect;
  latestSession: sessionsRepo.PracticeSession | null;
  sessionCount: number;
  /** B-6：Recommended Start（基于上次 Best，无记录回落到 currentBpm） */
  recommendedStartBpm: number;
  isNewBestPossible: boolean;
}

export interface TodayData {
  date: string;
  items: TodayTaskItem[];
  doneCount: number;
  totalCount: number;
  todayMinutes: number;
}

export async function getTodayData(
  userId: string,
  date: string = todayKey(),
): Promise<TodayData> {
  const rows = await tasksRepo.listTasksByDate(userId, date);
  const blockIds = rows.map((r) => r.block.id);
  const latestMap = await sessionsRepo.latestSessionsForBlocks(blockIds);

  const items: TodayTaskItem[] = [];
  for (const row of rows) {
    const latest = latestMap.get(row.block.id) ?? null;
    const all = await sessionsRepo.listSessionsByBlock(row.block.id, 500);
    const best = all.reduce(
      (max, s) => (s.bestBpm && s.bestBpm > max ? s.bestBpm : max),
      0,
    );
    const recommended =
      latest?.bestBpm ?? latest?.finalBpm ?? row.block.currentBpm;
    items.push({
      task: row.task,
      block: row.block,
      song: row.song,
      latestSession: latest,
      sessionCount: all.length,
      recommendedStartBpm: recommended,
      isNewBestPossible: best > 0,
    });
  }

  const db = getDb();
  const daySessions = await db
    .select()
    .from(practiceSessions)
    .where(eq(practiceSessions.date, date));

  return {
    date,
    items,
    doneCount: items.filter((i) => i.task.status === "done").length,
    totalCount: items.length,
    todayMinutes: daySessions.reduce((sum, s) => sum + s.durationMin, 0),
  };
}

export interface SessionSummary {
  session: sessionsRepo.PracticeSession;
  blockName: string;
  songTitle: string;
  songId: string;
  blockId: string;
  previousBestBpm: number | null;
  isNewBest: boolean;
  dayMinutes: number;
  dayTasksDone: number;
  dayTasksTotal: number;
  weekMinutes: number;
  lastWeekMinutes: number;
}

/** P1-T-6：练完后的当日总结反馈页数据 */
export async function getSessionSummary(
  userId: string,
  sessionId: string,
): Promise<SessionSummary | null> {
  const db = getDb();
  const [session] = await db
    .select()
    .from(practiceSessions)
    .where(eq(practiceSessions.id, sessionId))
    .limit(1);
  if (!session) return null;

  const blockRow = await blocksRepo.getBlockWithSong(session.blockId);
  const history = await sessionsRepo.listSessionsByBlock(session.blockId, 500);
  const previousBest = history
    .filter((s) => s.id !== session.id && s.date <= session.date)
    .reduce((max, s) => (s.bestBpm && s.bestBpm > max ? s.bestBpm : max), 0);

  const weekStart = weekStartKey(session.date);
  const weekEnd = addDaysKey(weekStart, 6);
  const lastWeekStart = addDaysKey(weekStart, -7);

  const daySessions = await sessionsRepo.listSessionsInRange(
    userId,
    session.date,
    session.date,
  );
  const dayTasks = await tasksRepo.listTasksByDate(userId, session.date);
  const week = await sessionsRepo.aggregateSessions(userId, weekStart, weekEnd);
  const lastWeek = await sessionsRepo.aggregateSessions(
    userId,
    lastWeekStart,
    addDaysKey(weekStart, -1),
  );

  return {
    session,
    blockName: blockRow?.block.name ?? "Block",
    songTitle: blockRow?.song.title ?? "Unknown",
    songId: blockRow?.song.id ?? "",
    blockId: session.blockId,
    previousBestBpm: previousBest > 0 ? previousBest : null,
    isNewBest:
      !!session.bestBpm && session.bestBpm > previousBest && previousBest > 0,
    dayMinutes: daySessions.reduce((sum, s) => sum + s.durationMin, 0),
    dayTasksDone: dayTasks.filter((t) => t.task.status === "done").length,
    dayTasksTotal: dayTasks.length,
    weekMinutes: week.totalMinutes,
    lastWeekMinutes: lastWeek.totalMinutes,
  };
}
