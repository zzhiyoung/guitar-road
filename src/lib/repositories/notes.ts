import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { notes } from "@/lib/db/schema";

export type Note = typeof notes.$inferSelect;
export type NoteParentType = Note["parentType"];

export async function listNotes(
  parentType: NoteParentType,
  parentId: string,
): Promise<Note[]> {
  const db = getDb();
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.parentType, parentType), eq(notes.parentId, parentId)))
    .orderBy(desc(notes.createdAt));
}

export async function createNote(input: {
  userId: string;
  parentType: NoteParentType;
  parentId: string;
  content: string;
  barNumber?: number | null;
}): Promise<Note> {
  const db = getDb();
  const [row] = await db
    .insert(notes)
    .values({
      id: randomUUID(),
      userId: input.userId,
      parentType: input.parentType,
      parentId: input.parentId,
      content: input.content.trim(),
      barNumber: input.barNumber ?? null,
    })
    .returning();
  return row;
}

export async function deleteNote(id: string): Promise<void> {
  const db = getDb();
  await db.delete(notes).where(eq(notes.id, id));
}

export async function listNotesForParents(
  parentType: NoteParentType,
  parentIds: string[],
): Promise<Note[]> {
  if (parentIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select()
    .from(notes)
    .where(eq(notes.parentType, parentType))
    .orderBy(asc(notes.createdAt));
  return rows.filter((r) => parentIds.includes(r.parentId));
}
