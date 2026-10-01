import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/**
 * SPEC §6 数据模型 — v1 共 8 张表。
 *
 * 设计约束（阶段 A 本地 / 阶段 B 云端通用）：
 * - 所有业务表带 `user_id`，阶段 A 恒为 owner 记录，避免阶段 B(Row Level Security) 迁移改表。
 * - 时间戳统一用 `timestamp_ms` 存 UTC；"日期"语义的字段用 text 'YYYY-MM-DD'（Q6：存 UTC 派生值，
 *   前端按本地时区渲染的职责在 domain 层完成）。
 * - `tags` / `speed_training_config` 在 SQLite 用 text 存 JSON，Postgres 阶段切 jsonb。
 */

const now = sql`(unixepoch() * 1000)`;

/** 用户（阶段 A 仅有 owner 一条记录；阶段 B 由 Supabase Auth 邀请制写入） */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["owner", "friend"] })
    .notNull()
    .default("owner"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(now),
});

/** 教材/书籍（如 Berklee Vol.1），可包含多个 Exercise */
export const books = sqliteTable("books", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  source: text("source"),
  pdfFileId: text("pdf_file_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(now),
});

/**
 * 曲库分类（Album）—— 与 `books` 正交。
 *
 * - `books` 的语义是「教材 → 练习曲」（来源维度）
 * - `albums` 的语义是「曲库分类 → 曲目」（整理维度，例如 Fingerstyle / 最近想练）
 *
 * 两者可以同时挂在同一个 Song 上，互不排斥。只支持 Library → Album → Song 一层。
 */
export const albums = sqliteTable(
  "albums",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(now),
  },
  (t) => [index("albums_user_sort_idx").on(t.userId, t.sortOrder)],
);

/** 曲目 / 练习曲（Song 或 Exercise） */
export const songs = sqliteTable(
  "songs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    artist: text("artist"),
    type: text("type", { enum: ["song", "exercise"] })
      .notNull()
      .default("song"),
    bookId: text("book_id").references(() => books.id, {
      onDelete: "set null",
    }),
    /** 曲库分类；删除 Album 时置 NULL（曲目保留，回到「未分类」） */
    albumId: text("album_id").references(() => albums.id, {
      onDelete: "set null",
    }),
    /** Exercise 关联教材页码 */
    pdfPage: integer("pdf_page"),
    /** 1-5 */
    difficulty: integer("difficulty"),
    /** JSON string[]，Postgres 阶段切 text[] */
    tags: text("tags", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    status: text("status", {
      enum: [
        "inbox",
        "learning",
        "practicing",
        "playable",
        "mastered",
        "maintenance",
        "archived",
      ],
    })
      .notNull()
      .default("inbox"),
    statusChangedAt: integer("status_changed_at", { mode: "timestamp_ms" })
      .notNull()
      .default(now),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(now),
  },
  (t) => [
    index("songs_user_status_idx").on(t.userId, t.status),
    index("songs_album_idx").on(t.albumId),
  ],
);

/** 乐谱文件（GP / MusicXML / PDF），同一 Song 可有多版本 */
export const scoreFiles = sqliteTable(
  "score_files",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    fileType: text("file_type", { enum: ["gp", "musicxml", "pdf"] }).notNull(),
    fileName: text("file_name").notNull(),
    /** 相对路径（如 `songId/uuid.gp5`），永不存绝对路径 —— 迁移 Storage 时只换前缀 */
    storagePath: text("storage_path").notNull(),
    /** 选定的 GP Track index */
    trackIndex: integer("track_index").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(now),
  },
  (t) => [index("score_files_song_idx").on(t.songId, t.fileType)],
);

/** 练习块 —— 本产品的核心数据对象 */
export const practiceBlocks = sqliteTable(
  "practice_blocks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    barStart: integer("bar_start").notNull().default(1),
    barEnd: integer("bar_end").notNull().default(1),
    /** Session 的派生缓存，事实来源永远是 practice_sessions */
    currentBpm: integer("current_bpm").notNull().default(60),
    targetBpm: integer("target_bpm").notNull().default(90),
    defaultBpm: integer("default_bpm").notNull().default(60),
    defaultLoop: integer("default_loop", { mode: "boolean" })
      .notNull()
      .default(true),
    note: text("note"),
    priority: integer("priority").notNull().default(0),
    status: text("status", { enum: ["active", "paused", "mastered"] })
      .notNull()
      .default("active"),
    /** P1：每周练习次数，驱动 practice_tasks 自动生成 */
    frequencyPerWeek: integer("frequency_per_week"),
    /** P1：{ start, target, step, repeats } */
    speedTrainingConfig: text("speed_training_config", { mode: "json" }).$type<{
      start: number;
      target: number;
      step: number;
      repeats: number;
    } | null>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(now),
  },
  (t) => [index("blocks_song_idx").on(t.songId), index("blocks_status_idx").on(t.userId, t.status)],
);

