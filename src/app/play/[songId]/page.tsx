import { notFound } from "next/navigation";

import { SongPlayer } from "@/components/player/song-player";
import { getCurrentUserId } from "@/lib/repositories";
import * as scoreFilesRepo from "@/lib/repositories/score-files";
import * as songsRepo from "@/lib/repositories/songs";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * SPEC §3.6 —— 整曲播放。
 *
 * 只要 Song 存在 GP / MusicXML 就能播放，不依赖任何 Practice Block。
 * 本页是纯只读播放：不创建 Block、不写 Session、不影响任何统计。
 */
export default async function PlaySongPage({
  params,
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params;
  const userId = await getCurrentUserId();

  const song = await songsRepo.getSong(userId, songId);
  if (!song) notFound();

  const scoreFiles = await scoreFilesRepo.listScoreFiles(song.id);
  // 沿用现状：取 version 最大的可播放文件
  const playable =
    [...scoreFiles]
      .filter((f) => f.fileType === "gp" || f.fileType === "musicxml")
      .sort(scoreFilesRepo.latestScoreFirst)[0] ?? null;

  const storage = getStorage();

  return (
    <SongPlayer
      data={{
        song: { id: song.id, title: song.title, artist: song.artist },
        scoreFile: playable
          ? {
              id: playable.id,
              fileName: playable.fileName,
              url: storage.publicUrl(playable.storagePath),
              fileType: playable.fileType,
              trackIndex: playable.trackIndex,
            }
          : null,
      }}
    />
  );
}
