import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export type User = typeof users.$inferSelect;

/**
 * SPEC §7.0 —— 阶段 A 单用户本地模式，无登录页。
 * users 表仍保留 owner 记录，业务表照常带 user_id，避免阶段 B(RLS) 迁移改表。
 */
export const OWNER_ID = "00000000-0000-4000-8000-000000000001";

export async function ensureOwner(): Promise<User> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.id, OWNER_ID))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({
      id: OWNER_ID,
      email: process.env.GUITAR_OWNER_EMAIL ?? null,
      displayName: process.env.GUITAR_OWNER_NAME ?? "Guitarist",
      role: "owner",
    })
    .returning();
  return created;
}

/**
 * 阶段 B 迁移点：此处改为从 Supabase Auth session 取 user id 即可，
 * 上层所有 Repository 调用无需改动。
 */
export async function getCurrentUserId(): Promise<string> {
  await ensureOwner();
  return OWNER_ID;
}

export async function getCurrentUser(): Promise<User> {
  await ensureOwner();
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, OWNER_ID)).limit(1);
  return row;
}