/** 每日任务 */
export const practiceTasks = sqliteTable(
  "practice_tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockId: text("block_id")
      .notNull()
      .references(() => practiceBlocks.id, { onDelete: "cascade" }),
    /** 'YYYY-MM-DD' */
    date: text("date").notNull(),
    targetDurationMin: integer("target_duration_min"),
    targetBpm: integer("target_bpm"),
    priority: integer("priority").notNull().default(0),
    status: text("status", { enum: ["todo", "done", "skipped"] })
      .notNull()
      .default("todo"),
    source: text("source", { enum: ["manual", "auto"] })
      .notNull()
      .default("manual"),
    /** Q4：顺延次数，≥2 时前端标红提示 */
    deferredCount: integer("deferred_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(now),
  },
  (t) => [
    index("tasks_date_idx").on(t.userId, t.date),
    index("tasks_block_idx").on(t.blockId),
  ],
);

/** 练习记录 —— 一切"进步类"数据的事实来源 */
export const practiceSessions = sqliteTable(
  "practice_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockId: text("block_id")
      .notNull()
      .references(() => practiceBlocks.id, { onDelete: "cascade" }),
    /** 'YYYY-MM-DD'，按用户本地时区落库（Q6 决策：前端计算后传入） */
    date: text("date").notNull(),
    durationMin: integer("duration_min").notNull().default(0),
    startBpm: integer("start_bpm"),
    bestBpm: integer("best_bpm"),
    finalBpm: integer("final_bpm"),
    feeling: text("feeling", { enum: ["good", "normal", "hard"] }),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(now),
  },
  (t) => [
    index("sessions_block_date_idx").on(t.blockId, t.date),
    index("sessions_user_date_idx").on(t.userId, t.date),
  ],
);

/** 笔记：挂在 Song 或 Practice Block 上 */
export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentType: text("parent_type", { enum: ["song", "block"] }).notNull(),
    parentId: text("parent_id").notNull(),
    content: text("content").notNull(),
    /** P2 Timestamp Note：关联具体小节 */
    barNumber: integer("bar_number"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(now),
  },
  (t) => [index("notes_parent_idx").on(t.parentType, t.parentId)],
);

// ---------------------------------------------------------------------------
// Relations（供 drizzle relational query 使用）
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  songs: many(songs),
  blocks: many(practiceBlocks),
  sessions: many(practiceSessions),
}));

export const booksRelations = relations(books, ({ one, many }) => ({
  user: one(users, { fields: [books.userId], references: [users.id] }),
  songs: many(songs),
}));

export const albumsRelations = relations(albums, ({ one, many }) => ({
  user: one(users, { fields: [albums.userId], references: [users.id] }),
  songs: many(songs),
}));

export const songsRelations = relations(songs, ({ one, many }) => ({
  user: one(users, { fields: [songs.userId], references: [users.id] }),
  book: one(books, { fields: [songs.bookId], references: [books.id] }),
  album: one(albums, { fields: [songs.albumId], references: [albums.id] }),
  scoreFiles: many(scoreFiles),
  blocks: many(practiceBlocks),
  notes: many(notes),
}));

export const scoreFilesRelations = relations(scoreFiles, ({ one }) => ({
  song: one(songs, { fields: [scoreFiles.songId], references: [songs.id] }),
}));

export const practiceBlocksRelations = relations(
  practiceBlocks,
  ({ one, many }) => ({
    song: one(songs, {
      fields: [practiceBlocks.songId],
      references: [songs.id],
    }),
    tasks: many(practiceTasks),
    sessions: many(practiceSessions),
    notes: many(notes),
  }),
);

export const practiceTasksRelations = relations(practiceTasks, ({ one }) => ({
  block: one(practiceBlocks, {
    fields: [practiceTasks.blockId],
    references: [practiceBlocks.id],
  }),
}));

export const practiceSessionsRelations = relations(
  practiceSessions,
  ({ one }) => ({
    block: one(practiceBlocks, {
      fields: [practiceSessions.blockId],
      references: [practiceBlocks.id],
    }),
  }),
);

/** notes.parent_id 为多态外键（song | block），无法用 Drizzle relations 表达，查询时按 parentType 显式 join */
export const notesRelations = relations(notes, ({ one }) => ({
  user: one(users, { fields: [notes.userId], references: [users.id] }),
}));
