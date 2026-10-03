import Link from "next/link";
import { notFound } from "next/navigation";

import { AlbumSelector } from "@/components/library/album-selector";
import {
  BlockEditForm,
  BlockRowActions,
  DeleteSongButton,
  NoteEditor,
  NoteList,
  StatusChanger,
} from "@/components/library/song-detail-client";
import { SongCover } from "@/components/studio";
import { SongSetup } from "@/components/library/song-setup";
import { Card, Chip, SectionTitle, StatusBadge } from "@/components/ui";
import { DIFFICULTY_LABELS, FEELING_META } from "@/lib/domain/constants";
import { formatDuration } from "@/lib/domain/date";
import { statusProgress } from "@/lib/domain/song-status";
import { albumsRepo, getCurrentUserId } from "@/lib/repositories";
import * as blocksRepo from "@/lib/repositories/blocks";
import * as notesRepo from "@/lib/repositories/notes";
import * as scoreFilesRepo from "@/lib/repositories/score-files";
import * as sessionsRepo from "@/lib/repositories/sessions";
import * as songsRepo from "@/lib/repositories/songs";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function SongDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ songId: string }>;
  searchParams: Promise<{ setup?: string }>;
}) {
  const [{ songId }, sp] = await Promise.all([params, searchParams]);
  const userId = await getCurrentUserId();

  const song = await songsRepo.getSong(userId, songId);
  if (!song) notFound();

  const [blocks, scoreFiles, songNotes, albums] = await Promise.all([
    blocksRepo.listBlocksBySong(song.id),
    scoreFilesRepo.listScoreFiles(song.id),
    notesRepo.listNotes("song", song.id),
    albumsRepo.listAlbums(userId),
  ]);

  const storage = getStorage();
  const playable =
    [...scoreFiles]
      .filter((f) => f.fileType === "gp" || f.fileType === "musicxml")
      .sort(scoreFilesRepo.latestScoreFirst)[0] ?? null;

  const blockDetails = await Promise.all(
    blocks.map(async (block) => {
      const sessions = await sessionsRepo.listSessionsByBlock(block.id, 200);
      const best = sessions.reduce(
        (max, s) => (s.bestBpm && s.bestBpm > max ? s.bestBpm : max),
        0,
      );
      const minutes = sessions.reduce((sum, s) => sum + s.durationMin, 0);
      return {
        block,
        sessionCount: sessions.length,
        bestBpm: best > 0 ? best : null,
        totalMinutes: minutes,
        lastSession: sessions[0] ?? null,
      };
    }),
  );

  const showSetup = sp.setup === "1" || blocks.length === 0;

  return (
    <div className="space-y-7">
      <nav className="text-[12.5px] text-faint">
        <Link href="/library" className="hover:underline">
          我的曲库
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-muted">{song.title}</span>
      </nav>

      <div className="song-identity">
        <SongCover number="01" title={song.title} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="serif-heading text-[32px] leading-tight">{song.title}</h1>
            <StatusBadge status={song.status} />
            {song.type === "exercise" ? <Chip tone="info">练习曲</Chip> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
            {song.artist ? <span>{song.artist}</span> : null}
            {song.difficulty ? (
              <span>难度 {DIFFICULTY_LABELS[song.difficulty] ?? song.difficulty}</span>
            ) : null}
            <span>状态进度 {statusProgress(song.status)}%</span>
            <span>更新于 {song.statusChangedAt.toLocaleDateString("zh-CN")}</span>
            {song.tags.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {playable ? (
            <Link href={`/play/${song.id}`} className="btn btn-sm btn-accent">
              ▶ 播放整曲
            </Link>
          ) : null}
          <Link href={`/library/${song.id}?setup=1`} className="btn btn-sm">
            + 新建练习段落
          </Link>
        </div>
      </div>

      <Card className="card-pad">
        <AlbumSelector
          songId={song.id}
          albums={albums.map((a) => ({ id: a.id, title: a.title }))}
          currentAlbumId={song.albumId}
        />
      </Card>

      <Card className="card-pad">
        <StatusChanger songId={song.id} current={song.status} />
      </Card>

      {showSetup ? (
        <SongSetup
          initialSetup={sp.setup === "1"}
          song={{
            id: song.id,
            title: song.title,
            artist: song.artist,
            type: song.type,
            difficulty: song.difficulty,
            tags: song.tags,
            status: song.status,
          }}
          scoreFile={
            playable
              ? {
                  id: playable.id,
                  url: storage.publicUrl(playable.storagePath),
                  fileName: playable.fileName,
                  trackIndex: playable.trackIndex,
                }
              : null
          }
        />
      ) : null}

      <section>
        <SectionTitle>
          练习段落
          <span className="ml-1.5 font-normal normal-case text-faint">
            {blocks.length} 个
          </span>
        </SectionTitle>
        {blockDetails.length === 0 ? (
          <Card className="card-pad text-[12.5px] text-muted">
            <p>还没有练习段落。</p>
            <p className="mt-1">
              你可以直接播放整首曲目；需要针对某一段练习时，再创建练习段落。
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {playable ? (
                <Link href={`/play/${song.id}`} className="btn btn-sm btn-accent">
                  ▶ 播放整曲
                </Link>
              ) : null}
              <Link href={`/library/${song.id}?setup=1`} className="btn btn-sm">
                ＋ 新建练习段落
              </Link>
            </div>
          </Card>
        ) : (
          <div className="block-grid">
            {blockDetails.map((item) => (
              <Card key={item.block.id} className="overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-3.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/practice/${item.block.id}`}
                        className="text-[15px] font-semibold hover:underline"
                      >
                        {item.block.name}
                      </Link>
                      {item.block.status !== "active" ? (
                        <Chip tone={item.block.status === "mastered" ? "good" : "warn"}>
                          {item.block.status === "mastered" ? "已掌握" : "已暂停"}
                        </Chip>
                      ) : null}
                      {item.block.frequencyPerWeek ? (
                        <Chip tone="accent">{item.block.frequencyPerWeek} 次/周</Chip>
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
                      <span>
                        {item.block.isWholeSong ? "整曲练习 · 全部小节" : `第 ${item.block.barStart}–${item.block.barEnd} 小节`}
                      </span>
                      <span>
                        <strong className="text-ink">{item.block.currentBpm}</strong>
                        <span className="mx-1 text-faint">→</span>
                        <strong className="text-accent">{item.block.targetBpm}</strong>{" "}
                        BPM
                      </span>
                      {item.bestBpm ? <span>最高 {item.bestBpm} BPM</span> : null}
                      <span>{item.sessionCount} 次练习</span>
                      <span>累计 {formatDuration(item.totalMinutes)}</span>
                      {item.lastSession ? (
                        <span className="text-faint">
                          最近 {item.lastSession.date}
                          {item.lastSession.feeling
                            ? ` ${FEELING_META[item.lastSession.feeling].emoji}`
                            : ""}
                        </span>
                      ) : null}
                    </div>
                    {item.block.note ? (
                      <p className="mt-1.5 text-[12px] text-warn">{item.block.note}</p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 border-t border-line bg-surface2 px-4 py-2.5">
                  <BlockRowActions blockId={item.block.id} status={item.block.status} />
                </div>
                <details className="border-t border-line px-4 py-2.5">
                  <summary className="cursor-pointer text-[12.5px] text-muted">
                    编辑参数
                  </summary>
                  <div className="mt-2">
                    <BlockEditForm
                      block={{
                        id: item.block.id,
                        name: item.block.name,
                        barStart: item.block.barStart,
                        barEnd: item.block.barEnd,
                        isWholeSong: item.block.isWholeSong,
                        currentBpm: item.block.currentBpm,
                        targetBpm: item.block.targetBpm,
                        note: item.block.note,
                        priority: item.block.priority,
                        frequencyPerWeek: item.block.frequencyPerWeek,
                      }}
                    />
                  </div>
                </details>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>曲目笔记</SectionTitle>
        <Card className="card-pad space-y-3">
          <NoteList
            notes={songNotes.map((n) => ({
              id: n.id,
              content: n.content,
              barNumber: n.barNumber,
              createdAt: n.createdAt.toLocaleDateString("zh-CN"),
            }))}
          />
          <NoteEditor parentType="song" parentId={song.id} />
        </Card>
      </section>

      <section>
        <SectionTitle>乐谱与资料</SectionTitle>
        <Card className="card-pad space-y-2">
          {scoreFiles.length === 0 ? (
            <p className="text-[12.5px] text-muted">还没有上传文件</p>
          ) : (
            scoreFiles
              .slice()
              .sort((a, b) => b.version - a.version)
              .map((f) => (
                <div
                  key={f.id}
                  className="flex flex-wrap items-center gap-2 text-[12.5px]"
                >
                  <Chip tone={f.fileType === "pdf" ? "warn" : "accent"}>
                    {f.fileType.toUpperCase()}
                  </Chip>
                  <span className="truncate">{f.fileName}</span>
                  <span className="text-faint">v{f.version}</span>
                  {f.fileType === "gp" || f.fileType === "musicxml" ? (
                    <span className="text-faint">轨道 {f.trackIndex + 1}</span>
                  ) : null}
                  <a
                    className="ml-auto text-muted hover:underline"
                    href={storage.publicUrl(f.storagePath)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    下载
                  </a>
                </div>
              ))
          )}
          <div className="pt-1">
            <Link href={`/import?songId=${song.id}`} className="btn btn-sm">
              重新上传 / 追加文件
            </Link>
          </div>
        </Card>
      </section>

      <Card className="card-pad flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-faint">
          删除后该曲目的练习段落、任务与练习记录一并移除，且不可恢复。
        </p>
        <DeleteSongButton songId={song.id} />
      </Card>
    </div>
  );
}
