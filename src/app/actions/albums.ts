"use server";

import { revalidatePath } from "next/cache";

import * as albumsRepo from "@/lib/repositories/albums";
import { getCurrentUserId } from "@/lib/repositories";
import {
  errorState,
  okState,
  readString,
  type FormState,
} from "@/lib/domain/form-state";

function refresh() {
  revalidatePath("/", "layout");
}

/** 新建专辑。名称 trim 后不能为空，同一用户下不允许完全同名。 */
export async function createAlbumAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const userId = await getCurrentUserId();
  const title = readString(form, "title");
  if (!title) return errorState("请填写专辑名称");

  try {
    const album = await albumsRepo.createAlbum({
      userId,
      title,
      description: readString(form, "description") || null,
    });
    refresh();
    return okState(`已创建专辑「${album.title}」`);
  } catch (err) {
    return errorState(err instanceof Error ? err.message : "创建专辑失败");
  }
}

/** 重命名专辑（也可顺带改描述） */
export async function renameAlbumAction(
  albumId: string,
  title: string,
): Promise<FormState> {
  const userId = await getCurrentUserId();
  if (!title.trim()) return errorState("专辑名称不能为空");

  try {
    const updated = await albumsRepo.updateAlbum(userId, albumId, { title });
    if (!updated) return errorState("专辑不存在");
    refresh();
    return okState("已重命名");
  } catch (err) {
    return errorState(err instanceof Error ? err.message : "重命名失败");
  }
}

/** 删除专辑：只删专辑，曲目保留并回到未分类 */
export async function deleteAlbumAction(albumId: string): Promise<FormState> {
  const userId = await getCurrentUserId();
  const done = await albumsRepo.deleteAlbum(userId, albumId);
  if (!done) return errorState("专辑不存在");
  refresh();
  return okState("专辑已删除，其中曲目已移回未分类");
}

/** 把曲目归入专辑；albumId 传 null 表示移回未分类 */
export async function assignSongAlbumAction(
  songId: string,
  albumId: string | null,
): Promise<FormState> {
  const userId = await getCurrentUserId();
  try {
    await albumsRepo.assignSongAlbum(userId, songId, albumId);
    refresh();
    return okState(albumId ? "已归入专辑" : "已移回未分类");
  } catch (err) {
    return errorState(err instanceof Error ? err.message : "更新专辑失败");
  }
}

/** 专辑排序：上移 / 下移一位 */
export async function moveAlbumAction(
  albumId: string,
  direction: "up" | "down",
): Promise<FormState> {
  const userId = await getCurrentUserId();
  const done = await albumsRepo.moveAlbum(userId, albumId, direction);
  if (!done) return errorState("无法移动");
  refresh();
  return okState("已调整顺序");
}
