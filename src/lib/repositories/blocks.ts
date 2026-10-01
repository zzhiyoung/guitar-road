import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { practiceBlocks, songs } from "@/lib/db/schema";
import { BPM_MAX, BPM_MIN, clampBpm } from "@/lib/domain/constants";

export type PracticeBlock = typeof practiceBlocks.$inferSelect;
export type SpeedTrainingConfig = NonNullable<PracticeBlock["speedTrainingConfig"]>;

export interface BlockWithSong {
  block: PracticeBlock;
  song: typeof songs.$inferSelect;
}

export async function listBlocksBySong(songId: string): Promise<PracticeBlock[]> {
  const db = getDb();
  return db
    .select()
    .from(practiceBlocks)
    .where(eq(practiceBlocks.songId, songId))
    .orderBy(desc(practiceBlocks.priority), asc(practiceBlocks.barStart));
}

export async function listActiveBlocks(userId: string): Promise<BlockWithSong[]> {
  const db = getDb();
  const rows = await db
    .select({ block: practiceBlocks, song: songs })
    .from(practiceBlocks)
    .innerJoin(songs, eq(practiceBlocks.songId, songs.id))
    .where(and(eq(practiceBlocks.userId, userId), eq(practiceBlocks.status, "active")));
  return rows;
}

export async function getBlock(id: string): Promise<PracticeBlock | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(practiceBlocks)
    .where(eq(practiceBlocks.id, id))
    .limit(1);
  return row ?? null;
}

export async function getBlockWithSong(id: string): Promise<BlockWithSong | null> {
  const db = getDb();
  const [row] = await db
    .select({ block: practiceBlocks, song: songs })
    .from(practiceBlocks)
    .innerJoin(songs, eq(practiceBlocks.songId, songs.id))
    .where(eq(practiceBlocks.id, id))
    .limit(1);
  return row ?? null;
}

export interface BlockInput {
  userId: string;
  songId: string;
  name: string;
  barStart: number;
  barEnd: number;
  currentBpm?: number;
  targetBpm?: number;
  defaultBpm?: number;
  defaultLoop?: boolean;
  note?: string | null;
  priority?: number;
  frequencyPerWeek?: number | null;
  speedTrainingConfig?: SpeedTrainingConfig | null;
}

export async function createBlock(input: BlockInput): Promise<PracticeBlock> {
  const db = getDb();
  const barStart = Math.max(1, Math.round(input.barStart));
  const barEnd = Math.max(barStart, Math.round(input.barEnd));
  const currentBpm = clampBpm(input.currentBpm ?? 60);

  const [row] = await db
    .insert(practiceBlocks)
    .values({
      id: randomUUID(),
      userId: input.userId,
      songId: input.songId,
      name: input.name.trim() || `Bar ${barStart}–${barEnd}`,
      barStart,
      barEnd,
      currentBpm,
      targetBpm: clampBpm(input.targetBpm ?? 90),
      defaultBpm: clampBpm(input.defaultBpm ?? currentBpm),
      defaultLoop: input.defaultLoop ?? true,
      note: input.note ?? null,
      priority: input.priority ?? 0,
      frequencyPerWeek: input.frequencyPerWeek ?? null,
      speedTrainingConfig: input.speedTrainingConfig ?? null,
    })
    .returning();
  return row;
}

export async function updateBlock(
  id: string,
  patch: Partial<
    Pick<
      PracticeBlock,
      | "name"
      | "barStart"
      | "barEnd"
      | "currentBpm"
      | "targetBpm"
      | "defaultBpm"
      | "defaultLoop"
      | "note"
      | "priority"
      | "status"
      | "frequencyPerWeek"
      | "speedTrainingConfig"
    >
  >,
): Promise<PracticeBlock | null> {
  const normalized: Partial<typeof practiceBlocks.$inferInsert> = {
    ...patch,
    updatedAt: new Date(),
  };
  for (const key of ["currentBpm", "targetBpm", "defaultBpm"] as const) {
    const v = patch[key];
    if (typeof v === "number") {
      normalized[key] = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(v)));
    }
  }

  const db = getDb();
  const [row] = await db
    .update(practiceBlocks)
    .set(normalized)
    .where(eq(practiceBlocks.id, id))
    .returning();
  return row ?? null;
}

/**
 * SPEC §7.1 架构原则 3：
 * 所有"进度类"数据以 Session 为事实来源，current_bpm 只是 Session 的派生缓存。
 * 因此这里只在写入 Session 后由 Repository 内部调用。
 */
export async function syncCurrentBpmFromSession(
  blockId: string,
  bestBpm: number | null | undefined,
): Promise<void> {
  if (typeof bestBpm !== "number" || !Number.isFinite(bestBpm)) return;
  const block = await getBlock(blockId);
  if (!block) return;
  if (bestBpm <= block.currentBpm) return;
  await updateBlock(blockId, { currentBpm: clampBpm(bestBpm) });
}

export async function deleteBlock(id: string): Promise<void> {
  const db = getDb();
  await db.delete(practiceBlocks).where(eq(practiceBlocks.id, id));
}
