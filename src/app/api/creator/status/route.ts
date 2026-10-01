import { NextResponse } from "next/server";

import { getOmrStatus } from "@/lib/creator/omr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** SPEC §4.12 —— OMR 引擎可用性。Python / homr 缺失时返回 available: false。 */
export async function GET() {
  try {
    return NextResponse.json(await getOmrStatus());
  } catch (err) {
    return NextResponse.json(
      {
        available: false,
        message:
          err instanceof Error ? err.message : "无法检测识别引擎状态",
      },
      { status: 200 },
    );
  }
}
