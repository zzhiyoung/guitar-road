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
        title="Creator · 乐谱识别测试"
        hint="这是一项实验测试功能，识别结果仅供校对，准确性与复杂乐谱支持尚未充分验证。请用 Guitar Pro 核对后再导入曲库。"
      />
      <CreatorClient initialStatus={status} />
    </div>
  );
}
