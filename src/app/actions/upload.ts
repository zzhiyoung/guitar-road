"use server";

import { randomUUID } from "node:crypto";
import path from "node:path";
import { revalidatePath } from "next/cache";

import { getCurrentUserId } from "@/lib/repositories";
import * as booksRepo from "@/lib/repositories/books";
import * as scoreFilesRepo from "@/lib/repositories/score-files";
import * as songsRepo from "@/lib/repositories/songs";
import { getStorage } from "@/lib/storage";
import { readScoreSummary } from "@/lib/alphatab/server-score";
import {
  MAX_UPLOAD_BYTES,
  detectFileKind,
} from "@/lib/domain/constants";
import {
  errorState,
  okState,
  readBool,
  readOptionalNumber,
  readString,
  type FormState,
} from "@/lib/domain/form-state";

function refresh() {
  revalidatePath("/", "layout");
}

function basename(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/"));
  return base.replace(/[^\w.\-()\u4e00-\u9fa5 ]+/g, "_");
}

/**
 * SPEC §5.6 I-1~I-5 —— 曲谱 / 资料上传。
 *
 * 流程：校验 → 建 Song → 落盘到 FileStorage → 建 score_files 记录 → 跳到曲目详情。
 * 若目标曲目已存在（I-6 重新上传修改后的 GP 文件），则新增一个 version，Block 不受影响。
 */
export async function uploadScoreFileAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const userId = await getCurrentUserId();

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return errorState("请选择要上传的文件");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return errorState("文件过大（上限 32 MB）");
  }

  const kind = detectFileKind(file.name);
  if (!kind) {
    return errorState(
      "不支持的文件格式。乐谱支持 .gp / .gpx / .gp5 / .gp4 / .gp3 / .musicxml / .xml，资料支持 .pdf",
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let summary;
  if (kind !== "pdf") {
    try { summary = readScoreSummary(buffer); }
    catch { return errorState("无法解析这份乐谱，请确认文件有效，或通过 Creator 校对后导出 MusicXML。"); }
  }

  // 1. 确定归属曲目
  const existingSongId = readString(form, "songId");
  const providedTitle = readString(form, "title");
  const fallbackTitle =
    providedTitle || summary?.title || file.name.replace(/\.[^.]+$/, "") || "Untitled";

  let songId = existingSongId;
  if (songId) {
    const exists = await songsRepo.getSong(userId, songId);
    if (!exists) return errorState("目标曲目不存在");
  } else {
    const song = await songsRepo.createSong({
      userId,
      title: fallbackTitle,
      artist: readString(form, "artist") || summary?.artist || null,
      type: readString(form, "type") === "exercise" ? "exercise" : "song",
      difficulty: readOptionalNumber(form, "difficulty"),
      pdfPage: readOptionalNumber(form, "pdfPage"),
    });
    songId = song.id;
  }

  // 2. PDF 资料可挂到教材（Book）下
  if (kind === "pdf" && readBool(form, "createBook")) {
    const bookTitle = readString(form, "bookTitle") || fallbackTitle;
    await booksRepo.createBook({
      userId,
      title: bookTitle,
      source: readString(form, "bookSource") || null,
    });
  }

  // 3. 落盘（数据库只存相对路径 —— SPEC §7.0 迁移保障 #3）
  const ext = path.extname(basename(file.name)) || `.${kind}`;
  const relativePath = `${songId}/${randomUUID()}${ext}`;
  await getStorage().save(relativePath, buffer);

  const record = await scoreFilesRepo.createScoreFile({
    userId,
    songId,
    fileType: kind,
    fileName: basename(file.name),
    storagePath: relativePath,
    trackIndex: 0,
  });

  refresh();

  const isPlayable = kind !== "pdf";
  return {
    status: "ok",
    message: `已上传（v${record.version}）`,
    redirectTo: isPlayable
      ? `/library/${songId}?setup=1`
      : `/library/${songId}`,
  };
}

/** SPEC §5.6 I-3：选定 GP Track 后回写 */
export async function selectTrackAction(
  scoreFileId: string,
  trackIndex: number,
): Promise<FormState> {
  await scoreFilesRepo.setTrackIndex(
    scoreFileId,
    Math.max(0, Math.round(trackIndex)),
  );
  refresh();
  return okState("已切换轨道");
}
