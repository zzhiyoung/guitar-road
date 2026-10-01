/** SPEC §5.4 / §5.5 / §6 中反复出现的业务常量与校验规则 */

export const BPM_MIN = 30;
export const BPM_MAX = 300;
export const DEFAULT_BPM = 60;
export const DEFAULT_TARGET_BPM = 90;

/** 练习页 BPM 调节步长（验收标准 P-4：75 → 76 或按设定步长 80） */
export const BPM_STEP_TINY = 1;
export const BPM_STEP_SMALL = 5;
export const BPM_STEP_BIG = 10;

/** 播放速度百分比（时间拉伸，音调不变） */
export const SPEED_PRESETS = [50, 60, 70, 75, 80, 90, 100] as const;

export const FEELINGS = ["good", "normal", "hard"] as const;
export type Feeling = (typeof FEELINGS)[number];

export const FEELING_META: Record<Feeling, { label: string; emoji: string }> = {
  good: { label: "顺手", emoji: "🙂" },
  normal: { label: "正常", emoji: "😐" },
  hard: { label: "有点难", emoji: "😵" },
};

export const TIME_SIGNATURES = [
  { value: "2/4", numerator: 2, denominator: 4 },
  { value: "3/4", numerator: 3, denominator: 4 },
  { value: "4/4", numerator: 4, denominator: 4 },
  { value: "6/8", numerator: 6, denominator: 8 },
] as const;

export type TimeSignatureValue = (typeof TIME_SIGNATURES)[number]["value"];

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: "入门",
  2: "简单",
  3: "中等",
  4: "偏难",
  5: "困难",
};

/** SPEC §5.6 I-1 / I-4 / I-5：支持的乐谱与资料格式 */
export const GP_EXTENSIONS = [".gp", ".gpx", ".gp5", ".gp4", ".gp3"] as const;
export const MUSICXML_EXTENSIONS = [".musicxml", ".xml"] as const;
export const PDF_EXTENSIONS = [".pdf"] as const;

export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

/** SPEC §2.3：Album 标题最大长度。放在 domain 层，便于客户端表单复用。 */
export const ALBUM_TITLE_MAX = 100;

export type ScoreFileKind = "gp" | "musicxml" | "pdf";

export function detectFileKind(fileName: string): ScoreFileKind | null {
  const lower = fileName.toLowerCase();
  if (GP_EXTENSIONS.some((e) => lower.endsWith(e))) return "gp";
  if (MUSICXML_EXTENSIONS.some((e) => lower.endsWith(e))) return "musicxml";
  if (PDF_EXTENSIONS.some((e) => lower.endsWith(e))) return "pdf";
  return null;
}

export const ACCEPT_ATTRIBUTE = [
  ...GP_EXTENSIONS,
  ...MUSICXML_EXTENSIONS,
  ...PDF_EXTENSIONS,
].join(",");

export function clampBpm(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BPM;
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(value)));
}
