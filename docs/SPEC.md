# Guitar Road 吉他练习工作台 — 产品规格文档 (SPEC)

> Version: 1.0-draft | Date: 2026-10-01 | Status: 待评审
> 来源：用户 PRD v1（Guitar Practice 吉他练习工作台）
>
> 本文保留初始产品规划，包含尚未实现的云端登录、邀请与迁移目标。当前已实现功能和安装方法以 [README](../README.md) 为准；Guitar Practice 是项目早期名称。

---

## 1. Problem Statement（问题陈述）

个人吉他学习者每天练琴时面临的核心问题：**打开工具后不知道今天该练什么，也无法快速进入"具体段落的针对性练习"**。

- **谁遇到这个问题**：本人（主要用户），及少量有相同需求的朋友。频率为每日。
- **现状痛点**：
  - Guitar Pro 强于制谱与播放，但弱于"练习管理"——没有每日任务、没有 BPM 进步追踪、没有练习记录；
  - 现有练习 App（如 Yousician）面向零基础课程，不适合管理自己的曲目攻克计划；
  - 练习数据散落在记忆和零散笔记中，**无法量化"我到底有没有在进步"**，导致动力衰减。
- **不解决的代价**：练习缺乏结构与反馈，曲目攻克周期拉长，练琴动力下降。

---

## 2. Goals（目标）

| # | 目标 | 类型 | 衡量方式 |
|---|---|---|---|
| G1 | **打开网站 → 一次点击 → 开始练琴**（Practice First） | 用户目标 | Today 页直达练习页 ≤ 2 次点击；进入练习页到发出第一个音 ≤ 15 秒 |
| G2 | **以 Practice Block（最小练习单元）为核心组织练习**，支持 BPM 速度训练闭环 | 用户目标 | 能创建带小节范围的 Block，记录 Start/Target/Best BPM，形成 BPM 进步曲线 |
| G3 | **连续使用 14 天**（MVP 唯一验收标准） | 用户目标 | 本人 14 天内 ≥ 12 天有 Practice Session 记录 |
| G4 | **量化进步感**：Dashboard 展示时长、Streak、任务完成率、BPM Progress | 用户目标 | Dashboard 能回答"我最近练得怎么样、哪里在进步" |
| G5 | **全平台可用**：Windows / Mac / iPad / 手机通过 PWA 覆盖 | 用户目标 | 在 4 类设备上均可完成核心练习流程 |

**G3 是本产品 MVP 的唯一硬性验收标准**（详见 §9.2）。

---

## 3. Non-Goals（明确不做 — v1）

以下能力**全部不做**，且写入本节以防止 scope creep（任何新增需求必须以删除等量需求或明确延期为代价）：

| 不做的事 | 原因 |
|---|---|
| 完整制谱 / Guitar Pro 编辑器 | Guitar Pro 已覆盖，本产品定位为练习工具 |
| AI 自动纠错、麦克风实时识别弹奏正确率 | 技术复杂度极高，与核心闭环无关（P4 路线） |
| PDF 自动识谱 / 整本书 OMR 扫描 | 后续辅助工具（P1 路线），不影响核心闭环 |
| 手机原生 App | PWA 已覆盖全平台，免 App Store |
| 社区、好友动态、排行榜、教师/课程系统、支付 | 无商业化计划 |
| 公开注册、多角色权限、多租户 | 用户仅为自己+受邀朋友，Auth 只做白名单邀请 |
| AI 陪练、智能任务推荐、Spaced Repetition | 未来 P2/P3 路线，v1 数据模型需兼容但不实现 |

---

## 4. 用户画像与用户故事

### 4.1 用户画像

- **Owner（主要用户）**：吉他爱好者，熟悉 Guitar Pro，追求结构化、数据化的练习方式。Windows 为主，希望兼顾平板与手机。
- **Friend（受邀朋友）**：少量吉他爱好者，只读+独立管理自己的数据，无需协作功能。

### 4.2 User Stories（按优先级排序）

**P0 — 核心闭环**

