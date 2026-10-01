import Link from "next/link";
import { UploadForm } from "@/components/import/upload-form";
import { Card, SectionTitle } from "@/components/ui";
import { GuitarIllustration, PageHeading } from "@/components/studio";
import { getCurrentUserId } from "@/lib/repositories";
import * as songsRepo from "@/lib/repositories/songs";
export const dynamic = "force-dynamic";
export default async function ImportPage({searchParams}:{searchParams:Promise<{songId?:string}>}) {
  const userId=await getCurrentUserId(); const [recent,sp]=await Promise.all([songsRepo.listSongs(userId),searchParams]);
  const targetSong=sp.songId ? await songsRepo.getSong(userId,sp.songId) : null;
  return <div>
    <PageHeading title={targetSong ? "给这首曲子，换一份新的谱。" : "把喜欢的音乐，带进来。"} hint={targetSong ? `为《${targetSong.title}》追加或替换曲谱，已有练习段落会保留。` : "从一份曲谱开始，给下一次练习留一个期待。"} />
    <ol className="import-steps" aria-label="导入流程">{["上传曲谱","核对曲目信息","选轨道与段落","开始练习"].map((s,i)=><li key={s}><span>{String(i+1).padStart(2,"0")}</span>{s}</li>)}</ol>
    <div className="import-grid"><Card className="card-pad"><UploadForm songId={targetSong?.id} /></Card><aside className="import-aside"><GuitarIllustration /><div><h2 className="serif-heading">先从你真正想弹的开始。</h2><p>不必一次练完整首。挑出最想练的一段，把它变成今天的小目标。</p><div className="mt-5 border-t border-white/20 pt-2"><p>Guitar Pro / MusicXML 可播放跟练</p><p>PDF 用作配套资料，不提供播放</p></div></div></aside></div>
    {recent.length > 0 ? <section className="mt-7"><SectionTitle action={<Link href="/library" className="btn btn-sm btn-ghost">全部曲目 →</Link>}>最近导入</SectionTitle><Card className="card-pad"><ul className="divide-y divide-line">{recent.slice(0,5).map(s=><li key={s.id} className="flex items-center justify-between gap-3 py-4"><Link href={`/library/${s.id}`} className="min-w-0 break-words text-[14px] font-semibold hover:text-accent">{s.title}{s.artist ? <span className="ml-2 text-[12px] font-normal text-muted">{s.artist}</span> : null}</Link><span className="chip shrink-0">{s.type==="exercise" ? "练习曲" : "曲目"}</span></li>)}</ul></Card></section> : null}
  </div>;
}
