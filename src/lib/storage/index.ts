import path from "node:path";
import fs from "node:fs/promises";

/**
 * SPEC §7.0 —— 统一文件存储接口。
 *
 * 阶段 A 实现：本地目录 `data/files/`
 * 阶段 B 实现：Supabase Storage（新增一个实现类即可，业务代码不动）
 *
 * 约定：数据库只存**相对路径**（如 `"<songId>/<uuid>.gp5"`），不存绝对路径。
 */
export interface FileStorage {
  save(relativePath: string, data: Buffer): Promise<void>;
  read(relativePath: string): Promise<Buffer>;
  exists(relativePath: string): Promise<boolean>;
  remove(relativePath: string): Promise<void>;
  /** 供实现层解析出可访问 URL（阶段 A 走 /api/files/[...path]） */
  publicUrl(relativePath: string): string;
}

export class LocalFileStorage implements FileStorage {
  constructor(private readonly rootDir: string) {}

  private resolve(relativePath: string): string {
    const normalized = path
      .normalize(relativePath)
      .replace(/^([/\\])+/, "")
      .replace(/\.\.([/\\]|$)/g, "");
    return path.join(this.rootDir, normalized);
  }

  async save(relativePath: string, data: Buffer): Promise<void> {
    const target = this.resolve(relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
  }

  async read(relativePath: string): Promise<Buffer> {
    return fs.readFile(this.resolve(relativePath));
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async remove(relativePath: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(relativePath));
    } catch {
      /* 不存在视为已删除 */
    }
  }

  publicUrl(relativePath: string): string {
    return `/api/files/${relativePath
      .split(/[/\\]/)
      .map(encodeURIComponent)
      .join("/")}`;
  }
}

let storage: FileStorage | null = null;

export function getStorage(): FileStorage {
  if (!storage) {
    const root = process.env.GUITAR_FILES_DIR ?? path.join(process.cwd(), "data", "files");
    storage = new LocalFileStorage(root);
  }
  return storage;
}