1. 作为 Owner，我想上传 Guitar Pro 文件并自动创建 Song，这样我不需要手动录入曲目信息。
2. 作为 Owner，我想为 Song 选择 Track 并创建 Practice Block（起止小节、当前/目标 BPM、Loop 设置），这样我能针对具体段落练习而不是整曲泛练。
3. 作为 Owner，我想打开 Practice 页后直接看到该 Block 的五线谱+TAB、点击播放、设置 Loop 和播放速度、使用内嵌节拍器，这样我在一个页面完成所有练习操作。
4. 作为 Owner，我想把 Practice Block 加入今日任务，这样每天打开网站就知道该练什么。
5. 作为 Owner，我想在练习结束后记录时长、Best BPM、Feeling 和笔记，这样我的练习历史可追溯。
6. 作为 Owner，我想在 Dashboard 看到 BPM Progress 曲线和本周练习时长、Streak，这样我能确认自己在进步。
7. 作为 Friend，我想通过邀请链接注册并只看到自己的数据，这样隐私得到保障。

**P1 — 显著增强**

8. 作为 Owner，我想给 Practice Block 设置练习频率（如 3 次/周），系统自动生成每日任务，这样不用每天手工安排。
9. 作为 Owner，我想使用速度训练模式（Start/Target/Step/每档重复次数），系统逐档提速并记录 Today Best，这样速度提升有章法。
10. 作为 Owner，我想上传教材 PDF 并创建关联到页码的 Exercise（Book 包含多个 Exercise），这样 Berklee 教材练习也能纳入体系。
11. 作为 Owner，我想在练习完成后看到当日总结（时长、任务完成率、New Best、周对比），这样有即时正反馈。
12. 作为 Owner，我想对任务执行 Done / Skip / 延后到明天，这样计划能弹性适配现实。

**P2 — 未来方向（仅做架构兼容）**

13. 作为 Owner，我以后想把扫描的教材转为 MusicXML 草稿导入（OMR，70–90% 正确率 + 人工修正）。
14. 作为 Owner，我以后想收到基于练习间隔/BIM 进度的智能练习推荐与 Spaced Repetition 复习安排。

---

## 5. 功能需求

优先级采用 MoSCoW：**P0=Must / P1=Should / P2=Won't(this version)**。

### 5.1 Today（每日练习入口）

| ID | 需求 | 优先级 |
|---|---|---|
| T-1 | 显示今日任务列表：任务名、当前 BPM、今日目标 BPM、预计时长、最近一次练习结果、完成状态 | P0 |
| T-2 | 任务点击 → 直接进入对应 Practice Block 的 Practice 页（一次点击开始练琴） | P0 |
| T-3 | 任务操作：开始练习 / 完成 / 跳过 / 延后到明天 | P0 |
| T-4 | 空状态（今日无任务）：显示引导创建任务或从 Library 选择 Block | P0 |
| T-5 | 任务来源支持自动生成：Block 设置 Frequency（次/周）后系统自动加入 Today | P1 |
| T-6 | 练完后展示当日总结情绪反馈页（时长、任务完成率、New Best、周对比） | P1 |

**验收标准（T-1~T-3）：**
- [ ] Given 今日存在 3 个 Todo 任务，When 打开 Today 页，Then 3 个任务全部显示且按优先级排序
- [ ] Given 任务处于 Todo 状态，When 点击任务卡片，Then 跳转 Practice 页且 Block 上下文（曲目/段落/BPM）正确加载
- [ ] Given 任务处于 Todo 状态，When 点击"跳过"，Then 任务状态变为 Skipped 且不出现在明日列表（除非 Frequency 触发）
- [ ] Given 任务被"延后到明天"，When 明日打开 Today，Then 该任务出现在列表中且保留原目标

### 5.2 Library（曲库）

| ID | 需求 | 优先级 |
|---|---|---|
| L-1 | Song 对象管理：Title / Artist / Type（Song·Exercise）/ Difficulty / Tags | P0 |
| L-2 | Book 对象：可包含多个 Exercise（如 Berklee Vol.1 → Exercise 23） | P0 |
| L-3 | 曲目状态机：Inbox → Learning → Practicing → Playable → Mastered → Maintenance → Archived | P0 |
| L-4 | 曲目详情页：关联的 Score Files、Practice Blocks、Notes、练习历史 | P0 |
| L-5 | Library 列表支持按状态/类型/标签筛选和搜索 | P1 |

