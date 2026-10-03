/**
 * Repository 层统一出口（SPEC §7.0 迁移保障 #1）。
 * 页面 / 组件 / API 路由一律通过这里访问数据，不直接碰 SQL 或存储 API。
 */
export * as albumsRepo from "./albums";
export * as booksRepo from "./books";
export * as blocksRepo from "./blocks";
export * as notesRepo from "./notes";
export * as scoreFilesRepo from "./score-files";
export * as sessionsRepo from "./sessions";
export * as songsRepo from "./songs";
export * as tasksRepo from "./tasks";
export * as usersRepo from "./users";
export { getCurrentUser, getCurrentUserId, ensureOwner, OWNER_ID } from "./users";
