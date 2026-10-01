#!/usr/bin/env node
/**
 * 演示数据种子（可选）。
 *
 * 用途：在没有 Guitar Pro 文件的情况下，也能立刻走通完整链路 ——
 *   Today → Practice（渲染 24 小节五线谱 + TAB）→ 完成记录 → Dashboard BPM 曲线。
 *
 * 做三件事：
 *   1. 生成一份 24 小节的 MusicXML 吉他谱，落到 data/files/
 *   2. 写入 Song / ScoreFile / PracticeBlock / Notes / Tasks
 *   3. 写入 14 天跨度的 Practice Session（Best BPM 55 → 78），让曲线有形状
 *
 * 用法：
 *   node scripts/seed-demo.mjs           # 追加演示数据
 *   node scripts/seed-demo.mjs --reset   # 先清空全部业务数据再写入
 *
 * 注意：直接操作 SQLite，不经过应用层。仅用于本地体验，不要在有真实练习数据的库上跑。
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

const ROOT = path.resolve(import.meta.dirname, "..");
const DB_PATH = process.env.GUITAR_DB_PATH ?? path.join(ROOT, "data", "guitar-practice.db");
const FILES_DIR = process.env.GUITAR_FILES_DIR ?? path.join(ROOT, "data", "files");
const OWNER_ID = "00000000-0000-4000-8000-000000000001";

const reset = process.argv.includes("--reset");

// ---------------------------------------------------------------------------
// MusicXML 生成：24 小节，4/4，Am–F–C–G 分解和弦
// ---------------------------------------------------------------------------

const TUNING = [
  { step: "E", octave: 2 }, // 6 弦
  { step: "A", octave: 2 },
  { step: "D", octave: 3 },
  { step: "G", octave: 3 },
  { step: "B", octave: 3 },
  { step: "E", octave: 4 }, // 1 弦
];

const CHORDS = [
  // [string, fret] —— 从低音弦到高音弦
  [
    [5, 0],
    [4, 2],
    [3, 2],
    [2, 1],
    [1, 0],
    [2, 1],
    [3, 2],
    [4, 2],
  ], // Am
  [
    [6, 1],
    [4, 3],
    [3, 2],
    [2, 1],
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 3],
  ], // F
  [
    [5, 3],
    [4, 2],
    [3, 0],
    [2, 1],
    [1, 0],
    [2, 1],
    [3, 0],
    [4, 2],
  ], // C
  [
    [6, 3],
    [4, 0],
    [3, 0],
    [2, 0],
    [1, 3],
    [2, 0],
    [3, 0],
    [4, 0],
  ], // G
];

const FRET_TO_PITCH = [
  // 每根弦在 fret f 处对应的 (step, alter, octave)
  (f) => pitchUp("E", 2, f),
  (f) => pitchUp("A", 2, f),
  (f) => pitchUp("D", 3, f),
  (f) => pitchUp("G", 3, f),
  (f) => pitchUp("B", 3, f),
  (f) => pitchUp("E", 4, f),
];

/** 自然音阶（无升降）的十二平均律，足够覆盖演示用的小幅度按弦 */
const CHROMATIC = [
  ["C", 0],
  ["C", 1],
  ["D", 0],
  ["D", 1],
  ["E", 0],
  ["F", 0],
  ["F", 1],
  ["G", 0],
  ["G", 1],
  ["A", 0],
  ["A", 1],
  ["B", 0],
];

function pitchUp(step, octave, frets) {
  const startIndex = CHROMATIC.findIndex(([s, a]) => s === step && a === 0);
  let idx = startIndex + frets;
  let oct = octave;
  while (idx >= 12) {
    idx -= 12;
    oct += 1;
  }
  const [s, alter] = CHROMATIC[idx];
  return { step: s, alter, octave: oct };
}