**验收标准（L-3）：**
- [ ] 状态仅允许沿状态机流转或显式回退，不允许任意跳转（Archived 可恢复）
- [ ] 状态变更自动记录时间戳（供 Dashboard 的 Repertoire Progress 使用）

### 5.3 Practice（练习页 — 全产品最重要页面）

| ID | 需求 | 优先级 |
|---|---|---|
| P-1 | 页面布局（自上而下）：Block 信息头（曲目/段落/小节范围）→ 乐谱区（五线谱+TAB）→ 播放控制栏 → BPM/速度控制 → 目标与最佳 BPM 展示 → Note 区 → 完成按钮 | P0 |
| P-2 | 乐谱渲染：alphaTab 读取 GP 文件，显示五线谱+TAB，播放带光标 | P0 |
| P-3 | Loop：按 Block 的起止小节循环播放 | P0 |
| P-4 | BPM 控制：`[-] [+]` 调整，范围 30–300 | P0 |
| P-5 | 播放速度百分比（如 80%），与 BPM 独立显示 | P0 |
| P-6 | 内嵌节拍器：BPM、Start/Stop、拍号、Accent 第一拍、音量 | P0 |
| P-7 | 练习计时：进入页面自动开始（或一键开始），结束时展示本次时长 | P0 |
| P-8 | 完成本次练习：弹出记录表单（时长 / Start BPM / Best BPM / Final BPM / Feeling / Note） | P0 |
| P-9 | PDF 资料 Block：练习时显示 PDF 对应页（不可播放） | P1 |
| P-10 | 速度训练模式（详见 §5.4） | P1 |
| P-11 | 拍号切换栏显示（alphaTab 自带） | P0 |

**验收标准（P-2~P-6）：**
- [ ] Given 上传的 `Hotel California.gp5`，When 打开其 Block 的 Practice 页，Then 五线谱与 TAB 正确渲染，播放时光标跟随，Loop 限定在设定小节
- [ ] Given BPM 显示 75，When 点击 `[+]` 一次，Then BPM 变为 76（或按设定步长 80）；播放中调整 BPM 立即生效
- [ ] Given 节拍器开启、拍号 4/4，When 播放，Then 第一拍有 Accent（音高/音量区分），其余拍均匀
- [ ] Given 调整 Playback Speed 至 80%，When 播放，Then 乐曲以 80% 速度播放且音调不变（时间拉伸）

**技术约束：** alphaTab 只作为 dependency 使用，**不修改其源码**。

### 5.4 Practice Block（核心数据对象）与速度训练

| ID | 需求 | 优先级 |
|---|---|---|
| B-1 | Practice Block 字段：所属曲目、名称、起始小节、结束小节、当前 BPM、目标 BPM、默认 BPM、默认 Loop、备注、优先级、状态 | P0 |
| B-2 | 一个 Song/Exercise 可创建多个 Block（如 Neon Intro 拆 3 段） | P0 |
| B-3 | Block 创建入口：上传 GP 后引导创建；Library 详情页随时补建 | P0 |
| B-4 | 速度训练参数：Start / Target / Step / 每档重复次数 | P1 |
| B-5 | 速度训练执行：逐档播放，某档失败可停留重试，记录 Today Best BPM | P1 |
| B-6 | 下次打开时给出 Recommended Start（基于上次 Best） | P1 |
| B-7 | Auto Speed Trainer：每完整 Loop 3 次自动 +5 BPM | P2 |

**验收标准（B-5）：**
- [ ] Given Start=60 / Target=90 / Step=5 / 重复=3，When 执行训练，Then 顺序为 60×3 → 65×3 → …，任何一档 3 次中失败 1 次则该档重来，直到成功才升级
- [ ] Given 训练结束或中止，Then 生成 Session 记录且 Best BPM = 实际达到的最高档位

### 5.5 节拍器

