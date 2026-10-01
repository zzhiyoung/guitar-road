import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { practiceSessions } from "@/lib/db/schema";
import { syncCurrentBpmFromSession } from "@/lib/repositories/blocks";

export type PracticeSession = typeof practiceSessions.$inferSelect;

export async function listSessionsByBlock(
  blockId: string,
  limit = 200,
): Promise<PracticeSession[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(practiceSessions)
    .where(eq(practiceSessions.blockId, blockId))
    .orderBy(desc(practiceSessions.date), desc(practiceSessions.createdAt));
  return rows.slice(0, limit);
}

export async function listSessionsInRange(
  userId: string,
  from: string,
  to: string,
): Promise<PracticeSession[]> {
  const db = getDb();
  return db
    .select()
    .from(practiceSessions)
    .where(
      and(
        eq(practiceSessions.userId, userId),
        gte(practiceSessions.date, from),
        lte(practiceSessions.date, to),
      ),
    )
    .orderBy(asc(practiceSessions.date));
}

export async function latestSessionByBlock(
  blockId: string,
): Promise<PracticeSession | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(practiceSessions)
    .where(eq(practiceSessions.blockId, blockId))
    .orderBy(desc(practiceSessions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function latestSessionsForBlocks(
  blockIds: string[],
): Promise<Map<string, PracticeSession>> {
  if (blockIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select()
    .from(practiceSessions)
    .orderBy(desc(practiceSessions.createdAt));
  const map = new Map<string, PracticeSession>();
  for (const row of rows) {
    if (!blockIds.includes(row.blockId)) continue;
    if (!map.has(row.blockId)) map.set(row.blockId, row);
  }
  return map;
}

export interface SessionInput {
  userId: string;
  blockId: string;
  date: string;
  durationMin: number;
  startBpm?: number | null;
  bestBpm?: number | null;
  finalBpm?: number | null;
  feeling?: "good" | "normal" | "hard" | null;
  note?: string | null;
}

/**
 * S-1~S-3：写入一条练习记录。
 * 写完后由 Repository 内部把 Best BPM 同步到 block.current_bpm（派生缓存，§7.1 原则 3）。
 */
export async function createSession(
  input: SessionInput,
): Promise<PracticeSession> {
  const db = getDb();
  const [row] = await db
    .insert(practiceSessions)
    .values({
      id: randomUUID(),
      userId: input.userId,
      blockId: input.blockId,
      date: input.date,
      durationMin: Math.max(0, Math.round(input.durationMin)),
      startBpm: input.startBpm ?? null,
      bestBpm: input.bestBpm ?? null,
      finalBpm: input.finalBpm ?? null,
      feeling: input.feeling ?? null,
      note: input.note ?? null,
    })
    .returning();

  await syncCurrentBpmFromSession(input.blockId, input.bestBpm);
  return row;
}

export async function deleteSession(id: string): Promise<void> {
  const db = getDb();
  await db.delete(practiceSessions).where(eq(practiceSessions.id, id));
}

export interface SessionAggregate {
  totalMinutes: number;
  sessionCount: number;
  activeDays: number;
}

export async function aggregateSessions(
  userId: string,
  from: string,
  to: string,
): Promise<SessionAggregate> {
  const rows = await listSessionsInRange(userId, from, to);
  return {
    totalMinutes: rows.reduce((sum, r) => sum + r.durationMin, 0),
    sessionCount: rows.length,
    activeDays: new Set(rows.map((r) => r.date)).size,
  };
}

/** Dashboard D-2：单 Block 的 Best BPM 时间序列（按日期升序，同日取最高） */
export async function bpmProgressByBlock(
  blockId: string,
): Promise<{ date: string; bestBpm: number }[]> {
  const rows = await listSessionsByBlock(blockId, 500);
  const byDate = new Map<string, number>();
  for (const row of rows) {
    if (typeof row.bestBpm !== "number") continue;
    const prev = byDate.get(row.date);
    if (prev === undefined || row.bestBpm > prev) byDate.set(row.date, row.bestBpm);
  }
  return [...byDate.entries()]
    .map(([date, bestBpm]) => ({ date, bestBpm }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** B-6：Recommended Start = 上次 Best BPM（无记录则回落到 block.currentBpm） */
export async function recommendedStartBpm(
  blockId: string,
): Promise<number | null> {
  const rows = await listSessionsByBlock(blockId, 20);
  for (const row of rows) {
    if (typeof row.bestBpm === "number") return row.bestBpm;
    if (typeof row.finalBpm === "number") return row.finalBpm;
  }
  return null;
}
