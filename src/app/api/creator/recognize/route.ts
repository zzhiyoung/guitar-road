import { NextResponse } from "next/server";

import { recognizeScoreImage } from "@/lib/creator/omr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** SPEC §4.13 —— Multipart: `file`。成功返回 MusicXML 文本。 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式有误" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "缺少图片文件" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await recognizeScoreImage({
    bytes,
    fileName: file.name || "clipboard.png",
    mime: file.type || "",
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
  }

  return NextResponse.json({
    ok: true,
    musicXml: result.musicXml,
    engine: result.engine,
    warnings: result.warnings,
    downloadName: result.downloadName,
  });
}