| ID | 需求 | 优先级 |
|---|---|---|
| M-1 | BPM、Start/Stop、拍号（常见 2/4·3/4·4/4·6/8）、Accent 第一拍、音量 | P0 |
| M-2 | 内嵌于 Practice 页，不做独立复杂 Metronome 页面 | P0 |
| M-3 | 每两拍/四拍一次、Random mute、Subdivision | P2 |

### 5.6 曲谱导入

| ID | 需求 | 优先级 |
|---|---|---|
| I-1 | Guitar Pro 格式：`.gp` `.gpx` `.gp5` `.gp4` `.gp3`（优先级最高） | P0 |
| I-2 | 上传后自动创建 Song，用户补填 Title/Artist/Type/Difficulty/Tags | P0 |
| I-3 | 选择 Track（如 Lead Guitar），之后生成 Practice Block | P0 |
| I-4 | MusicXML：`.musicxml` `.xml`（第二输入格式） | P1 |
| I-5 | PDF：仅作资料保存（关联 Book/Exercise + 页码），不要求可播放 | P1 |
| I-6 | 支持对同一曲目"重新上传修改后的 GP 文件"（替换 Score File，Block 保留） | P1 |

**验收标准（I-1~I-3）：**
- [ ] Given 有效的 `.gp5` 文件，When 上传，Then 5 秒内创建 Song 且 alphaTab 可渲染
- [ ] Given 损坏/非乐谱文件，When 上传，Then 显示明确错误且不创建任何对象
- [ ] Given GP 文件含多 Track，When 导入，Then 用户可选择目标 Track，乐谱只渲染所选 Track

### 5.7 笔记系统

| ID | 需求 | 优先级 |
|---|---|---|
| N-1 | Song Note（如 "Drop D tuning, 原曲 105 BPM"） | P0 |
| N-2 | Practice Block Note（如 "Bar 23 Bend 容易偏低"） | P0 |
| N-3 | Timestamp/Bar Note（关联具体小节） | P2 |

### 5.8 每日任务（Task）

| ID | 需求 | 优先级 |
|---|---|---|
| K-1 | Task 字段：Practice Block、Date、Target Duration、Target BPM、Priority、Status | P0 |
| K-2 | Status：Todo / Done / Skipped | P0 |
| K-3 | 手工创建（"明天练 Neon Intro 15 min"） | P0 |
| K-4 | 自动生成：Block Frequency（次/周）驱动 | P1 |
| K-5 | 延后到明天（顺延，不丢失目标） | P0 |

### 5.9 Practice Session（练习记录）

| ID | 需求 | 优先级 |
|---|---|---|
| S-1 | 每次练习生成一条：日期、Block、时长、Start BPM、Best BPM、Final BPM | P0 |
| S-2 | Feeling 三档：🙂 Good / 😐 Normal / 😵 Hard | P0 |
| S-3 | Session Note（"82 BPM 能弹，但还不稳定"） | P0 |
| S-4 | Session 历史按 Block 聚合，供 BPM 曲线与 Recommended Start 使用 | P0 |

### 5.10 Dashboard

| ID | 需求 | 优先级 |
|---|---|---|
| D-1 | 六指标卡：Today 时长 / This Week 时长 / Streak / Tasks 完成率 / Songs 状态分布 / BPM Progress | P0 |
| D-2 | BPM Progress 图：单 Block 的 Best BPM 随时间曲线（**Dashboard 最有价值的一张图**） | P0 |
| D-3 | 轻量 Achievement：First 10 Hours / 7 Day Streak / First Song Mastered / 100 Sessions / +20 BPM | P1 |

**验收标准（D-2）：**
- [ ] Given Neon Intro Block 有 5 条 Session（9/1→10/1，Best 55→78），When 打开 Dashboard 并选择该 Block，Then 曲线显示 5 个点且纵轴为 BPM、横轴为日期

---

## 6. 数据模型（v1 共 8 张表）

```text
users
books
songs
score_files
practice_blocks
practice_tasks
practice_sessions
notes
```

关系：

```text
Book ──< Song/Exercise ──< Score File
                    │
                    └──< Practice Block ──< Task
                                │      ──< Session
                                └──────< Note
```

### 表结构草案（SQLite / PostgreSQL 通用，经 Drizzle ORM 定义）

