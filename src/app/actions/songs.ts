"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserId } from "@/lib/repositories";
import * as songsRepo from "@/lib/repositories/songs";
import {
  SONG_STATUS_LABEL,
  isSongStatus,
  type SongStatus,
} from "@/lib/domain/song-status";
import {
  errorState,
  okState,
  readOptionalNumber,
  readString,
  type FormState,
} from "@/lib/domain/form-state";

function refresh() {
  revalidatePath("/", "layout");
}

export async function createSongAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const userId = await getCurrentUserId();
  const title = readString(form, "title");
  if (!title) return errorState("请填写曲目名称");

  const tags = readString(form, "tags")
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const song = await songsRepo.createSong({
    userId,
    title,
    artist: readString(form, "artist") || null,
    type: readString(form, "type") === "exercise" ? "exercise" : "song",
    difficulty: readOptionalNumber(form, "difficulty"),
    tags,
  });

  refresh();
  return { status: "ok", message: "已创建", redirectTo: `/library/${song.id}` };
}

export async function updateSongAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const userId = await getCurrentUserId();
  const id = readString(form, "songId");
  if (!id) return errorState("缺少曲目 ID");

  const tags = readString(form, "tags")
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  await songsRepo.updateSong(userId, id, {
    title: readString(form, "title") || undefined,
    artist: readString(form, "artist") || null,
    type: readString(form, "type") === "exercise" ? "exercise" : "song",
    difficulty: readOptionalNumber(form, "difficulty"),
    tags,
  });

  refresh();
  return okState("已保存");
}

/** SPEC §5.2 L-3：状态只能沿状态机流转，非法跳转在此拦下 */
export async function changeSongStatusAction(
  songId: string,
  to: SongStatus,
): Promise<FormState> {
  const userId = await getCurrentUserId();
  if (!isSongStatus(to)) return errorState("未知的目标状态");

  try {
    const updated = await songsRepo.updateSong(userId, songId, { status: to });
    if (!updated) return errorState("曲目不存在");
    refresh();
    return okState(`已切换到 ${SONG_STATUS_LABEL[to]}`);
  } catch (err) {
    return errorState(err instanceof Error ? err.message : "状态切换失败");
  }
}

export async function deleteSongAction(songId: string): Promise<FormState> {
  const userId = await getCurrentUserId();
  await songsRepo.deleteSong(userId, songId);
  refresh();
  return okState("已删除");
}
