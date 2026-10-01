/**
 * SPEC §7.0 —— 本地优先（阶段 A）部署策略
 *
 * 数据库：SQLite 本地文件 `data/guitar-practice.db`，经 Drizzle ORM 访问。
 * 迁移到阶段 B(PostgreSQL) 时：只需把 `drizzle-orm/better-sqlite3` 换成
 * `drizzle-orm/node-postgres` 并替换本文件，schema 与 Repository 层代码不变。
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

/** 项目根目录下的 data/（与 cwd 无关，避免 next dev / next start 差异） */
export function dataDir(): string {
  return path.join(process.cwd(), "data");
}

export function dbFilePath(): string {
  return (
    process.env.GUITAR_DB_PATH ?? path.join(dataDir(), "guitar-practice.db")
  );
}

// Next.js dev 模式热重载会重复执行模块，用 globalThis 缓存连接与初始化标记
const globalForDb = globalThis as unknown as {
  __guitarDb?: AppDatabase;
  __guitarDbReady?: boolean;
};

function createConnection(): AppDatabase {
  const file = dbFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  return drizzle(sqlite, { schema });
}

/** 幂等建表 DDL —— 由 SPEC §6 的 8 张表结构派生 */
const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source TEXT,
  pdf_file_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist TEXT,
  type TEXT NOT NULL DEFAULT 'song',
  book_id TEXT REFERENCES books(id) ON DELETE SET NULL,
  pdf_page INTEGER,
  difficulty INTEGER,
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'inbox',
  status_changed_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS songs_user_status_idx ON songs (user_id, status);

CREATE TABLE IF NOT EXISTS score_files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  track_index INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS score_files_song_idx ON score_files (song_id, file_type);

CREATE TABLE IF NOT EXISTS practice_blocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bar_start INTEGER NOT NULL DEFAULT 1,
  bar_end INTEGER NOT NULL DEFAULT 1,
  current_bpm INTEGER NOT NULL DEFAULT 60,
  target_bpm INTEGER NOT NULL DEFAULT 90,
  default_bpm INTEGER NOT NULL DEFAULT 60,
  default_loop INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  frequency_per_week INTEGER,
  speed_training_config TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS blocks_song_idx ON practice_blocks (song_id);
CREATE INDEX IF NOT EXISTS blocks_status_idx ON practice_blocks (user_id, status);

CREATE TABLE IF NOT EXISTS practice_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL REFERENCES practice_blocks(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  target_duration_min INTEGER,
  target_bpm INTEGER,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'todo',
  source TEXT NOT NULL DEFAULT 'manual',
  deferred_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS tasks_date_idx ON practice_tasks (user_id, date);
CREATE INDEX IF NOT EXISTS tasks_block_idx ON practice_tasks (block_id);

CREATE TABLE IF NOT EXISTS practice_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL REFERENCES practice_blocks(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 0,
  start_bpm INTEGER,
  best_bpm INTEGER,
  final_bpm INTEGER,
  feeling TEXT,
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS sessions_block_date_idx ON practice_sessions (block_id, date);
CREATE INDEX IF NOT EXISTS sessions_user_date_idx ON practice_sessions (user_id, date);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_type TEXT NOT NULL,
  parent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  bar_number INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS notes_parent_idx ON notes (parent_type, parent_id);
`;

let bootstrapDone = false;

export function bootstrapSchema(db: AppDatabase): void {
  if (bootstrapDone) return;
  const sqlite = (db as unknown as { $client: Database.Database }).$client;
  sqlite.exec(BOOTSTRAP_SQL);
  bootstrapDone = true;
}

/**
 * 获取数据库句柄（单例）。首次调用会建表。
 */
export function getDb(): AppDatabase {
  if (!globalForDb.__guitarDb) {
    globalForDb.__guitarDb = createConnection();
  }
  const db = globalForDb.__guitarDb;
  if (!globalForDb.__guitarDbReady) {
    bootstrapSchema(db);
    globalForDb.__guitarDbReady = true;
  }
  return db;
}

export { schema };