> 本地阶段（A）用 SQLite 落地；云端阶段（B）切换 PostgreSQL driver，表结构不变。`user_id` 本地阶段统一填 owner 记录。

**users** — id (uuid, auth), email, display_name, role (owner/friend), created_at

**books** — id, user_id→users, title, author/source, pdf_file_id (nullable→score_files), created_at

**songs** — id, user_id, title, artist, type (song/exercise), book_id (nullable→books), pdf_page (nullable, Exercise 关联教材页码), difficulty (1-5), tags (text[]), status (inbox/learning/practicing/playable/mastered/maintenance/archived), status_changed_at, created_at

**score_files** — id, user_id, song_id→songs, file_type (gp/musicxml/pdf), file_name, storage_path, track_index (int, 选定的 GP Track), version, created_at

**practice_blocks** — id, user_id, song_id→songs, name, bar_start, bar_end, current_bpm, target_bpm, default_bpm, default_loop (bool), note (text), priority (int), status (active/paused/mastered), frequency_per_week (nullable, P1), speed_training_config (jsonb, nullable: {start,target,step,repeats}), created_at, updated_at

**practice_tasks** — id, user_id, block_id→practice_blocks, date (date), target_duration_min, target_bpm, priority, status (todo/done/skipped), source (manual/auto), created_at

**practice_sessions** — id, user_id, block_id, date, duration_min, start_bpm, best_bpm, final_bpm, feeling (good/normal/hard), note, created_at

**notes** — id, user_id, parent_type (song/block), parent_id, content, bar_number (nullable, P2 Timestamp Note), created_at

**设计要点：**
- 阶段 B：所有业务表带 `user_id`（RLS 行级隔离）；阶段 A：照常带 `user_id`（恒为 owner），避免迁移改表
- `score_files.version` 支持"重新上传修改后的 GP"（P1-I6），Block 引用 song 而非具体文件版本
- `practice_blocks.speed_training_config` 为 json（SQLite 用 text 存 JSON），为 P1 速度训练和 P2 Auto Trainer 预留

---

## 7. 技术架构

### 7.0 部署策略：本地优先（已决策 2026-10-01）

> **第一阶段本地运行，能用了再迁移云端。**

分两个阶段：

| | 阶段 A：本地运行（Phase 1–4 全程） | 阶段 B：云端迁移（本地用顺后） |
|---|---|---|
| 运行方式 | `next dev` / 本地 `next start`，localhost 访问 | 部署到云端（Vercel / Cloudflare / 自托管） |
| 数据库 | **SQLite**（本地文件 `data/guitar-practice.db`，经 ORM 访问） | PostgreSQL（Supabase） |
| 文件存储 | 本地目录 `data/files/`（GP/MusicXML/PDF），经 Next.js API 路由上传/读取 | Supabase Storage |
| 认证 | **跳过**（单用户本地模式，无登录页） | Supabase Auth 邀请白名单 |
| 多用户 | 不支持（单用户假设） | RLS 行级隔离（朋友数据互不可见） |

**迁移保障（本地阶段即遵守）：**
1. **所有数据访问走 Repository 层**（`src/lib/repositories/`），页面/组件不直接碰 SQL 或存储 API —— 迁移时只替换 Repository 实现；
2. **ORM 选 Drizzle**：同一套 schema 定义同时支持 SQLite 与 PostgreSQL，迁移时切换 driver 即可，表结构不变（§6 的 8 张表设计对两种库通用）；
3. 文件存储走统一的 `FileStorage` 接口（本地实现 = 读写 `data/files/`；云端实现 = Supabase Storage），数据库存相对路径而非绝对路径；
4. 本地阶段 `users` 表仍保留（单条 owner 记录），业务表照常带 `user_id`，避免迁移时改表；
5. PWA 能力（可安装）本地阶段即可启用，`next dev` 下即可调试。

