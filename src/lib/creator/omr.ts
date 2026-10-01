import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { MAX_OMR_UPLOAD_BYTES, OMR_IMAGE_MIME_TYPES } from "@/lib/domain/constants";
import {
  createTempWorkdir,
  tempOutputPath,
  writeTempInput,
} from "./temp";
import type {
  OmrRecognizeResult,
  OmrStatus,
} from "./types";

/**
 * Node 侧 OMR 层（SPEC §4.9 / §4.10）。
 *
 * 安全要求：
 * - 用 `spawn(command, args)`，**绝不**把用户文件名拼进 shell 命令
 * - 每次任务独立 temp 目录 + UUID 文件名，不信任原始文件名
 * - 限制上传体积与类型、设置超时
 * - 不把任何服务器绝对路径返回给浏览器
 */

/** 项目根目录下 tools/omr 的位置（与 cwd 无关，next dev / start 都一致） */
export function omrToolDir(): string {
  return path.join(process.cwd(), "tools", "omr");
}

export const OMR_TIMEOUT_MS = 120_000;
const OMR_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg"] as const;

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
  spawnError?: string;
}

function run(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs: number },
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      // 不经过 shell：args 原样传给可执行文件
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ code: null, stdout, stderr, spawnError: "timeout" });
    }, options.timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr, spawnError: err.message });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * 候选 Python 可执行文件。
 * 允许用 `GUITAR_ROAD_OMR_PYTHON` 指向 venv / conda 里的解释器。
 */
function pythonCandidates(): string[] {
  const configured = process.env.GUITAR_ROAD_OMR_PYTHON?.trim();
  return configured
    ? [configured]
    : process.platform === "win32"
      ? ["python", "py", "python3"]
      : ["python3", "python"];
}

/** 取 stdout 最后一行非空文本，按 CLI 契约解析 JSON */
function parseLastJsonLine(stdout: string): unknown | null {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      /* 继续往上找 */
    }
  }
  return null;
}

const UNAVAILABLE_MESSAGE =
  "OMR 识别引擎尚未安装。Guitar Road 其他功能不受影响，安装方式见 tools/omr/README.md。";

/**
 * 探测 OMR 环境（SPEC §4.11 / §4.12）。
 * Python 缺失 / wrapper 缺失 / homr 缺失都会返回 `available: false`，绝不抛异常。
 */
export async function getOmrStatus(): Promise<OmrStatus> {
  const cwd = omrToolDir();
  const args = ["-m", "guitar_road_omr", "status"];

  for (const python of pythonCandidates()) {
    const result = await run(python, args, { cwd, timeoutMs: 30_000 });

    // 解释器不存在 → 换下一个候选
    if (result.spawnError && !result.stdout) continue;

    const payload = parseLastJsonLine(result.stdout) as
      | Partial<OmrStatus>
      | null;
    if (payload && typeof payload.available === "boolean") {
      return {
        available: payload.available,
        engine: payload.engine ?? undefined,
        message: payload.message ?? (payload.available ? undefined : UNAVAILABLE_MESSAGE),
      };
    }

    // 跑起来了但没拿到契约 JSON：wrapper 没装或被损坏
    return {
      available: false,
      message: UNAVAILABLE_MESSAGE,
    };
  }

  return { available: false, message: UNAVAILABLE_MESSAGE };
}

function extensionOf(fileName: string, mime: string): string | null {
  const lower = fileName.toLowerCase();
  const hit = OMR_IMAGE_EXTENSIONS.find((ext) => lower.endsWith(ext));
  if (hit) return hit;
  if (mime === OMR_IMAGE_MIME_TYPES[0]) return ".png";
  if (mime === OMR_IMAGE_MIME_TYPES[1]) return ".jpg";
  return null;
}

/** 生成建议的下载文件名：`原名-recognized.musicxml`（SPEC §4.16） */
export function recognizedFileName(originalName: string): string {
  const base = path
    .basename(originalName || "score")
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim();
  return `${base || "score"}-recognized.musicxml`;
}

/**
 * 图片 → MusicXML。
 *
 * 成功后只把 MusicXML **内容**返回给调用方，临时目录立即清理。
 */
export async function recognizeScoreImage(input: {
  bytes: Buffer;
  fileName: string;
  mime: string;
}): Promise<OmrRecognizeResult> {
  if (input.bytes.byteLength === 0) {
    return { ok: false, error: "图片内容为空" };
  }
  if (input.bytes.byteLength > MAX_OMR_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `图片超过 ${Math.round(MAX_OMR_UPLOAD_BYTES / 1024 / 1024)} MB，请先裁剪乐谱区域`,
    };
  }

  const extension = extensionOf(input.fileName, input.mime);
  if (!extension) {
    return { ok: false, error: "只支持 PNG / JPG 图片" };
  }

  const status = await getOmrStatus();
  if (!status.available) {
    return { ok: false, error: status.message ?? UNAVAILABLE_MESSAGE };
  }

  const work = await createTempWorkdir();
  try {
    const inputPath = await writeTempInput(work.dir, extension, input.bytes);
    const outputPath = tempOutputPath(work.dir);

    let lastResult: SpawnResult | null = null;
    for (const python of pythonCandidates()) {
      const result = await run(
        python,
        [
          "-m",
          "guitar_road_omr",
          "recognize",
          inputPath,
          "--output",
          outputPath,
          "--timeout",
          String(Math.floor(OMR_TIMEOUT_MS / 1000)),
        ],
        { cwd: omrToolDir(), timeoutMs: OMR_TIMEOUT_MS + 5_000 },
      );
      lastResult = result;
      if (result.spawnError && !result.stdout) continue;
      break;
    }

    const result = lastResult;
    if (!result) {
      return { ok: false, error: "无法启动 Python" };
    }
    if (result.spawnError === "timeout") {
      return {
        ok: false,
        error: "识别超时，请裁剪更小的乐谱区域后重试",
      };
    }

    const payload = parseLastJsonLine(result.stdout) as
      | { ok?: boolean; error?: string; engine?: string; warnings?: string[] }
      | null;

    if (!payload || payload.ok !== true || result.code !== 0) {
      return {
        ok: false,
        error: payload?.error ?? "识别失败，请换一张更清晰的乐谱截图",
      };
    }

    // 契约说成功还不够：必须真的拿到非空、像样的 MusicXML
    let musicXml: string;
    try {
      musicXml = await fs.readFile(outputPath, "utf8");
    } catch {
      return { ok: false, error: "识别引擎没有生成 MusicXML 文件" };
    }
    if (!musicXml.trim()) {
      return { ok: false, error: "生成的 MusicXML 为空" };
    }
    if (!/<score-(partwise|timewise)/i.test(musicXml)) {
      return { ok: false, error: "识别结果不是合法的 MusicXML" };
    }

    return {
      ok: true,
      musicXml,
      engine: payload.engine ?? "unknown",
      warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
      downloadName: recognizedFileName(input.fileName),
    };
  } finally {
    await work.dispose();
  }
}
