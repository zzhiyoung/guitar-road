# 开发说明

## 技术与目录

Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4；alphaTab 1.8.4 负责乐谱渲染和播放；SQLite、better-sqlite3 与 Drizzle ORM 保存练习数据。

```text
src/app/                 页面、Server Actions、文件读取 API
src/app/play/[songId]/   整曲播放（只读，不产生练习记录）
src/app/creator/         Creator：截图 → OMR → MusicXML 预览与下载
src/components/          导入、曲库、练习、今日任务、成长与通用界面
src/components/player/   通用 alphaTab 播放器（Practice / 整曲播放 / Creator 共用）
src/lib/db/              SQLite schema、连接、幂等建表与增量迁移
src/lib/repositories/    数据读写
src/lib/services/        今日与成长页面的聚合查询
src/lib/storage/         FileStorage 与本地实现
src/lib/domain/          日期、状态机、常量、表单结果
src/lib/alphatab/        浏览器加载、谱表设置、小节与 tick 换算
src/lib/creator/         OMR 子进程调用、临时目录与契约类型
src/lib/audio/           WebAudio 节拍器
public/alphatab/         上游运行时、字体、音源及许可声明
tools/omr/              可选的 Python OMR sidecar（不参与 npm 依赖）
scripts/                演示数据、PWA 图标生成
assets/                 Windows 图标及其源 PNG
```

页面不直接执行 SQL 或读写上传文件，通过仓储与 FileStorage 完成。数据库保存文件相对路径，配合 `GUITAR_FILES_DIR` 定位文件。九张表包括 users、books、**albums**、songs、score_files、practice_blocks、practice_tasks、practice_sessions、notes。

`albums` 是本轮新增的曲库分类（与 `books` 正交：`books` 是「教材 → 练习曲」的来源维度，`albums` 是「曲库 → 曲目」的整理维度）。`songs.album_id` 为 `ON DELETE SET NULL`：删除专辑只把曲目移回未分类，绝不删除曲目。

当前不需要 Supabase，也没有账户隔离。`drizzle.config.ts` 是未来手工生成迁移时的参考；运行时先执行 `src/lib/db/client.ts` 的幂等 DDL，再执行 `src/lib/db/migrations.ts` 里登记过的增量迁移（记录在 `_migrations` 表，单条迁移一个事务，失败整体回滚）。新增列时**必须**走 `MIGRATIONS`，禁止 DROP TABLE 或要求用户删库。`drizzle-kit` 不在当前必需依赖中。未来云端迁移需要单独设计和验证，不能视为已实现功能。

### 通用播放器 ScorePlayer

`src/components/player/score-player.tsx` 是唯一的 alphaTab 初始化入口，Practice、整曲播放、Creator 预览三处复用：

```text
                 ScorePlayer
                /     |      \
         Song Player  Practice  Creator
```

它通过 `ref` 暴露 `playPause / stop / setTickPosition / getTickPosition / readyForPlayback`，
并用回调把 `scoreLoaded / playerStateChanged / playerPositionChanged / playbackRange` 交给外层。
练习业务（BPM 训练、Loop、节拍器、Session）一律留在 `practice-client.tsx`，不要下沉进播放器。
改播放器时要同时回归 `/practice/<blockId>` 与 `/play/<songId>`。

整曲播放是**只读**体验：不创建 Practice Block、不写 Practice Session、不影响 BPM 进度与 Streak。

### 主程序体验行为

曲库首页为专辑卡片；`?album=<id>`、`?album=unfiled` 与 `?album=all` 分别为专辑内、未分类及全部列表。列表的整曲安排通过 `whole-song.ts` 事务复用可见整曲 Block，并对同日任务去重。增量迁移 `0002_whole_song_practice` 只增加类型列及部分唯一索引，旧记录不转换。整曲练习的范围随最新谱面动态读取。

练习 MIDI 按书面顺序生成，谱内反复/跳转在生成时暂时关闭并恢复，音频范围在 MIDI 加载结束和播放前重设。小节 tick 使用真实时值累计（包含弱起），完整循环事件用于速度训练。普通整曲播放保留原谱的反复与跳转。

预备拍由 `audio/count-in.ts` 按起播小节拍号与实际速度安排到 WebAudio 时钟；取消同时清理排队音符与异步解锁回调。原生 alphaTab 预备拍在精确的拍号变化边界会继承旧拍号，故未直接使用。页面计时草稿存于当前标签页的 sessionStorage，显式暂停与不可见时间不计入，Session 仍按整数分钟保存。

播放器统一提供主音量滑杆，默认 150%，原谱的轨道与音符力度保持。音量及预备衔接需真实听音，不能以浏览器播放状态代替。当前交付与证据见 [UX_FEEDBACK.md](UX_FEEDBACK.md)。

针对这些数据及播放边界的回归使用临时数据库和原创 MusicXML：

```bash
# 本轮验证使用 Node 24；测试命令不改变应用的 Node 22+ 要求
node --experimental-transform-types scripts/check-ux.mjs
```

测试仅替换 Next 缓存失效调用，其余上传、仓储、迁移、存储及 alphaTab 合成器执行实际代码。测试输出临时目录，便于排查；不会读取或改写真实练习数据。

### Creator 测试功能与 OMR sidecar

Creator 整体为实验测试功能，仅覆盖有限样本，尚未完成真实乐谱泛化与设备验收。所有识别结果都须人工校对；页面可用、测试通过或引擎就绪不能视为识别质量已验收。

