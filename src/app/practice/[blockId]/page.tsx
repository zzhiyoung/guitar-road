import { notFound } from "next/navigation";

import {
  PracticeClient,
  type PracticePageData,
} from "@/components/practice/practice-client";
import { getCurrentUserId } from "@/lib/repositories";
import * as blocksRepo from "@/lib/repositories/blocks";
import * as notesRepo from "@/lib/repositories/notes";
import * as scoreFilesRepo from "@/lib/repositories/score-files";
import * as sessionsRepo from "@/lib/repositories/sessions";
import * as tasksRepo from "@/lib/repositories/tasks";
import { todayKey } from "@/lib/domain/date";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * SPEC §5.3 Practice —— 全产品最重要页面。
 * 一次点击从 Today 进来后，本页应能完成：看谱 → 播放 → Loop → 调速度 → 节拍器 → 记录。
 */
export default async function PracticePage({
  params,
}: {
  params: Promise<{ blockId: string }>;
}) {
  const { blockId } = await params;
  const userId = await getCurrentUserId();

  const row = await blocksRepo.getBlockWithSong(blockId);
  if (!row) notFound();
  const { block, song } = row;

  const [scoreFiles, pdfFiles] = await Promise.all([
    scoreFilesRepo.listScoreFiles(song.id),
    scoreFilesRepo.listScoreFiles(song.id),
  ]);

  const playable =
    [...scoreFiles]
      .filter((f) => f.fileType === "gp" || f.fileType === "musicxml")
      .sort((a, b) => b.version - a.version)[0] ?? null;
  const pdf =
    [...pdfFiles]
      .filter((f) => f.fileType === "pdf")
      .sort((a, b) => b.version - a.version)[0] ?? null;

  const [notes, sessions, recommended, todayTasks] = await Promise.all([
    notesRepo.listNotes("block", block.id),
    sessionsRepo.listSessionsByBlock(block.id, 30),
    sessionsRepo.recommendedStartBpm(block.id),
    tasksRepo.listTasksByDate(userId, todayKey()),
  ]);

  const personalBest = sessions.reduce(
    (max, s) => (s.bestBpm && s.bestBpm > max ? s.bestBpm : max),
    0,
  );
  const todayTask =
    todayTasks.find((t) => t.block.id === block.id && t.task.status === "todo") ??
    null;

  const storage = getStorage();

  const data: PracticePageData = {
    block: {
      id: block.id,
      name: block.name,
      barStart: block.barStart,
      barEnd: block.barEnd,
      currentBpm: block.currentBpm,
      targetBpm: block.targetBpm,
      defaultBpm: block.defaultBpm,
      defaultLoop: block.defaultLoop,
      note: block.note,
      speedTrainingConfig: block.speedTrainingConfig ?? null,
    },
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
    pdfFile: pdf
      ? { url: storage.publicUrl(pdf.storagePath), fileName: pdf.fileName }
      : null,
    notes: notes.map((n) => ({
      id: n.id,
      content: n.content,
      barNumber: n.barNumber,
    })),
    sessions: sessions.map((s) => ({
      id: s.id,
      date: s.date,
      durationMin: s.durationMin,
      startBpm: s.startBpm,
      bestBpm: s.bestBpm,
      finalBpm: s.finalBpm,
      feeling: s.feeling,
      note: s.note,
    })),
    todayTaskId: todayTask?.task.id ?? null,
    recommendedStartBpm: recommended ?? block.currentBpm,
    personalBestBpm: personalBest > 0 ? personalBest : null,
    today: todayKey(),
  };

  return <PracticeClient data={data} />;
}