### 7.1 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 形态 | **Web App + PWA** | Windows/Mac/iPad/手机全覆盖，可安装到桌面，免 App Store |
| 前端 | **Next.js + React + TypeScript** | 页面：Today / Practice / Library / Dashboard / Import |
| UI | **Tailwind CSS** | |
| 乐谱引擎 | **alphaTab**（dependency，当前最新稳定版 1.8.4） | GP Parser、MusicXML、五线谱、TAB、MIDI Playback、光标、Loop、Speed。**不修改源码** |
| 数据库 | **阶段 A：SQLite + Drizzle ORM → 阶段 B：Supabase PostgreSQL** | 8 张表，见 §6 |
| 存储 | **阶段 A：本地 `data/files/` → 阶段 B：Supabase Storage** | GP / MusicXML / PDF / 封面 |
| 认证 | **阶段 A：无 → 阶段 B：Supabase Auth（邀请制白名单）** | 不开放公开注册 |

**架构原则：**
1. Practice First：首页路由 = Today，不是 Library
2. alphaTab 只做 dependency；未来 OMR 产出 MusicXML 走同一导入管道
3. 所有"进度类"数据（BPM、时长）以 Session 为事实来源，Block.current_bpm 是 Session 的派生缓存
4. **本地优先**：云端能力（Auth/Storage/多用户）全部延迟到阶段 B，且通过 Repository/FileStorage 抽象保证届时只换实现不改业务代码

---

## 8. 交互与页面结构（Practice 页基准）

```text
┌───────────────────────────────────────────┐
│ Hotel California — Solo  · Bar 17–24      │
├───────────────────────────────────────────┤
│           五线谱 + Guitar TAB (alphaTab)   │
├───────────────────────────────────────────┤
│ ▶ ⏮ 🔁 Loop  🥁 Metronome                 │
│ BPM 75 [-][+]   Speed 80%                 │
├───────────────────────────────────────────┤
│ Target 90 · Best 82                       │
│ Note: Bend 音准注意                       │
│ [完成本次练习]                             │
└───────────────────────────────────────────┘
```

首页情绪反馈（P1-T-6）：

> 🎸 Today's Practice Complete — 43 min · 4/5 Tasks
> Neon Intro **70 → 75 BPM** · HC Solo New Best **82 BPM**
> Weekly **3h 28m** ↑ 42 min vs last week

---

## 9. 验收标准

### 9.1 功能验收汇总

各模块 Given/When/Then 验收标准见 §5 各小节（共 15 组）。执行测试时逐条勾选。

### 9.2 MVP 端到端验收（唯一硬标准）

> **我能连续使用它练琴 14 天。**

必须完整跑通以下 6 步：

```text
Step 1  上传 Hotel California.gp
Step 2  创建 Practice Block "Solo Bar 17–24"，目标 90 BPM
Step 3  加入今日练习
Step 4  Practice 页：看 TAB / 看五线谱 / 播放 / Loop / 调速度 / 开 Metronome
Step 5  结束记录：18 min · Best 82 BPM · Feeling Good
Step 6  Dashboard 出现 75 → 82 BPM；第二天 Today 再次提示继续练该段落
```

**通过判定：** 14 天内 ≥ 12 天产生有效 Practice Session，且上述链路无断点。

---

## 10. Success Metrics（成功指标）

本产品非商业化，指标以个人使用质量为主：

### Leading（上线 2 周内）
| 指标 | 目标 | 测量 |
|---|---|---|
| 核心闭环激活率（上传→Block→Session 全链走通） | 上线 3 天内完成 | 手动验证 §9.2 Step1-6 |
| 进入练习页到发出第一个音的中位耗时 | ≤ 15 秒 | 主观计时抽查 |
| 日活（自己） | ≥ 6/7 天 | Session 表按日去重 |

### Lagging（上线 1–3 个月）
| 指标 | 目标 | 测量 |
|---|---|---|
| 14 天连续使用 | ≥ 12/14 天 | Session 表 |
| 单 Block BPM 提升 | 典型 Block +10~15 BPM / 月 | BPM Progress 曲线 |
| 曲目状态推进 | ≥ 2 首 Learning → Playable | songs.status 变更记录 |
| 朋友留存 | ≥ 2 位朋友 30 天后仍每周使用 | users + sessions |

---

## 11. 开发阶段（Roadmap）

> Phase 1–4 全程本地运行（localhost，SQLite + 本地文件，无认证）；跑顺后再启动阶段 B 云端迁移。

