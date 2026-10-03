import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { practiceBlocks, practiceTasks } from "@/lib/db/schema";
import { clampBpm } from "@/lib/domain/constants";

/** One visible whole-song block per song; adding its daily task is atomic. */
export function scheduleWholeSong(input: { userId: string; songId: string; barCount: number; tempo: number; date: string }) {
  const db = getDb();
  return db.transaction((tx) => {
    const where = and(eq(practiceBlocks.userId, input.userId), eq(practiceBlocks.songId, input.songId), eq(practiceBlocks.isWholeSong, true));
    let block = tx.select().from(practiceBlocks).where(where).get();
    if (!block) {
      const bpm = clampBpm(input.tempo);
      block = tx.insert(practiceBlocks).values({ id: randomUUID(), userId: input.userId,
        songId: input.songId, name: "整曲练习", isWholeSong: true, barStart: 1, barEnd: input.barCount,
        currentBpm: bpm, targetBpm: bpm, defaultBpm: bpm, defaultLoop: false }).returning().get();
    } else {
      tx.update(practiceBlocks).set({ barStart: 1, barEnd: input.barCount, updatedAt: new Date() }).where(eq(practiceBlocks.id, block.id)).run();
    }
    const existing = tx.select().from(practiceTasks).where(and(eq(practiceTasks.userId, input.userId),
      eq(practiceTasks.blockId, block.id), eq(practiceTasks.date, input.date))).get();
    if (!existing) tx.insert(practiceTasks).values({ id: randomUUID(), userId: input.userId, blockId: block.id,
      date: input.date, targetBpm: block.targetBpm, priority: block.priority, source: "manual" }).run();
    return { blockId: block.id, alreadyScheduled: !!existing };
  });
}
