import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * 每次识别任务一个独立临时目录（SPEC §4.10）。
 *
 * 规则：
 * - 目录名与文件名都用 UUID，**不信任原始文件名**
 * - 任务结束（成功或失败）必须 `dispose()`
 */
export interface TempWorkdir {
  dir: string;
  dispose(): Promise<void>;
}

export async function createTempWorkdir(): Promise<TempWorkdir> {
  const dir = path.join(os.tmpdir(), "guitar-road-omr", randomUUID());
  await fs.mkdir(dir, { recursive: true });
  return {
    dir,
    async dispose() {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

/**
 * 把上传内容写到临时目录，返回安全的输入路径。
 *
 * 只保留扩展名（决定 homr/alphaTab 怎么解析），文件名一律 UUID。
 */
export async function writeTempInput(
  dir: string,
  extension: string,
  bytes: Buffer,
): Promise<string> {
  const safeExt = extension.startsWith(".") ? extension : `.${extension}`;
  const inputPath = path.join(dir, `input-${randomUUID()}${safeExt}`);
  await fs.writeFile(inputPath, bytes);
  return inputPath;
}

export function tempOutputPath(dir: string): string {
  return path.join(dir, `result-${randomUUID()}.musicxml`);
}