function buildMusicXml() {
  const measures = [];
  const total = 24;
  let measureNumber = 1;

  for (let m = 0; m < total; m++) {
    const chord = CHORDS[m % CHORDS.length];
    const notes = chord.map(([stringNo, fret]) => {
      const p = FRET_TO_PITCH[stringNo - 1](fret);
      return `      <note>
        <pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ""}<octave>${p.octave}</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <type>eighth</type>
        <notations><technical><string>${stringNo}</string><fret>${fret}</fret></technical></notations>
      </note>`;
    });

    const attributes =
      m === 0
        ? `    <attributes>
      <divisions>4</divisions>
      <key><fifths>0</fifths><mode>minor</mode></key>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <staves>1</staves>
      <clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>
      <staff-details number="1">
        <staff-lines>6</staff-lines>
${TUNING.map(
  (t, i) =>
    `        <staff-tuning line="${i + 1}"><tuning-step>${t.step}</tuning-step><tuning-octave>${t.octave}</tuning-octave></staff-tuning>`,
).join("\n")}
      </staff-details>
    </attributes>
    <direction placement="above">
      <direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>92</per-minute></metronome></direction-type>
      <sound tempo="92"/>
    </direction>`
        : "";

    measures.push(`  <measure number="${measureNumber}">
${attributes}
${notes.join("\n")}
  </measure>`);
    measureNumber += 1;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>Demo Etude in A minor</work-title></work>
  <identification>
    <creator type="composer">Guitar Practice Demo</creator>
    <encoding><software>guitar-practice seed</software></encoding>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Guitar</part-name>
      <score-instrument id="P1-I1"><instrument-name>Acoustic Guitar (steel)</instrument-name></score-instrument>
      <midi-instrument id="P1-I1">
        <midi-channel>1</midi-channel>
        <midi-program>25</midi-program>
        <volume>80</volume>
      </midi-instrument>
    </score-part>
  </part-list>
  <part id="P1">
${measures.join("\n")}
  </part>
</score-partwise>
`;
}

// ---------------------------------------------------------------------------
// 写库
// ---------------------------------------------------------------------------

const now = () => Date.now();
const iso = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const dayKey = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return iso(d);
};

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(FILES_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// 表由应用启动时建（src/lib/db/client.ts 的幂等 DDL）；这里只检查是否已初始化
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all()
  .map((r) => r.name);
if (!tables.includes("songs")) {
  console.error(
    "✗ 数据库尚未初始化。请先运行一次 `npm run dev`（或 `npm run build`）让应用建表，再执行本脚本。",
  );
  process.exit(1);
}

if (reset) {
  for (const t of [
    "notes",
    "practice_sessions",
    "practice_tasks",
    "practice_blocks",
    "score_files",
    "songs",
    "books",
  ]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  console.log("· 已清空既有业务数据（--reset）");
}

db.prepare(
  `INSERT OR IGNORE INTO users (id, email, display_name, role, created_at)
   VALUES (?, ?, ?, 'owner', ?)`,
).run(OWNER_ID, null, process.env.GUITAR_OWNER_NAME ?? "Guitarist", now());

const songId = randomUUID();
const scoreFileId = randomUUID();
const relPath = `${songId}/${randomUUID()}.musicxml`;
const absPath = path.join(FILES_DIR, relPath);
fs.mkdirSync(path.dirname(absPath), { recursive: true });
fs.writeFileSync(absPath, buildMusicXml(), "utf8");

db.prepare(
  `INSERT INTO songs (id, user_id, title, artist, type, difficulty, tags, status, status_changed_at, created_at)
   VALUES (?, ?, ?, ?, 'song', 3, ?, 'practicing', ?, ?)`,
).run(
  songId,
  OWNER_ID,
  "Demo Etude in A minor",
  "Guitar Practice Demo",
  JSON.stringify(["demo", "arpeggio", "fingerstyle"]),
  now(),
  now(),
);

db.prepare(
  `INSERT INTO score_files (id, user_id, song_id, file_type, file_name, storage_path, track_index, version, created_at)
   VALUES (?, ?, ?, 'musicxml', ?, ?, 0, 1, ?)`,
).run(
  scoreFileId,
  OWNER_ID,
  songId,
  "Demo Etude in A minor.musicxml",
  relPath,
  now(),
);

// 两个 Block：一个整段分解和弦，一个"副歌加强段"
const blockA = randomUUID();
const blockB = randomUUID();

db.prepare(
  `INSERT INTO practice_blocks
     (id, user_id, song_id, name, bar_start, bar_end, current_bpm, target_bpm, default_bpm,
      default_loop, note, priority, status, frequency_per_week, speed_training_config, created_at, updated_at)
   VALUES (?, ?, ?, ?, 1, 16, 75, 96, 60, 1, ?, 3, 'active', 5, ?, ?, ?)`,
).run(
  blockA,
  OWNER_ID,
  songId,
  "Arpeggio Bar 1–16",
  "右手拇指保持稳定，注意 i-m 交替",
  JSON.stringify({ start: 60, target: 96, step: 4, repeats: 3 }),
  now(),
  now(),
);

db.prepare(
  `INSERT INTO practice_blocks
     (id, user_id, song_id, name, bar_start, bar_end, current_bpm, target_bpm, default_bpm,
      default_loop, note, priority, status, frequency_per_week, speed_training_config, created_at, updated_at)
   VALUES (?, ?, ?, ?, 17, 24, 60, 92, 60, 1, ?, 1, 'active', 3, NULL, ?, ?)`,
).run(
  blockB,
  OWNER_ID,
  songId,
  "Turnaround Bar 17–24",
  "换和弦时左手提前落位，避免断音",
  now(),
  now(),
);

db.prepare(
  `INSERT INTO notes (id, user_id, parent_type, parent_id, content, bar_number, created_at)
   VALUES (?, ?, 'song', ?, ?, NULL, ?)`,
).run(
  randomUUID(),
  OWNER_ID,
  songId,
  "标准调弦 EADGBE，原速 92 BPM，4/4",
  now(),
);

db.prepare(
  `INSERT INTO notes (id, user_id, parent_type, parent_id, content, bar_number, created_at)
   VALUES (?, ?, 'block', ?, ?, ?, ?)`,
).run(
  randomUUID(),
  OWNER_ID,
  blockA,
  "第 13 小节换把容易偏低，先慢速定音",
  13,
  now(),
);

// 任务：今天 + 昨天 Done + 昨天 Skipped
const taskToday = randomUUID();
db.prepare(
  `INSERT INTO practice_tasks
     (id, user_id, block_id, date, target_duration_min, target_bpm, priority, status, source, deferred_count, created_at)
   VALUES (?, ?, ?, ?, 15, 96, 3, 'todo', 'manual', 0, ?)`,
).run(taskToday, OWNER_ID, blockA, dayKey(0), now());

db.prepare(
  `INSERT INTO practice_tasks
     (id, user_id, block_id, date, target_duration_min, target_bpm, priority, status, source, deferred_count, created_at)
   VALUES (?, ?, ?, ?, 10, 92, 1, 'todo', 'auto', 0, ?)`,
).run(randomUUID(), OWNER_ID, blockB, dayKey(0), now());

db.prepare(
  `INSERT INTO practice_tasks
     (id, user_id, block_id, date, target_duration_min, target_bpm, priority, status, source, deferred_count, created_at)
   VALUES (?, ?, ?, ?, 15, 92, 3, 'done', 'manual', 0, ?)`,
).run(randomUUID(), OWNER_ID, blockA, dayKey(-1), now());

db.prepare(
  `INSERT INTO practice_tasks
     (id, user_id, block_id, date, target_duration_min, target_bpm, priority, status, source, deferred_count, created_at)
   VALUES (?, ?, ?, ?, 10, 88, 1, 'skipped', 'auto', 1, ?)`,
).run(randomUUID(), OWNER_ID, blockB, dayKey(-1), now());

// Session：14 天跨度，Best 55 → 78（Block A），Block B 少量记录
const sessionPlan = [
  [-13, blockA, 12, 55, 55, 52, "normal", "第一次完整跟下来，右手还行"],
  [-12, blockA, 15, 58, 60, 58, "good", ""],
  [-10, blockA, 18, 60, 62, 60, "good", ""],
  [-9, blockB, 10, 52, 55, 54, "hard", "17 小节换把丢了两次"],
  [-8, blockA, 20, 62, 65, 63, "good", ""],
  [-6, blockA, 16, 65, 68, 66, "normal", "右手指甲有点长"],
  [-5, blockB, 12, 58, 60, 60, "normal", ""],
  [-4, blockA, 22, 68, 70, 68, "good", "70 BPM 稳了"],
  [-3, blockA, 18, 70, 72, 71, "good", ""],
  [-2, blockA, 25, 72, 75, 73, "normal", "B 段还是断"],
  [-1, blockA, 21, 75, 78, 76, "good", "78 能弹但不稳"],
  [-1, blockB, 9, 60, 64, 62, "normal", ""],
  [0, blockA, 12, 75, 78, 77, "good", ""],
];

for (const [
  offset,
  blockId,
  duration,
  startBpm,
  bestBpm,
  finalBpm,
  feeling,
  note,
] of sessionPlan) {
  db.prepare(
    `INSERT INTO practice_sessions
       (id, user_id, block_id, date, duration_min, start_bpm, best_bpm, final_bpm, feeling, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    OWNER_ID,
    blockId,
    dayKey(offset),
    duration,
    startBpm,
    bestBpm,
    finalBpm,
    feeling,
    note || null,
    now(),
  );
}

const counts = db
  .prepare(
    `SELECT
       (SELECT COUNT(*) FROM songs) AS songs,
       (SELECT COUNT(*) FROM practice_blocks) AS blocks,
       (SELECT COUNT(*) FROM practice_sessions) AS sessions,
       (SELECT COUNT(*) FROM practice_tasks) AS tasks`,
  )
  .get();

db.close();

console.log("✓ 演示数据已写入");
console.log(`  曲目：Demo Etude in A minor（24 小节 MusicXML，已在浏览器端可渲染）`);
console.log(`  文件：${relPath}`);
console.log(
  `  记录：songs=${counts.songs} blocks=${counts.blocks} tasks=${counts.tasks} sessions=${counts.sessions}`,
);
console.log("");
console.log("接下来：打开 http://localhost:3000/ ，Today 页应出现两个任务。");
