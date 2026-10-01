"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserId } from "@/lib/repositories";
import * as notesRepo from "@/lib/repositories/notes";
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

/** SPEC §5.7 N-1 / N-2（N-3 Timestamp Note 预留 barNumber 字段） */
export async function addNoteAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const userId = await getCurrentUserId();
  const parentType = readString(form, "parentType");
  const parentId = readString(form, "parentId");
  const content = readString(form, "content");

  if (parentType !== "song" && parentType !== "block") {
    return errorState("笔记归属类型无效");
  }
  if (!parentId) return errorState("缺少归属对象");
  if (!content) return errorState("请输入笔记内容");

  await notesRepo.createNote({
    userId,
    parentType,
    parentId,
    content,
    barNumber: readOptionalNumber(form, "barNumber"),
  });

  refresh();
  return okState("已添加");
}

export async function deleteNoteAction(noteId: string): Promise<FormState> {
  await notesRepo.deleteNote(noteId);
  refresh();
  return okState("已删除");
}
