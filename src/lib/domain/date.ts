/**
 * 日期工具（Q6 决策）：
 * - 数据库存 UTC 毫秒时间戳（created_at）
 * - "日期"语义字段（tasks.date / sessions.date）存 `YYYY-MM-DD`，由**前端按本地时区**计算后传入，
 *   保证 Streak / 每日分组按用户所在时区判定，不受 UTC 跨日影响。
 */

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  return toDateKey(dt);
}

/** 以 key 所在周的周一为起点（ISO 口径） */
export function weekStartKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  const dow = (dt.getDay() + 6) % 7; // 周一=0
  dt.setDate(dt.getDate() - dow);
  return toDateKey(dt);
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  if (rest === 0) return `${h}h`;
  return `${h}h ${rest}m`;
}

export function formatDateLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${m}月${d}日`;
}

export function shortDateLabel(key: string): string {
  const [, m, d] = key.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** 判定 YYYY-MM-DD 字符串（用于 API 入参校验） */
export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
