import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";

/**
 * SPEC §7.0 迁移保障 #3：文件访问统一走 FileStorage。
 * 阶段 A = 本地目录；阶段 B = Supabase Storage（本路由可保留为重定向或直接下线）。
 */

const CONTENT_TYPES: Record<string, string> = {
  gp: "application/octet-stream",
  gpx: "application/octet-stream",
  gp5: "application/octet-stream",
  gp4: "application/octet-stream",
  gp3: "application/octet-stream",
  pdf: "application/pdf",
  xml: "application/vnd.recordare.musicxml+xml",
  musicxml: "application/vnd.recordare.musicxml+xml",
};

function contentTypeFor(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const relativePath = segments.map(decodeURIComponent).join("/");

  if (!relativePath || relativePath.includes("..")) {
    return NextResponse.json({ error: "非法路径" }, { status: 400 });
  }

  const storage = getStorage();
  if (!(await storage.exists(relativePath))) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  try {
    const data = await storage.read(relativePath);
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": contentTypeFor(relativePath),
        "Content-Length": String(data.byteLength),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "文件读取失败" }, { status: 500 });
  }
}
