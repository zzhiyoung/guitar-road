/**
 * SPEC §5.2 L-3 —— 曲目状态机
 *
 * Inbox → Learning → Practicing → Playable → Mastered → Maintenance → Archived
 *
 * 规则（对应验收标准 L-3）：
 * - 只允许沿状态机**前进一步或显式回退一步**，不允许任意跳转；
 * - Archived 可恢复到任意状态（"可恢复"）；
 * - 每次变更写 status_changed_at（供 Dashboard 的 Repertoire Progress 使用）。
 */

export const SONG_STATUSES = [
  "inbox",
  "learning",
  "practicing",
  "playable",
  "mastered",
  "maintenance",
  "archived",
] as const;

export type SongStatus = (typeof SONG_STATUSES)[number];

export const SONG_STATUS_LABEL: Record<SongStatus, string> = {
  inbox: "待整理",
  learning: "学习中",
  practicing: "练习中",
  playable: "可以弹完整",
  mastered: "已掌握",
  maintenance: "定期复习",
  archived: "已归档",
};

export const SONG_STATUS_COLOR: Record<SongStatus, string> = {
  inbox: "#756c63",
  learning: "#856125",
  practicing: "#b64c35",
  playable: "#4f6e58",
  mastered: "#3d644c",
  maintenance: "#695c82",
  archived: "#756c63",
};

export function isSongStatus(value: unknown): value is SongStatus {
  return SONG_STATUSES.includes(value as SongStatus);
}

/** 返回某个状态的合法后继集合（不含自身） */
export function allowedTransitions(from: SongStatus): SongStatus[] {
  const idx = SONG_STATUSES.indexOf(from);
  const out = new Set<SongStatus>();

  // 显式回退一步
  if (idx > 0) out.add(SONG_STATUSES[idx - 1]);
  // 前进一步
  if (idx < SONG_STATUSES.length - 1) out.add(SONG_STATUSES[idx + 1]);

  // Archived 可恢复到任意状态
  if (from === "archived") {
    for (const s of SONG_STATUSES) if (s !== "archived") out.add(s);
  }

  out.delete(from);
  return [...out];
}

export function canTransition(from: SongStatus, to: SongStatus): boolean {
  if (from === to) return false;
  return allowedTransitions(from).includes(to);
}

/** 状态在 0-100 进度中的定位，供 Dashboard 的 Repertoire Progress 使用 */
export function statusProgress(status: SongStatus): number {
  const order: SongStatus[] = [
    "inbox",
    "learning",
    "practicing",
    "playable",
    "mastered",
  ];
  const idx = order.indexOf(status);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / order.length) * 100);
}
