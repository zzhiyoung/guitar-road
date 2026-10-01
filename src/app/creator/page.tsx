import { CreatorClient } from "@/components/creator/creator-client";
import { PageHeading } from "@/components/studio";
import { getOmrStatus } from "@/lib/creator/omr";

export const dynamic = "force-dynamic";

/**
 * SPEC §4.4 —— Guitar Road Creator。
 *
 * 页面本身永远可用：OMR 环境缺失时只是显示「识别引擎未安装」，
 * 不会让应用启动失败或影响其余功能（SPEC §1.1）。
 */
export default async function CreatorPage() {
  const status = await getOmrStatus();

  return (
    <div>
      <PageHeading
        title="把乐谱变成可以继续编辑的数字乐谱。"
        hint="截图 → 识别 → MusicXML → alphaTab 预览 → 下载 → Guitar Pro 校正"
      />
      <CreatorClient initialStatus={status} />
    </div>
  );
}
