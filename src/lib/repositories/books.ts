import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { books } from "@/lib/db/schema";

export type Book = typeof books.$inferSelect;

export async function listBooks(userId: string): Promise<Book[]> {
  const db = getDb();
  return db
    .select()
    .from(books)
    .where(eq(books.userId, userId))
    .orderBy(asc(books.title));
}

export async function createBook(input: {
  userId: string;
  title: string;
  source?: string | null;
  pdfFileId?: string | null;
}): Promise<Book> {
  const db = getDb();
  const [row] = await db
    .insert(books)
    .values({
      id: randomUUID(),
      userId: input.userId,
      title: input.title.trim(),
      source: input.source ?? null,
      pdfFileId: input.pdfFileId ?? null,
    })
    .returning();
  return row;
}

export async function deleteBook(id: string): Promise<void> {
  const db = getDb();
  await db.delete(books).where(eq(books.id, id));
}