| Phase | 目标 | 交付物 | 里程碑判定 |
|---|---|---|---|
| **Phase 1 — Player** | GP → 播放 | 项目脚手架 · 上传 GP · alphaTab 显示 · 播放 · Loop · BPM · Metronome | 能看着 TAB 跟着节拍器练一段 |
| **Phase 2 — Practice** | 数据闭环 | Practice Block · Notes · Session · Best BPM · Duration（SQLite 落库） | 可以每天真实使用并留痕 |
| **Phase 3 — Today** | 计划闭环 | Task · 今日计划 · Frequency · Done/Skip · 自动生成 | 产品闭环完成 |
| **Phase 4 — Dashboard** | 进步可视化 | Weekly Time · Streak · BPM Curve · Repertoire Progress · Achievement | MVP 验收（§9.2）启动 |
| **阶段 B — 云迁移**（可选，MVP 验收后评估） | 多设备/多用户 | Supabase Postgres + Storage + Auth，替换 Repository/FileStorage 实现 | 邀请朋友使用 |

### 实施状态（2026-10-01 更新）

Phase 1–4 主体已落地并通过 `tsc --noEmit` 与 `next build`，且在 Chrome 上跑通了 §9.2 的
Step 1–6 全链路（上传 → 解析 → 建 Block → 练习播放 → 记录 → Dashboard 曲线）。

| Phase | 状态 | 备注 |
|---|---|---|
| Phase 1 — Player | ✅ 已实现 | 另加了谱表切换（五线谱+TAB / 仅TAB / 仅五线谱）；P-9 PDF 资料内嵌可查看 |
| Phase 2 — Practice | ✅ 已实现 | 含 P1 的速度训练（B-4/B-5）与 Recommended Start（B-6）；B-7 Auto Trainer 未做（P2） |
| Phase 3 — Today | ✅ 已实现 | 含 K-4 Frequency 自动生成任务（按 ISO 周补齐）；L-5 筛选/搜索已实现 |
| Phase 4 — Dashboard | ✅ 已实现 | 含 D-3 五个 Achievement |
| 阶段 B — 云迁移 | ⬜ 未启动 | 迁移保障（Repository / FileStorage / user_id）已在阶段 A 遵守 |

**尚未验证**：Q5 的 iPad PWA 真机音频解锁；GP 格式（`.gp5/.gpx`）真机文件需自备一份回归。

后续路线（MVP 用满数月后再评估）：P1 扫描谱→MusicXML 草稿 → P2 智能安排 → P3 Spaced Repetition → P4 麦克风辅助。

---

## 12. Open Questions（待决问题）

| # | 问题 | 归属 | 阻塞性 |
|---|---|---|---|
| ~~Q1~~ | ~~后端选 Supabase 还是托管云服务~~ **已决策（2026-10-01）：本地优先**——阶段 A 用 SQLite + 本地文件 + 无认证，跑顺后阶段 B 迁移 Supabase，详见 §7.0 | Owner | ✅ 已解决 |
| ~~Q2~~ | ~~alphaTab 的 GP 解析在浏览器端还是服务端做~~ **已决策（2026-10-01）：浏览器端**。上传只做校验+落盘+建 Song；页面用 alphaTab 直接 fetch 文件 URL 解析，`scoreLoaded` 后回填曲名/艺术家/轨道/小节数。理由：服务端解析需引入完整 alphaTab 运行时，而浏览器端解析产物正好是 UI 需要的形状 | 技术 | ✅ 已解决 |
| ~~Q3~~ | ~~自动提取失败时的默认值策略~~ **已决策（2026-10-01）**：上传时 Title 缺省用文件名（去扩展名）；浏览器端解析出谱面元信息后，若与 Song 记录不一致，在曲目详情页给一次性「用谱面信息更新」入口，**不静默覆盖**用户填写 | 技术 | ✅ 已解决 |
| Q4 | "延后到明天"是否有上限（防止无限顺延）？建议：顺延 2 次后标红提示 | Owner | 非阻塞，Phase 3 前定。**当前实现**：`practice_tasks.deferred_count` 已落库，≥2 时任务卡标红提示，暂不强制阻断 |
| Q5 | iPad PWA 下 alphaTab 音频播放（iOS AudioContext 解锁策略）需真机验证 | 技术 | 非阻塞。**当前实现**：练习页首次点播放时 `await audioContext.resume()` 解锁；播放模式用 `PlayerOutputMode.WebAudioAudioWorklets`。仍需真机复核 |
| ~~Q6~~ | ~~时区处理~~ **已决策（2026-10-01）**：`created_at` 等时间戳存 UTC 毫秒；`practice_tasks.date` / `practice_sessions.date` 存 `'YYYY-MM-DD'`，由**前端按本地时区**计算后传入，保证 Streak 与每日分组正确 | 技术 | ✅ 已解决 |

