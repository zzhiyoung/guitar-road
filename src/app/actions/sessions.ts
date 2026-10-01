"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserId } from "@/lib/repositories";
import * as blocksRepo from "@/lib/repositories/blocks";
import * as sessionsRepo from "@/lib/repositories/sessions";
import * as tasksRepo from "@/lib/repositories/tasks";
import { FEELINGS, type Feeling } from "@/lib/domain/constants";
import { isDateKey, todayKey } from "@/lib/domain/date";
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

/**
 * SPEC §5.9 S-1~S-3：完成本次练习，写入一条 Practice Session。
 * 同时：
 *  - 把关联的今日任务置为 Done（T-3）
 *  - 由 Repository 内部把 Best BPM 同步回 block.current_bpm（§7.1 原则 3，派生缓存）
 *  - 跳回 Today 并带上 `done=<sessionId>`，由 Today 页渲染当日总结（P1-T-6）
 */
export async function completeSessionAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const userId = await getCurrentUserId();
  const blockId = readString(form, "blockId");
  if (!blockId) return errorState("缺少 Block ID");

  const block = await blocksRepo.getBlock(blockId);
  if (!block) return errorState("Practice Block 不存在");

  const date = readString(form, "date") || todayKey();
  if (!isDateKey(date)) return errorState("日期格式应为 YYYY-MM-DD");

  const durationMin = Math.max(0, Math.round(readNumber(form, "durationMin", 0)));
  const feelingRaw = readString(form, "feeling");
  const feeling: Feeling | null = (FEELINGS as readonly string[]).includes(feelingRaw)
    ? (feelingRaw as Feeling)
    : null;

  const session = await sessionsRepo.createSession({
    userId,
    blockId,
    date,
    durationMin,
    startBpm: readOptionalNumber(form, "startBpm"),
    bestBpm: readOptionalNumber(form, "bestBpm"),
    finalBpm: readOptionalNumber(form, "finalBpm"),
    feeling,
    note: readString(form, "note") || null,
  });

  const taskId = readString(form, "taskId");
  if (taskId) {
    await tasksRepo.setTaskStatus(taskId, "done");
  }

  refresh();
  return { status: "ok", redirectTo: `/?done=${session.id}` };
}

export async function deleteSessionAction(sessionId: string): Promise<FormState> {
  await sessionsRepo.deleteSession(sessionId);
  refresh();
  return okState("已删除");
}
