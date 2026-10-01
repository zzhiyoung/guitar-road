import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { practiceBlocks, practiceTasks, songs } from "@/lib/db/schema";

export type PracticeTask = typeof practiceTasks.$inferSelect;

/** Today 页所需的任务视图：任务 + 所属 Block + 曲目（T-1） */
export interface TaskView {
  task: PracticeTask;
  block: typeof practiceBlocks.$inferSelect;
  song: typeof songs.$inferSelect;
}

export async function listTasksByDate(
  userId: string,
  date: string,
): Promise<TaskView[]> {
  const db = getDb();
  const rows = await db
    .select({ task: practiceTasks, block: practiceBlocks, song: songs })
    .from(practiceTasks)
    .innerJoin(practiceBlocks, eq(practiceTasks.blockId, practiceBlocks.id))
    .innerJoin(songs, eq(practiceBlocks.songId, songs.id))
    .where(and(eq(practiceTasks.userId, userId), eq(practiceTasks.date, date)));

  // 排序（T-1 验收：按优先级排序）：未完成优先 → 优先级高 → 创建早
  return rows.sort((a, b) => {
    if (a.task.status !== b.task.status) {
      if (a.task.status === "todo") return -1;
      if (b.task.status === "todo") return 1;
      return a.task.status === "done" ? -1 : 1;
    }
    if (a.task.priority !== b.task.priority) return b.task.priority - a.task.priority;
    return a.task.createdAt.getTime() - b.task.createdAt.getTime();
  });
}

export async function listTasksInRange(
  userId: string,
  from: string,
  to: string,
): Promise<PracticeTask[]> {
  const db = getDb();
  return db
    .select()
    .from(practiceTasks)
    .where(
      and(
        eq(practiceTasks.userId, userId),
        gte(practiceTasks.date, from),
        lte(practiceTasks.date, to),
      ),
    )
    .orderBy(asc(practiceTasks.date));
}

export async function getTask(id: string): Promise<PracticeTask | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(practiceTasks)
    .where(eq(practiceTasks.id, id))
    .limit(1);
  return row ?? null;
}

export async function createTask(input: {
  userId: string;
  blockId: string;
  date: string;
  targetDurationMin?: number | null;
  targetBpm?: number | null;
  priority?: number;
  source?: "manual" | "auto";
}): Promise<PracticeTask> {
  const db = getDb();
  const [row] = await db
    .insert(practiceTasks)
    .values({
      id: randomUUID(),
      userId: input.userId,
      blockId: input.blockId,
      date: input.date,
      targetDurationMin: input.targetDurationMin ?? null,
      targetBpm: input.targetBpm ?? null,
      priority: input.priority ?? 0,
      source: input.source ?? "manual",
    })
    .returning();
  return row;
}

/** 同一 Block 同一天只保留一条任务（自动生成时用于去重） */
export async function findTask(
  userId: string,
  blockId: string,
  date: string,
): Promise<PracticeTask | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(practiceTasks)
    .where(
      and(
        eq(practiceTasks.userId, userId),
        eq(practiceTasks.blockId, blockId),
        eq(practiceTasks.date, date),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function setTaskStatus(
  id: string,
  status: "todo" | "done" | "skipped",
): Promise<PracticeTask | null> {
  const db = getDb();
  const [row] = await db
    .update(practiceTasks)
    .set({ status })
    .where(eq(practiceTasks.id, id))
    .returning();
  return row ?? null;
}

/**
 * K-5 延后到明天：顺延而非丢失目标。
 * 若目标日期已存在同一 Block 的任务，则合并（删除当前条）以免重复。
 */
export async function deferTask(
  id: string,
  nextDate: string,
): Promise<PracticeTask | null> {
  const task = await getTask(id);
  if (!task) return null;

  const existing = await findTask(task.userId, task.blockId, nextDate);
  if (existing && existing.id !== task.id) {
    await deleteTask(task.id);
    return existing;
  }

  const db = getDb();
  const [row] = await db
    .update(practiceTasks)
    .set({ date: nextDate, status: "todo", deferredCount: task.deferredCount + 1 })
    .where(eq(practiceTasks.id, id))
    .returning();
  return row ?? null;
}

export async function deleteTask(id: string): Promise<void> {
  const db = getDb();
  await db.delete(practiceTasks).where(eq(practiceTasks.id, id));
}

/** 某日期区间内完成了任务的去重日期数（Streak / 完成率用） */
export async function countTasks(
  userId: string,
  from: string,
  to: string,
): Promise<{ total: number; done: number }> {
  const rows = await listTasksInRange(userId, from, to);
  return { total: rows.length, done: rows.filter((r) => r.status === "done").length };
}

/** Phase 3 K-4：Frequency 驱动的自动任务生成所需的候选 Block */
export async function listBlocksForAutoTasks(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(practiceBlocks)
    .where(
      and(
        eq(practiceBlocks.userId, userId),
        eq(practiceBlocks.status, "active"),
        isNotNull(practiceBlocks.frequencyPerWeek),
      ),
    );
}
