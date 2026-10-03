import { importer } from "@coderline/alphatab";
import { summarizeScore } from "./score-utils";

/** Parse the uploaded bytes on the server; never trust browser-supplied metadata. */
export function readScoreSummary(bytes: Uint8Array) {
  const score = importer.ScoreLoader.loadScoreFromBytes(bytes);
  if (!score.masterBars.length || !score.tracks.length) throw new Error("乐谱没有可播放的小节");
  return summarizeScore(score);
}
