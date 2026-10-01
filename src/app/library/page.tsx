import Link from "next/link";
import { EmptyState, ProgressBar, SectionTitle, StatusBadge } from "@/components/ui";
import { Icon, PageHeading, SongCover } from "@/components/studio";
import { AlbumManager } from "@/components/library/album-manager";
import { SONG_STATUSES, SONG_STATUS_LABEL, statusProgress, type SongStatus } from "@/lib/domain/song-status";
import { DIFFICULTY_LABELS } from "@/lib/domain/constants";
import { getCurrentUserId, albumsRepo, songsRepo } from "@/lib/repositories";
import * as blocksRepo from "@/lib/repositories/blocks";
import * as scoreFilesRepo from "@/lib/repositories/score-files";
export const dynamic = "force-dynamic";

/** `?album=` 的取值：`unfiled`（未分类）或某个 albumId；缺省表示全部 */
const UNFILED = "unfiled";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ status?: string; type?: string; q?: string; album?: string }> }) {
  const userId = await getCurrentUserId(); const sp = await searchParams;
  const status = SONG_STATUSES.includes(sp.status as SongStatus) ? sp.status as SongStatus : undefined;
  const type = sp.type === "song" || sp.type === "exercise" ? sp.type : undefined;

  const [albumList, albumCounts] = await Promise.all([
    albumsRepo.listAlbums(userId),
    albumsRepo.countSongsByAlbum(userId),
  ]);
  const countFor = (albumId: string | null) =>
    albumCounts.find((c) => c.albumId === albumId)?.count ?? 0;

  // 非法 / 已删除的 albumId 一律回落到「全部」，避免 URL 里残留脏参数
  const albumParam =
    sp.album && (sp.album === UNFILED || albumList.some((a) => a.id === sp.album))
      ? sp.album
      : undefined;
  /** undefined → 不筛选；null → 未分类；string → 指定专辑 */
  const albumFilter: string | null | undefined =
    albumParam === undefined ? undefined : albumParam === UNFILED ? null : albumParam;

  const [songs, allSongs] = await Promise.all([songsRepo.listSongs(userId, { status, type, q: sp.q, albumId: albumFilter }), songsRepo.listSongs(userId)]);
  const albumTitleById = new Map(albumList.map((a) => [a.id, a.title]));
  const counts = Object.fromEntries(SONG_STATUSES.map(s => [s, allSongs.filter(song => song.status === s).length])) as Record<SongStatus, number>;
  const songBlocks = new Map(await Promise.all(songs.map(async song => [song.id, await blocksRepo.listBlocksBySong(song.id)] as const)));
  const playableFiles = await scoreFilesRepo.listPlayableBySongs(songs.map(s => s.id));
  const qs = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(); const merged = { status: sp.status, type: sp.type, q: sp.q, album: albumParam, ...patch };
    for (const [k,v] of Object.entries(merged)) if (v) params.set(k,v);
    return params.size ? `/library?${params.toString()}` : "/library";
  };
  return <div>
    <PageHeading title="每一首，都有你的故事。" hint={`共 ${allSongs.length} 首曲目 · 把一首曲子，练成自己的声音。`} action={<Link href="/import" className="btn btn-accent"><Icon name="upload" width="18" />导入曲谱</Link>} />
    <div className="mb-7 space-y-4">
      <nav aria-label="专辑筛选" className="library-filter"><Link href={qs({ album: undefined })} aria-current={!albumParam ? "page" : undefined} className={`chip ${!albumParam ? "selected" : ""}`}>全部 {allSongs.length}</Link><Link href={qs({ album: UNFILED })} aria-current={albumParam === UNFILED ? "page" : undefined} className={`chip ${albumParam === UNFILED ? "selected" : ""}`}>未分类 <span>{countFor(null)}</span></Link>{albumList.map(a => <Link key={a.id} href={qs({ album: a.id })} aria-current={albumParam === a.id ? "page" : undefined} className={`chip ${albumParam === a.id ? "selected" : ""}`}>{a.title} <span>{countFor(a.id)}</span></Link>)}<AlbumManager albums={albumList.map(a => ({ id: a.id, title: a.title, count: countFor(a.id) }))} /></nav>
      <form action="/library" method="get" className="flex gap-3">
        {status ? <input type="hidden" name="status" value={status} /> : null}{type ? <input type="hidden" name="type" value={type} /> : null}{albumParam ? <input type="hidden" name="album" value={albumParam} /> : null}
        <div className="relative min-w-0 flex-1"><Icon name="search" className="absolute left-4 top-3.5 text-muted" width="20" /><input className="input !bg-surface !pl-12" name="q" defaultValue={sp.q ?? ""} placeholder="搜索曲名、艺术家或标签" aria-label="搜索曲库" /></div>
        <button type="submit" className="btn">搜索</button>
      </form>
      <nav aria-label="曲目状态筛选" className="library-filter"><Link href={qs({ status: undefined })} aria-current={!status ? "page" : undefined} className={`chip ${!status ? "selected" : ""}`}>全部 {allSongs.length}</Link>{SONG_STATUSES.map(s => <Link key={s} href={qs({ status: s })} aria-current={status === s ? "page" : undefined} className={`chip ${status === s ? "selected" : ""}`}>{SONG_STATUS_LABEL[s]} <span>{counts[s]}</span></Link>)}</nav>
      <nav aria-label="曲目类型筛选" className="library-filter">{[[undefined,"全部类型"],["song","曲目"],["exercise","练习曲"]].map(([value,label]) => <Link key={label} href={qs({ type: value })} className={`chip ${type === value ? "selected" : ""}`}>{label}</Link>)}{sp.q ? <Link href={qs({ q: undefined })} className="chip text-accent">清除搜索「{sp.q}」</Link> : null}</nav>
    </div>
    <SectionTitle>{sp.q || status || type || albumParam ? `找到 ${songs.length} 首曲目` : "继续你的练习"}</SectionTitle>
    {songs.length === 0 ? <EmptyState title={allSongs.length === 0 ? "下一首想弹什么？" : "还没找到匹配的曲目"} hint={allSongs.length === 0 ? "导入 Guitar Pro 或 MusicXML，选一段喜欢的小节，开始第一轮练习。" : "换一个关键词，或清除筛选看看全部曲目。"} action={allSongs.length === 0 ? { href:"/import",label:"导入第一份曲谱" } : { href:"/library",label:"查看全部曲目" }} /> :
      <div className="song-grid mt-4">{songs.map((song,i) => { const blocks = songBlocks.get(song.id) ?? []; const next = blocks.find(b => b.status === "active"); const albumTitle = song.albumId ? albumTitleById.get(song.albumId) ?? null : null; return <article key={song.id} className="card song-tile">
        <Link href={`/library/${song.id}`} tabIndex={-1} aria-hidden="true"><SongCover number={String(i+1).padStart(2,"0")} title={song.type === "exercise" ? "ETUDE" : "YOUR REPERTOIRE"} tone={i} /></Link>
        <div className="flex flex-wrap gap-2"><StatusBadge status={song.status} />{song.type === "exercise" ? <span className="chip">练习曲</span> : null}{albumTitle ? <span className="chip">专辑 · {albumTitle}</span> : null}</div>
        <div><h2 className="break-words text-xl font-bold"><Link href={`/library/${song.id}`} className="hover:text-accent">{song.title}</Link></h2><p className="mt-2 text-[12px] text-muted">{song.artist || "个人曲谱"}{song.difficulty ? ` · ${DIFFICULTY_LABELS[song.difficulty] ?? song.difficulty}` : ""}</p></div>
        <div className="space-y-3 border-t border-line pt-4"><p className="text-[13px]">{next ? `下一段 · ${next.name}` : `${blocks.length} 个练习段落`}</p>{next ? <p className="text-[12px] text-muted">{next.currentBpm} → {next.targetBpm} BPM · 第 {next.barStart}–{next.barEnd} 小节</p> : <p className="text-[12px] text-muted">先挑出想练的几个小节</p>}<ProgressBar value={statusProgress(song.status)} max={100} color="var(--color-good)" /><p className="text-[11px] text-muted">曲目状态进度 · {SONG_STATUS_LABEL[song.status]}</p>{song.tags.length > 0 ? <p className="break-words text-[11px] text-muted">{song.tags.join(" · ")}</p> : null}</div>
        <div className="mt-auto grid gap-2"><div className="grid grid-cols-2 gap-2">{playableFiles.has(song.id) ? <Link href={`/play/${song.id}`} className="btn btn-accent">▶ 播放</Link> : null}<Link href={`/library/${song.id}`} className={`btn btn-soft ${playableFiles.has(song.id) ? "" : "col-span-2"}`}>查看曲目<Icon name="arrow" width="17" /></Link></div><Link href={`/library/${song.id}?setup=1`} className="btn btn-ghost">＋ 新建练习段落</Link></div>
      </article>; })}</div>}
    <div className="mt-7 flex items-start gap-3 rounded-3xl bg-good-soft p-6 text-[13px] leading-7 text-good"><Icon name="music" className="mt-1 shrink-0" /><p>一首曲子可以拆成多个练习段落。先把一小段练顺，再连接成整首。</p></div>
  </div>;
}
