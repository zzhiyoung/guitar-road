import { defineConfig } from "drizzle-kit";

/**
 * 仅用于后续手工执行 `npx drizzle-kit generate` 生成迁移 SQL 时参考。
 *
 * 运行时**不依赖**本文件与 drizzle-kit：`src/lib/db/client.ts` 用幂等 DDL 建表，
 * 保证 `npm run dev` 开箱即用、无需额外的迁移步骤。
 * （因此 tsconfig 中把本文件排除在类型检查之外。）
 *
 * 阶段 B 迁移 PostgreSQL 时，把 dialect 改为 "postgresql" 并替换 Schema 中的
 * sqliteTable → pgTable 即可，表结构保持一致（SPEC §7.0）。
 */
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/guitar-practice.db",
  },
});
