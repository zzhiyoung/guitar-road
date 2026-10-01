import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { scoreFiles } from "@/lib/db/schema";

export type ScoreFile = typeof scoreFiles.$inferSelect;
export type ScoreFileKind = ScoreFile["fileType"];

export async function listScoreFiles(songId: string): Promise<ScoreFile[]> {
  const db = getDb();
  return db
    .select()
    .from(scoreFiles)
    .where(eq(scoreFiles.songId, songId))
    .orderBy(asc(scoreFiles.createdAt));
}

export async function getScoreFile(id: string): Promise<ScoreFile | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(scoreFiles)
    .where(eq(scoreFiles.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * 取某 Song 的指定类型文件的最新版本。
 * SPEC §6 设计要点：支持"重新上传修改后的 GP 文件"（P1-I6）时只新增版本，Block 引用 song 而非文件版本。
 */
export async function getLatestScoreFile(
  songId: string,
  fileType: ScoreFileKind,
): Promise<ScoreFile | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(scoreFiles)
    .where(and(eq(scoreFiles.songId, songId), eq(scoreFiles.fileType, fileType)));
  if (rows.length === 0) return null;
  return rows.sort((a, b) => b.version - a.version)[0];
}

export async function createScoreFile(input: {
  userId: string;
  songId: string;
  fileType: ScoreFileKind;
  fileName: string;
  storagePath: string;
  trackIndex?: number;
}): Promise<ScoreFile> {
  const db = getDb();
  const previous = await db
    .select()
    .from(scoreFiles)
    .where(
      and(eq(scoreFiles.songId, input.songId), eq(scoreFiles.fileType, input.fileType)),
    );
  const nextVersion =
    previous.length === 0 ? 1 : Math.max(...previous.map((p) => p.version)) + 1;

  const [row] = await db
    .insert(scoreFiles)
    .values({
      id: randomUUID(),
      userId: input.userId,
      songId: input.songId,
      fileType: input.fileType,
      fileName: input.fileName,
      storagePath: input.storagePath,
      trackIndex: input.trackIndex ?? 0,
      version: nextVersion,
    })
    .returning();
  return row;
}

export async function setTrackIndex(
  id: string,
  trackIndex: number,
): Promise<void> {
  const db = getDb();
  await db.update(scoreFiles).set({ trackIndex }).where(eq(scoreFiles.id, id));
}