---

## 13. Scope 管理约定

1. 任何新增需求必须：删除等量需求，或明确接受时间线延后；
2. v1 / v2 边界以本 Spec §3 Non-Goals 和 P0/P1 标注为准；
3. 若某个技术调研超过 2 天未果（如 Q5 音频问题），降级或砍掉该子项；
4. 好想法统一进 parking lot（§11 后续路线），不进 v1。

---

---

## 14. 增量需求：专辑 / 整曲播放 / Creator（执行说明）

> Version: 1.1 | Date: 2026-10-01 | Status: **已实现**（分支 `feature/creator-library-player`）
>
> 本节记录原始 Spec 之外的一轮增量。行为以 [README](../README.md) 和 [DEVELOPMENT.md](DEVELOPMENT.md) 为准。

### 14.1 三条工作流的边界

| # | 需求 | 关键点 | 明确不做 |
|---|---|---|---|
| A | **Library 专辑管理** | `曲库 → 专辑 → 曲目` 只支持一层；专辑与教材（books）正交，可同时挂在同一个曲目上；删除专辑保留曲目（`ON DELETE SET NULL`） | 无限层级、封面、分享、拖拽排序、播放列表、智能专辑 |
| B | **整曲播放** | 有 GP / MusicXML 即可 `/play/<songId>`；不创建隐形 Practice Block、不产生 Practice Session、不影响 BPM 进度与 Streak | 自动算练习时长、自动形成 Session、自动建 Block |
| C | **Creator OMR MVP** | 截图/图片 → OMR → MusicXML → alphaTab 预览 → 下载 → Guitar Pro 校正；Python 是**可选** sidecar | TAB 专用 OCR、PDF/整本识别、MusicXML 编辑器、GP 写入、云端模型 |

### 14.2 不可破坏的约束

1. Guitar Road Core 只依赖 Node.js；`npm install && npm run build && npm run start` 必须成立。
2. 没有 Python / homr / OpenCV / PyTorch 时：Today、Library、Dashboard、Practice、Song Player 全部正常，Creator 显示「识别引擎未安装」。
3. `homr` 不进入 Node 依赖树；OMR 依赖不写入 `package.json`。
4. 数据库迁移只增不改：禁止 DROP TABLE、禁止要求用户删库，现有数据必须完整保留。
5. 调用 Python 一律 `spawn(command, args)`，**禁止**把用户文件名拼进 shell 命令。

### 14.3 代码复用目标

```text
                 ScorePlayer
                /     |      \
         Song Player  Practice  Creator
```

`src/components/player/score-player.tsx` 是唯一的 alphaTab 初始化入口。
练习业务（BPM 训练、Loop、节拍器、Session）留在 `practice-client.tsx`，不下沉进播放器。

### 14.4 尚未验证 / 后续候选

- **C-4 业务价值未验证**：8–16 小节练习的「人工修正 ≤ 3 分钟」是 benchmark，需要 10–20 个真实样本跑过再判断。若 homr 整体效果不好，先提交 benchmark 结果，再决定是否评估 Audiveris 或自研模型——不要在 benchmark 前扩大 UI scope。
- Creator 阶段一不写数据库；确认识别效果后再考虑「加入 Guitar Road」。
- 整曲播放的 P2 候选：任意小节 Loop、节拍器、AB 重复、临时 BPM —— 仍然不记为练习 Session。

---

*本 Spec 基于用户 PRD v1 整理，评审通过后进入 Phase 1 开发。*
