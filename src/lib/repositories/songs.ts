import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { songs } from "@/lib/db/schema";
import {
  canTransition,
  isSongStatus,
  type SongStatus,
} from "@/lib/domain/song-status";

export type Song = typeof songs.$inferSelect;
export type NewSong = typeof songs.$inferInsert;

export interface SongFilter {
  status?: SongStatus;
  type?: "song" | "exercise";
  q?: string;
}

export async function listSongs(
  userId: string,
  filter: SongFilter = {},
): Promise<Song[]> {
  const db = getDb();
  const rows = await db.select().from(songs).where(eq(songs.userId, userId));

  return rows
    .filter((s) => (filter.status ? s.status === filter.status : true))
    .filter((s) => (filter.type ? s.type === filter.type : true))
    .filter((s) => {
      if (!filter.q) return true;
      const q = filter.q.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        (s.artist ?? "").toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getSong(userId: string, id: string): Promise<Song | null> {
  const db = getDb();
  const [row] = await db.select().from(songs).where(eq(songs.id, id)).limit(1);
  if (!row || row.userId !== userId) return null;
  return row;
}

export async function createSong(input: {
  userId: string;
  title: string;
  artist?: string | null;
  type?: "song" | "exercise";
  bookId?: string | null;
  pdfPage?: number | null;
  difficulty?: number | null;
  tags?: string[];
  status?: SongStatus;
}): Promise<Song> {
  const db = getDb();
  const [row] = await db
    .insert(songs)
    .values({
      id: randomUUID(),
      userId: input.userId,
      title: input.title.trim() || "Untitled",
      artist: input.artist?.trim() || null,
      type: input.type ?? "song",
      bookId: input.bookId ?? null,
      pdfPage: input.pdfPage ?? null,
      difficulty: input.difficulty ?? null,
      tags: input.tags ?? [],
      status: input.status ?? "inbox",
    })
    .returning();
  return row;
}

export async function updateSong(
  userId: string,
  id: string,
  patch: Partial<
    Pick<
      NewSong,
      | "title"
      | "artist"
      | "type"
      | "bookId"
      | "pdfPage"
      | "difficulty"
      | "tags"
      | "status"
    >
  >,
): Promise<Song | null> {
  const current = await getSong(userId, id);
  if (!current) return null;

  // 状态变更必须走状态机（L-3 验收）
  if (patch.status && patch.status !== current.status) {
    if (!isSongStatus(patch.status) || !canTransition(current.status, patch.status)) {
      throw new Error(
        `不允许的状态流转：${current.status} → ${patch.status}`,
      );
    }
  }

  const db = getDb();
  const [row] = await db
    .update(songs)
    .set({
      ...patch,
      ...(patch.status && patch.status !== current.status
        ? { statusChangedAt: new Date() }
        : {}),
    })
    .where(eq(songs.id, id))
    .returning();
  return row ?? null;
}

export async function deleteSong(userId: string, id: string): Promise<void> {
  const db = getDb();
  const song = await getSong(userId, id);
  if (!song) return;
  await db.delete(songs).where(eq(songs.id, id));
}