Creator 通过 `spawn(python, [...])` 调用 `tools/omr`（**不经过 shell**，用户文件名不会拼进命令）。
契约见 [tools/omr/README.md](../tools/omr/README.md)：stdout 最后一行是 JSON，退出码 `0` 成功、`2` 引擎缺失。

Python / homr / PyTorch 缺失时 `getOmrStatus()` 返回 `available: false`，`/creator` 正常打开，
其余页面完全不受影响。**不要让 OMR 依赖进入 `package.json`。**

## 安装与运行

```bash
npm ci
npm run dev
npm run typecheck
npm run build
npm run start
```

Node.js 最低 22：Next.js 自身要求较低，但当前 better-sqlite3 13 要求 Node.js 22 或更新版本。当前依赖已附带运行产物，`.npmrc` 设置 `ignore-scripts=true`，安装时不执行依赖生命周期脚本，避免不必要的原生重编译；显式 `npm run build` / `start` 仍正常执行。升级依赖或使用未覆盖的平台时，需重新核对是否需要安装脚本或原生编译工具。

改动 Next.js 代码前阅读安装版本自带的 `node_modules/next/dist/docs/`。不要根据其他 Next.js 版本猜测 API。

开发、构建和生产服务不要同时共用一个输出目录。停止服务后再构建，或在整个构建/启动过程中使用相同的独立目录：

```powershell
$env:GUITAR_NEXT_DIST_DIR = '.next-preview'
npm run build
npm run start -- --hostname 127.0.0.1 --port 3001
```

需要测试写入时，设置 `GUITAR_DB_PATH` 与 `GUITAR_FILES_DIR` 指向临时目录；切勿复用真实练习数据库。`.env.local` 由 Next.js 加载，直接执行 Node 脚本时需另行设置环境变量。

## alphaTab 集成与升级

alphaTab 的 Web Worker / AudioWorklet 需要找到自身脚本。当前使用 `public/alphatab/alphaTab.min.js` 的官方 UMD 构建，由浏览器动态加载，类型来自 npm 包。

- `core.scriptFile` 必须为绝对 URL，见 `src/lib/alphatab/loader.ts`。
- MusicXML 谱表切换需要设置 staff 的 `showStandardNotation` / `showTablature`，见 `score-utils.ts`。
- `notation.elements` 使用真正的 `Map`，而不是字符串索引对象。
- 乐谱容器始终参与布局；不要用 `display:none` 隐藏正在测量的容器。折叠时保留布局，展开时设置溢出滚动。
- 首次播放需要用户交互解锁 WebAudio。浏览器播放推进不等于真实设备音频验证。

升级 npm 包后，将该版本的以下资源同步到 `public/alphatab/`，保留上游版权与许可：

```text
dist/alphaTab.min.js
dist/alphaTab.core.min.mjs
dist/alphaTab.worker.min.mjs
dist/alphaTab.worklet.min.mjs
dist/font/Bravura.woff、Bravura.woff2
dist/font/Bravura-OFL.txt、Bravura-FONTLOG.txt、Bravura-OFL-FAQ.txt
dist/soundfont/sonivox.sf2
```

alphaTab 包根目录 `LICENSE`、`LICENSE.header` 也要保留。音源的上游 `dist/soundfont/LICENSE` 是版权声明，保存为本项目 `soundfont/NOTICE`；该目录 `LICENSE` 为完整 Apache-2.0 文本。来源见 [第三方声明](../THIRD_PARTY_NOTICES.md)。

## 数据与 PWA

日期以用户本地日期生成 `YYYY-MM-DD`，练习记录是时长与速度趋势的事实来源。曲目状态保留 inbox → learning → practicing → playable → mastered → maintenance → archived 的规则及合法回退。

Service Worker 缓存静态资源，不缓存 API 与上传曲谱，也不提供数据库同步。PWA 可安装不代表离线可完成所有流程；手机或平板访问仍需要运行中的服务与可达网络。

## 验证流程

类型检查和生产构建通过后，使用独立测试数据库做以下检查：

1. 导入有权使用的 Guitar Pro / MusicXML，核对轨道、谱表和小节范围。
2. 创建段落，验证播放、暂停、循环、BPM、播放速度与节拍器。
3. 保存练习时长、速度与感受，确认历史记录和成长页一致。
4. 验证任务完成、恢复、跳过、延期，以及新最佳与普通保存反馈。
5. 检查空数据库引导、手机/平板宽度、弹窗关闭和键盘焦点。
6. 在实际使用设备上试听音频；PDF 只作资料查看。

新增能力另需验证：

7. **专辑**：新建 / 重命名 / 上移下移 / 删除；曲目加入、更换、移回未分类；`?album=<id>`、
   `?album=unfiled` 与 `status` / `type` / `q` 组合筛选；删除专辑后曲目仍在。
8. **整曲播放**：没有练习段落的曲目也能播放；播放后 `practice_blocks` /
   `practice_sessions` / `practice_tasks` 均无新增；谱表切换与播放速度正常。
9. **Creator**：未装引擎时应用能启动、`/creator` 能打开并提示未安装；装了引擎后
   PNG / JPG / 粘贴截图都能识别，预览可播放，下载的 MusicXML 能被 Guitar Pro 导入。
10. **迁移**：在真实数据库的**副本**上验证 `albums` 建表、`songs.album_id` 补列后
    Songs / Blocks / Tasks / Sessions / Notes / Score Files / Books 数量不变。

公开仓库的演示截图不构成真机音频或用户验收。Windows 启动器另需完成 [三条启动路径](LAUNCHER.md) 的验证。
