"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserId } from "@/lib/repositories";
import * as blocksRepo from "@/lib/repositories/blocks";
import * as songsRepo from "@/lib/repositories/songs";
import * as tasksRepo from "@/lib/repositories/tasks";
import { clampBpm } from "@/lib/domain/constants";
import { todayKey } from "@/lib/domain/date";
import {
  errorState,
  okState,
  readBool,
  readNumber,
  readOptionalNumber,
  readString,
  type FormState,
} from "@/lib/domain/form-state";

function refresh() {
  revalidatePath("/", "layout");
}

/**
 * SPEC §5.4 B-1 / B-3：创建 Practice Block。
 * 通过 `intent` 决定后续动作：
 *  - "practice"：直接进入 Practice 页（一次点击开始练琴，G1）
 *  - "today"：创建后加入今日任务
 *  - "save"：仅保存
 */
export async function createBlockAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const userId = await getCurrentUserId();
  const songId = readString(form, "songId");
  if (!songId) return errorState("缺少曲目 ID");

  const song = await songsRepo.getSong(userId, songId);
  if (!song) return errorState("曲目不存在");

  const barStart = Math.max(1, Math.round(readNumber(form, "barStart", 1)));
  const barEnd = Math.max(barStart, Math.round(readNumber(form, "barEnd", barStart)));
  const currentBpm = clampBpm(readNumber(form, "currentBpm", 60));
  const targetBpm = clampBpm(readNumber(form, "targetBpm", 90));

  const block = await blocksRepo.createBlock({
    userId,
    songId,
    name: readString(form, "name") || `Bar ${barStart}–${barEnd}`,
    barStart,
    barEnd,
    currentBpm,
    targetBpm,
    defaultBpm: currentBpm,
    defaultLoop: true,
    note: readString(form, "note") || null,
    priority: Math.round(readNumber(form, "priority", 0)),
    frequencyPerWeek: readOptionalNumber(form, "frequencyPerWeek"),
  });

  const intent = readString(form, "intent");
  if (intent === "today" || readBool(form, "addToToday")) {
    await tasksRepo.createTask({
      userId,
      blockId: block.id,
      date: todayKey(),
      targetBpm: block.targetBpm,
      targetDurationMin: readOptionalNumber(form, "targetDurationMin"),
      priority: block.priority,
      source: "manual",
    });
  }

  refresh();

  if (intent === "practice") {
    return { status: "ok", redirectTo: `/practice/${block.id}` };
  }
  if (intent === "today") {
    return { status: "ok", message: "已加入今日练习", redirectTo: "/" };
  }
  return okState("Practice Block 已创建");
}

export async function updateBlockAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const blockId = readString(form, "blockId");
  if (!blockId) return errorState("缺少 Block ID");

  const barStart =
    readOptionalNumber(form, "barStart") === null
      ? undefined
      : Math.max(1, Math.round(readNumber(form, "barStart", 1)));
  const barEnd =
    readOptionalNumber(form, "barEnd") === null
      ? undefined
      : Math.max(1, Math.round(readNumber(form, "barEnd", 1)));

  const frequencyRaw = readString(form, "frequencyPerWeek");

  await blocksRepo.updateBlock(blockId, {
    name: readString(form, "name") || undefined,
    barStart,
    barEnd,
    currentBpm: readOptionalNumber(form, "currentBpm") ?? undefined,
    targetBpm: readOptionalNumber(form, "targetBpm") ?? undefined,
    defaultBpm: readOptionalNumber(form, "defaultBpm") ?? undefined,
    note: readString(form, "note") || null,
    priority: readOptionalNumber(form, "priority") ?? undefined,
    frequencyPerWeek: frequencyRaw === "" ? null : (readOptionalNumber(form, "frequencyPerWeek") ?? null),
  });

  refresh();
  return okState("已保存");
}

export async function setBlockStatusAction(
  blockId: string,
  status: "active" | "paused" | "mastered",
): Promise<FormState> {
  await blocksRepo.updateBlock(blockId, { status });
  refresh();
  return okState("已更新");
}

export async function deleteBlockAction(blockId: string): Promise<FormState> {
  await blocksRepo.deleteBlock(blockId);
  refresh();
  return okState("已删除");
}

/** Practice 页上的快速 BPM 微调（P-4：播放中调整立即生效，同时回写 Block） */
export async function updateBlockBpmAction(
  blockId: string,
  bpm: number,
): Promise<FormState> {
  await blocksRepo.updateBlock(blockId, { currentBpm: clampBpm(bpm) });
  revalidatePath("/", "layout");
  return okState();
}
