# 开发说明

## 技术与目录

Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4；alphaTab 1.8.4 负责乐谱渲染和播放；SQLite、better-sqlite3 与 Drizzle ORM 保存练习数据。

```text
src/app/                 页面、Server Actions、文件读取 API
src/components/          导入、曲库、练习、今日任务、成长与通用界面
src/lib/db/              SQLite schema、连接与幂等建表
src/lib/repositories/    数据读写
src/lib/services/        今日与成长页面的聚合查询
src/lib/storage/         FileStorage 与本地实现
src/lib/domain/          日期、状态机、常量、表单结果
src/lib/alphatab/        浏览器加载、谱表设置、小节与 tick 换算
src/lib/audio/           WebAudio 节拍器
public/alphatab/         上游运行时、字体、音源及许可声明
scripts/                演示数据、PWA 图标生成
assets/                 Windows 图标及其源 PNG
```

页面不直接执行 SQL 或读写上传文件，通过仓储与 FileStorage 完成。数据库保存文件相对路径，配合 `GUITAR_FILES_DIR` 定位文件。八张表包括 users、books、songs、score_files、practice_blocks、practice_tasks、practice_sessions、notes。

当前不需要 Supabase，也没有账户隔离。`drizzle.config.ts` 是未来手工生成迁移时的参考，运行时使用幂等 DDL；`drizzle-kit` 不在当前必需依赖中。未来云端迁移需要单独设计和验证，不能视为已实现功能。

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

公开仓库的演示截图不构成真机音频或用户验收。Windows 启动器另需完成 [三条启动路径](LAUNCHER.md) 的验证。
