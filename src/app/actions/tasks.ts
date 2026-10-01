"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserId } from "@/lib/repositories";
import * as blocksRepo from "@/lib/repositories/blocks";
import * as tasksRepo from "@/lib/repositories/tasks";
import { addDaysKey, isDateKey, todayKey, weekStartKey } from "@/lib/domain/date";
import {
  errorState,
  okState,
  readNumber,
  readOptionalNumber,
  readString,
  type FormState,
} from "@/lib/domain/form-state";

function refresh() {
  revalidatePath("/", "layout");
}

/** SPEC §5.8 K-1 / K-3：手工创建任务 */
export async function createTaskAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const userId = await getCurrentUserId();
  const blockId = readString(form, "blockId");
  if (!blockId) return errorState("请选择 Practice Block");

  const block = await blocksRepo.getBlock(blockId);
  if (!block) return errorState("Practice Block 不存在");

  const date = readString(form, "date") || todayKey();
  if (!isDateKey(date)) return errorState("日期格式应为 YYYY-MM-DD");

  const existing = await tasksRepo.findTask(userId, blockId, date);
  if (existing) return errorState("该日期已存在同一个 Block 的任务");

  await tasksRepo.createTask({
    userId,
    blockId,
    date,
    targetDurationMin: readOptionalNumber(form, "targetDurationMin"),
    targetBpm: readOptionalNumber(form, "targetBpm") ?? block.targetBpm,
    priority: readNumber(form, "priority", block.priority),
    source: "manual",
  });

  refresh();
  return okState("任务已创建");
}

/** SPEC §5.1 T-3 / K-2：Todo / Done / Skipped */
export async function setTaskStatusAction(
  taskId: string,
  status: "todo" | "done" | "skipped",
): Promise<FormState> {
  await tasksRepo.setTaskStatus(taskId, status);
  refresh();
  return okState();
}

/** SPEC §5.1 T-4/Library 快捷入口：把某个 Block 一键加进今天 */
export async function addBlockToTodayAction(blockId: string): Promise<FormState> {
  const userId = await getCurrentUserId();
  const block = await blocksRepo.getBlock(blockId);
  if (!block) return errorState("Practice Block 不存在");

  const date = todayKey();
  const existing = await tasksRepo.findTask(userId, blockId, date);
  if (existing) return okState("今天已经有这个任务了");

  await tasksRepo.createTask({
    userId,
    blockId,
    date,
    targetBpm: block.targetBpm,
    priority: block.priority,
    source: "manual",
  });

  refresh();
  return okState("已加入今日练习");
}

/** SPEC §5.8 K-5：延后到明天（顺延，不丢失目标；Q4 记录 deferredCount） */
export async function deferTaskAction(taskId: string): Promise<FormState> {
  const task = await tasksRepo.getTask(taskId);
  if (!task) return errorState("任务不存在");
  await tasksRepo.deferTask(taskId, addDaysKey(task.date, 1));
  refresh();
  return okState("已延后到明天");
}

export async function deleteTaskAction(taskId: string): Promise<FormState> {
  await tasksRepo.deleteTask(taskId);
  refresh();
  return okState("已删除");
}

/**
 * SPEC §5.8 K-4 / §5.1 T-5：Frequency（次/周）驱动的自动任务生成。
 * 规则：本周（ISO 周一起）已排任务数 < Frequency 时，为今天补一条任务。
 */
export async function generateAutoTasksAction(
  date?: string,
): Promise<FormState> {
  const userId = await getCurrentUserId();
  const target = date && isDateKey(date) ? date : todayKey();
  const weekStart = weekStartKey(target);
  const weekEnd = addDaysKey(weekStart, 6);

  const candidates = await tasksRepo.listBlocksForAutoTasks(userId);
  const weekTasks = await tasksRepo.listTasksInRange(userId, weekStart, weekEnd);
  const todayTasks = await tasksRepo.listTasksByDate(userId, target);
  const todayBlockIds = new Set(todayTasks.map((t) => t.block.id));

  let created = 0;
  for (const block of candidates) {
    const freq = block.frequencyPerWeek ?? 0;
    if (freq <= 0) continue;
    if (todayBlockIds.has(block.id)) continue;
    const scheduled = weekTasks.filter((t) => t.blockId === block.id).length;
    if (scheduled >= freq) continue;

    await tasksRepo.createTask({
      userId,
      blockId: block.id,
      date: target,
      targetBpm: block.targetBpm,
      priority: block.priority,
      source: "auto",
    });
    created += 1;
  }

  refresh();
  return created > 0
    ? okState(`已按练习频率生成 ${created} 个任务`)
    : okState("本周任务已排满，无需补充");
}
