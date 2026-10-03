import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Stateless export: the draft remains in the client; no DB or file writes. */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "下载请求格式有误" }, { status: 400 });
  }
  const musicXml = form.get("musicXml");
  if (typeof musicXml !== "string" || !/<score-(partwise|timewise)\b/.test(musicXml)) {
    return NextResponse.json({ ok: false, error: "缺少 MusicXML 草稿" }, { status: 400 });
  }
  if (Buffer.byteLength(musicXml, "utf8") > 2 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "草稿过大，请裁剪较小片段" }, { status: 413 });
  }
  const requested = form.get("fileName");
  const sanitized = (typeof requested === "string" ? requested : "score-recognized")
    .replace(/\.musicxml$/i, "")
    .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, "-")
    .trim();
  const base = Array.from(sanitized).slice(0, 150).join("");
  const fileName = `${base || "score-recognized"}.musicxml`;
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return new NextResponse(musicXml, {
    headers: {
      "Content-Type": "application/vnd.recordare.musicxml+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="score-recognized.musicxml"; filename*=UTF-8''${encoded}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
