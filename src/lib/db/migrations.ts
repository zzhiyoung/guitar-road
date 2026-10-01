import type { Database } from "better-sqlite3";

import type { AppDatabase } from "./client";

/**
 * 增量迁移记录（SPEC §6 数据库迁移要求）。
 *
 * 约束：
 * 1. **只增不改** —— 绝不 DROP TABLE / 重建 DB，现有 Songs / Blocks / Tasks /
 *    Sessions / Notes / Score Files / Books 必须原样保留。
 * 2. **幂等** —— 每条迁移只在 `_migrations` 里没有记录时执行一次；即便某条语句
 *    手工跑过（例如升级前已手工建表），也用 `IF NOT EXISTS` 兜底。
 * 3. **可回滚** —— 单条迁移在一个事务里执行，失败即整体回滚并向上抛出，
 *    不会留下"半迁移"状态。
 *
 * 阶段 B 迁到 PostgreSQL 时，这里的 SQL 需按 pg 方言重写，但机制（版本号表 +
 * 事务）保持一致。
 */
export interface Migration {
  id: string;
  /** 单条语句数组，便于逐条 prepare 执行（better-sqlite3 下比 exec 更安全） */
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    id: "0001_albums",
    statements: [
      `CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
)`,
      `CREATE INDEX IF NOT EXISTS albums_user_sort_idx ON albums (user_id, sort_order)`,
      // SQLite 不支持 ADD COLUMN IF NOT EXISTS，因此由 applyMigration 先查
      // PRAGMA table_info 判空再执行，这里保持纯 DDL。
      `ALTER TABLE songs ADD COLUMN album_id TEXT REFERENCES albums(id) ON DELETE SET NULL`,
      `CREATE INDEX IF NOT EXISTS songs_album_idx ON songs (album_id)`,
    ],
  },
];

const MIGRATION_TABLE_SQL = `CREATE TABLE IF NOT EXISTS _migrations (
  id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
)`;

/** songs 表是否已经存在某列（用于 SQLite 没有 IF NOT EXISTS 的 ADD COLUMN） */
function hasColumn(sqlite: Database, table: string, column: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return rows.some((r) => r.name === column);
}

function applyMigration(sqlite: Database, migration: Migration): void {
  const run = sqlite.transaction(() => {
    for (const statement of migration.statements) {
      // 幂等兜底：列已存在时跳过（例如 DB 由新版 BOOTSTRAP 建表后再跑迁移）
      const alter = /^ALTER TABLE (\w+) ADD COLUMN (\w+)/i.exec(statement);
      if (alter && hasColumn(sqlite, alter[1], alter[2])) continue;
      sqlite.prepare(statement).run();
    }
    sqlite
      .prepare(`INSERT OR REPLACE INTO _migrations (id, applied_at) VALUES (?, ?)`)
      .run(migration.id, Date.now());
  });
  run();
}

/**
 * 执行所有未应用的迁移。在 `bootstrapSchema()` 之后调用 —— 这样全新数据库也能
 * 先建表再补齐列，老数据库只会拿到 `ALTER TABLE ... ADD COLUMN`。
 */
export function runMigrations(db: AppDatabase): void {
  const sqlite = (db as unknown as { $client: Database }).$client;
  sqlite.exec(MIGRATION_TABLE_SQL);

  const applied = new Set(
    (
      sqlite.prepare(`SELECT id FROM _migrations`).all() as { id: string }[]
    ).map((r) => r.id),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    applyMigration(sqlite, migration);
  }
}
