import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { albums, songs } from "@/lib/db/schema";

export type Album = typeof albums.$inferSelect;

/** SPEC §2.3：title 最大长度 */
export const ALBUM_TITLE_MAX = 100;

export interface AlbumSongCount {
  /** null 表示「未分类」 */
  albumId: string | null;
  count: number;
}

function normalizeTitle(raw: string): string {
  return raw.trim().slice(0, ALBUM_TITLE_MAX);
}

export async function listAlbums(userId: string): Promise<Album[]> {
  const db = getDb();
  return db
    .select()
    .from(albums)
    .where(eq(albums.userId, userId))
    .orderBy(asc(albums.sortOrder), asc(albums.title));
}

export async function getAlbum(
  userId: string,
  albumId: string,
): Promise<Album | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(albums)
    .where(and(eq(albums.id, albumId), eq(albums.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createAlbum(input: {
  userId: string;
  title: string;
  description?: string | null;
}): Promise<Album> {
  const title = normalizeTitle(input.title);
  if (!title) throw new Error("专辑名称不能为空");

  const existing = await listAlbums(input.userId);
  if (existing.some((a) => a.title.toLowerCase() === title.toLowerCase())) {
    throw new Error(`已存在同名专辑「${title}」`);
  }

  const db = getDb();
  const nextSort =
    existing.length === 0 ? 0 : Math.max(...existing.map((a) => a.sortOrder)) + 1;

  const [row] = await db
    .insert(albums)
    .values({
      id: randomUUID(),
      userId: input.userId,
      title,
      description: input.description?.trim() || null,
      sortOrder: nextSort,
    })
    .returning();
  return row;
}

export async function updateAlbum(
  userId: string,
  albumId: string,
  patch: { title?: string; description?: string | null },
): Promise<Album | null> {
  const current = await getAlbum(userId, albumId);
  if (!current) return null;

  const next: { title?: string; description?: string | null } = {};

  if (patch.title !== undefined) {
    const title = normalizeTitle(patch.title);
    if (!title) throw new Error("专辑名称不能为空");
    const siblings = (await listAlbums(userId)).filter((a) => a.id !== albumId);
    if (siblings.some((a) => a.title.toLowerCase() === title.toLowerCase())) {
      throw new Error(`已存在同名专辑「${title}」`);
    }
    next.title = title;
  }

  if (patch.description !== undefined) {
    next.description = patch.description?.trim() || null;
  }

  if (Object.keys(next).length === 0) return current;

  const db = getDb();
  const [row] = await db
    .update(albums)
    .set({ ...next, updatedAt: new Date() })
    .where(and(eq(albums.id, albumId), eq(albums.userId, userId)))
    .returning();
  return row ?? null;
}

/**
 * 删除 Album：Album 本身移除，其中 Song **保留**并回到未分类
 * （FK 为 ON DELETE SET NULL，这里显式置空，行为不依赖数据库外键开关）。
 */
export async function deleteAlbum(
  userId: string,
  albumId: string,
): Promise<boolean> {
  const current = await getAlbum(userId, albumId);
  if (!current) return false;

  const db = getDb();
  await db
    .update(songs)
    .set({ albumId: null })
    .where(and(eq(songs.albumId, albumId), eq(songs.userId, userId)));
  await db.delete(albums).where(and(eq(albums.id, albumId), eq(albums.userId, userId)));
  return true;
}

/** 把 Song 归入某个 Album（albumId 为 null 表示移回未分类） */
export async function assignSongAlbum(
  userId: string,
  songId: string,
  albumId: string | null,
): Promise<void> {
  const db = getDb();

  const [song] = await db
    .select({ id: songs.id })
    .from(songs)
    .where(and(eq(songs.id, songId), eq(songs.userId, userId)))
    .limit(1);
  if (!song) throw new Error("曲目不存在");

  if (albumId !== null) {
    const album = await getAlbum(userId, albumId);
    if (!album) throw new Error("专辑不存在");
  }

  await db
    .update(songs)
    .set({ albumId })
    .where(and(eq(songs.id, songId), eq(songs.userId, userId)));
}

/** 专辑内曲目数量统计；`albumId: null` 一项代表未分类 */
export async function countSongsByAlbum(
  userId: string,
): Promise<AlbumSongCount[]> {
  const db = getDb();
  const rows = await db
    .select({
      albumId: songs.albumId,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(songs)
    .where(eq(songs.userId, userId))
    .groupBy(songs.albumId);

  return rows.map((r) => ({ albumId: r.albumId, count: r.count }));
}

/** 上移 / 下移一位（MVP：不做拖拽排序，只支持相邻交换） */
export async function moveAlbum(
  userId: string,
  albumId: string,
  direction: "up" | "down",
): Promise<boolean> {
  const list = await listAlbums(userId);
  const index = list.findIndex((a) => a.id === albumId);
  if (index < 0) return false;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return false;

  const db = getDb();
  const a = list[index];
  const b = list[target];
  // better-sqlite3 的 db.transaction() 要求是同步回调，这里只是相邻两条记录的
  // sort_order 互换，直接顺序更新即可（漂移不影响正确性，下次移动会重新对齐）。
  await db
    .update(albums)
    .set({ sortOrder: b.sortOrder, updatedAt: new Date() })
    .where(eq(albums.id, a.id));
  await db
    .update(albums)
    .set({ sortOrder: a.sortOrder, updatedAt: new Date() })
    .where(eq(albums.id, b.id));
  return true;
}
