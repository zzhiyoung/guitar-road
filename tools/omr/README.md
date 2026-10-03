# Guitar Road OMR sidecar

把乐谱截图识别成 MusicXML 草稿，供 **Guitar Road Creator** 预览与下载。

> **Creator 整体是实验测试功能。** 仅验证了有限样本，尚未完成真实乐谱泛化与设备验收，不保证音高、节奏、弦号或品位的准确性。请用 Guitar Pro 人工校对后再导入曲库；此状态适用于所有识别模式。

> **这是可选能力。** Guitar Road 主程序（Next.js）只依赖 Node.js。
> 没有 Python / homr / PyTorch 时，`npm install && npm run build && npm run start`
> 依旧可用，Today / Library / Dashboard / Practice / Song Player 全部正常，
> Creator 页面会显示「识别引擎未安装」。

架构：

```text
Guitar Road / Next.js
        │  spawn（不走 shell）
        ▼
tools/omr  →  python -m guitar_road_omr
        │
        ▼
homr  →  MusicXML
```

---

## 1. 安装（可选）

### 1.1 Python

需要 Python 3.10+（homr 官方支持 3.10 / 3.11 / 3.12）。

### 1.2 安装 wrapper

```bash
cd tools/omr
pip install -e .
```

### 1.3 安装识别引擎（homr）

推荐用 `uvx`，不需要克隆仓库：

```bash
# CPU
uvx --from 'homr[cpu]' homr --help

# NVIDIA CUDA
uvx --from 'homr[cuda]' homr --help
```

或者装进当前环境：

```bash
pip install 'homr[cpu]'
```

首次运行会自动下载 ONNX 模型（约 190 MB）。

### 1.4 推荐：仓库内的独立 venv

不要把 homr 装进系统 Python，也不要让它进 `package.json`。推荐建一个专属 venv：

```bash
cd tools/omr

# 用 Python 3.10 / 3.11 / 3.12（homr 不支持 3.13+）
py -V:Astral/CPython3.12.14 -m venv .venv     # 或 python3.12 -m venv .venv

# 构建后端要先备好：homr 的依赖 antlr4-python3-runtime 是 sdist，需要现场构建
.venv/Scripts/python -m pip install setuptools wheel poetry-core

# 装 wrapper
.venv/Scripts/python -m pip install -e .

# 装识别引擎（国内建议加镜像；官方 PyPI 也可，只是慢）
.venv/Scripts/python -m pip install "homr[cpu]" \
  -i https://pypi.tuna.tsinghua.edu.cn/simple \
  --extra-index-url https://pypi.org/simple \
  --no-build-isolation
```

然后在项目根目录的 `.env.local` 里指向这个解释器，Creator 才能找到它：

```
GUITAR_ROAD_OMR_PYTHON=D:/coding/Guitar Road/tools/omr/.venv/Scripts/python.exe
```

> `--no-build-isolation` 是必需的：homr 及其部分依赖是 poetry/sdist 包，构建隔离环境里
> 常常拉不到 `setuptools`，会报
> `Could not find a version that satisfies the requirement setuptools>=40.8.0`。
> 关掉隔离后，上面预装的构建后端就会被复用。

### 1.5 预下载模型（国内强烈建议）

homr 首次运行会从 **GitHub Releases** 拉 3 个 ONNX 模型（约 140 MB）。国内直连常常只有
每秒几十 KB，会慢到不可用。用 GitHub 加速镜像手动放到位最快：

```bash
cd tools/omr
BASE="https://gh-proxy.com/https://github.com/liebharc/homr/releases/download/onnx_checkpoints"
SP=.venv/Lib/site-packages/homr

mkdir -p .models
for n in segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f \
         encoder_pytorch_model_396-f6feedb42ff90087d898b0941a55d040fa6b2903 \
         decoder_pytorch_model_396-f6feedb42ff90087d898b0941a55d040fa6b2903; do
  curl -L -o ".models/$n.zip" "$BASE/$n.zip"
done

.venv/Scripts/python -c "
import zipfile, pathlib
sp = pathlib.Path('.venv/Lib/site-packages/homr')
mapping = {
  'segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f.zip': sp/'segmentation',
  'encoder_pytorch_model_396-f6feedb42ff90087d898b0941a55d040fa6b2903.zip': sp/'transformer',
  'decoder_pytorch_model_396-f6feedb42ff90087d898b0941a55d040fa6b2903.zip': sp/'transformer',
}
for name, dest in mapping.items():
    with zipfile.ZipFile(pathlib.Path('.models')/name) as z:
        z.extractall(dest)
"
rm -rf .models
```

模型文件是 homr 版本绑定的；升级 homr 后需要按新版本的文件名重新下载。
也可以直接跑 `homr --init` 让它自己下，只是慢。

### 1.6 验证

```bash
.venv/Scripts/python -m guitar_road_omr status
```

可用时 stdout 最后一行：

```json
{"available": true, "engine": "homr", "message": "homr 已就绪"}
```

缺失时退出码为 `2`：

```json
{"available": false, "engine": null, "message": "未检测到 homr。请参考 tools/omr/README.md 安装识别引擎。"}
```

也可以直接识别一张图，确认端到端可用：

```bash
.venv/Scripts/python -m guitar_road_omr recognize sheet.png --output sheet.musicxml
```

---

## 2. CLI 契约（Node 层唯一依赖）

```text
python -m guitar_road_omr recognize <input.png> --output <output.musicxml>
```

- **成功**：exit code `0`，stdout **最后一行**为

  ```json
  {"ok": true, "output": "output.musicxml", "engine": "homr", "warnings": []}
  ```

- **失败**：exit code != `0`，stdout 最后一行

  ```json
  {"ok": false, "error": "..."}
  ```

- 人类可读日志一律写 stderr。
- `2` = 引擎未安装；`1` = 其它错误。

可选参数：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--engine` | `homr` | 引擎名，未来可切换 Audiveris 等 |
| `--timeout` | `120` | 子进程超时秒数 |

---

## 3. 推理设备（CPU / CUDA）

`recognize` 与 `status` 都支持 `--device`：

| 取值 | 含义 | 映射到 homr |
|---|---|---|
| `auto` | 有 CUDA 就用，否则 CPU（**默认**） | `--gpu auto` |
| `cpu` | 强制 CPU | `--gpu no` |
| `cuda` | 强制 GPU（没装好 CUDA 运行时会报错） | `--gpu force` |

```bash
.venv/Scripts/python -m guitar_road_omr status --device auto
# {"available":true,"engine":"homr","message":"homr 已就绪（CPU）","device":"cpu"}

GUITAR_ROAD_OMR_DEVICE=cpu .venv/Scripts/python -m guitar_road_omr recognize a.png --output a.musicxml
```

也可以用环境变量 `GUITAR_ROAD_OMR_DEVICE` 设默认值。
`GUITAR_ROAD_HOMR_ARGS` 里如果带了 `--gpu`，会被 `--device` 覆盖（避免两处配置打架）。

### 3.1 CPU 还是 CUDA：先看清瓶颈

在 Intel CPU + RTX 3070 上，用一张 1169×566、9 小节（3 个 staff）的谱面实测：

| 阶段 | 耗时 | 占比 |
| --- | --- | --- |
| Python 启动 + `import homr.main` | ~2.9 s | 30% |
| 图像预处理 / 五线谱定位 / dewarp / 写 XML | ~3.5 s | 36% |
| **模型推理**（segnet ~1.0–1.6 s + TrOmr 3×~0.6 s） | ~3.4 s | 35% |
| **合计** | **约 9.6 s** | |

也就是说：**推理只占三分之一，剩下是进程启动和模型加载。** 换 GPU 只能加速推理那一块：

- 9 小节这类小片段：推理 3.4 s → 约 0.7–1.1 s，**总耗时 ~9.6 s → ~7 s，只快 25% 左右**。
- 整页 / 多 staff 的谱子：推理随 staff 数量线性增长，GPU 收益会明显变大。

所以默认选 CPU 不是偷懒，而是**投入产出比**：为这 25% 要额外下载 2–3 GB 的 CUDA/cuDNN 运行时。

### 3.2 想用 CUDA 就自己开（可选）

onnxruntime-gpu 已经装好了，缺的是 NVIDIA 运行时（ORT 1.30 要求 **CUDA 13 + cuDNN 9**）：

```bash
# 约 2–3 GB，装完 --device cuda 即可生效
PYTHONPATH="" .venv/Scripts/python -m pip install "onnxruntime-gpu[cuda]==1.30.0" \
  -i https://mirrors.aliyun.com/pypi/simple/ --timeout 60 --retries 5

# GPU 模式用的是 fp16 模型，需要额外下载 3 个权重文件（见 §1.5，文件名带 _fp16）
.venv/Scripts/python -m guitar_road_omr status --device cuda
```

装不了 / 出问题就退回 CPU，功能完全不受影响：

```bash
.venv/Scripts/python -m guitar_road_omr recognize a.png --output a.musicxml --device cpu
```

> 注意：`pip install` 时如果遇到
> `SAFE_DELETE_BULK_CONFIRM_REQUIRED` 之类的拦截，是本机 Python shim 造成的，
> 加 `PYTHONPATH=""` 再跑一次即可（pip 卸载旧包时会触发）。

## 4. 环境变量

| 变量 | 用途 |
| --- | --- |
| `GUITAR_ROAD_HOMR_CMD` | 覆盖 homr 的调用方式（JSON 数组） |
| `GUITAR_ROAD_HOMR_ARGS` | 额外透传给 homr 的参数（JSON 数组） |

例如用 `uvx` 跑 CPU 版本：

```bash
export GUITAR_ROAD_HOMR_CMD='["uvx", "--from", "homr[cpu]", "homr"]'
```

强制 CPU（部分 homr 版本支持）：

```bash
export GUITAR_ROAD_HOMR_ARGS='["--gpu", "no"]'
```

---

## 5. 为什么 homr 没有 `--output`

homr 的 CLI 只接受一个位置参数（图片或目录），产物固定写在
**输入文件同目录、同名、`.musicxml`**。因此适配器会在受控目录里调用它，
再把产物移动到 `--output` 指定的位置。

---

## 6. 实测记录（CPU，Windows）

用一张 1169×566 的谱面截图（五线谱 + TAB，9 小节）实测：

| 项目 | 结果 |
| --- | --- |
| 端到端耗时 | 约 10 秒（含 Node 起子进程 + 模型加载） |
| 输出 | 14.8 KB MusicXML，10 小节 / 51 个音高音符 |
| 结论 | 五线谱部分可用作草稿 |

**现有 homr 接入不具备 TAB 弦号/品位识别能力。** 五线谱与 TAB 混排时，TAB 还可能被
误识别为额外声部，不能假定它会被安全忽略。当前 Creator 的识别结果仍是草稿。
这是早期 homr 全图路径的实测。当前 Creator 默认自动模式先隔离组合谱，实验性 TAB 融合见下节；不可靠的对齐会明确失败。

homr 会在输入图片旁边生成 `<名字>_teaser.png` 可视化图；`tools/omr` 的适配器只在
受控临时目录里运行，Node 层任务结束后整目录清理，不会污染用户目录。

## 7. 已知限制（v0.1）

- 只做「图片 → MusicXML 草稿」，**不做修谱**。复杂校对继续用 Guitar Pro。
- 不支持 PDF、整本教材、批量识别、拍照透视矫正。
- 截图建议先用 `Win + Shift + S` 裁到 4–16 小节，成功率明显更高。
- homr 主要覆盖高低音谱号的音高与节奏；力度、演奏法、重升重降等可能丢失。

官方仓库与许可证：<https://github.com/liebharc/homr>

## 8. 实验性 TAB 工具与 Creator 集成（2026-10-02）

Creator 已提供自动、五线谱＋TAB、仅五线谱三种模式，并支持谱表切换、试听/暂停/停止、下载及逐条质量警告。组合谱使用同一 Python 环境中的 **homr 0.7.0** 和可选 RapidOCR 3.9.2；数字模型必须放在该环境 `rapidocr/models` 下，文件名见下文。`uvx` 单独提供的 homr 仍可用于旧 CLI 全图路径，但不足以运行此组合谱适配器。

下载使用无状态 HTTP 附件接口，支持中文文件名；识别稿从客户端直接提交用于导出，不保存到数据库或曲库。原创四音小样本的浏览器落盘检查已通过。

```powershell
# 在独立 venv 中准备可选依赖，不涉及 Node 核心应用
.venv/Scripts/python -m pip install -e '.[homr,tab]'
.venv/Scripts/python -m guitar_road_omr recognize sample.png `
  --mode standard-tab --output C:/tmp/my-omr-check/draft.musicxml
```

`recognize --mode auto|standard-tab|standard` 是新 pipeline；不传 `--mode` 时保留旧 CLI 行为。默认 API 使用 auto。所有位置和事件须在同一系统、小节内通过唯一横向匹配与时值完整性检查；未知数字、额外拍号候选、数量不一致或不支持的和弦/倚音/连音/延音会拒绝合并。支持标准 EADGBE、无变调夹的清晰单音组合谱，其他奏法/文字指法不保留；纯 TAB 不支持。五线谱与 TAB 音高冲突时草稿采用 TAB，并展示待核对信息。结果是单吉他声部，避免重复播放。

“仅五线谱”对组合谱先隔离六线谱；没有原 TAB 技术标记。识别结果、拍号、时值和速度均需用户校对。Node 限制单次识别时间，子进程在剩余时限内退出；检查状态不会下载数字模型。

新增的 `inspect-tab` 是独立 CLI：自动定位印刷体五线谱/六线谱组合，输出 TAB 的弦号、
品位、位置和待核对事件，并可保留诊断图。它**不提供节奏、不生成 MusicXML、不写数据库**。
现有 `status` 和不带 `--mode` 的 `recognize` 维持旧 CLI 行为；Creator 默认入口使用新模式。

依赖全部可选。原型验证环境为 Python 3.12、RapidOCR 3.9.2、CPU ONNX Runtime；
`pip install -e '.[tab]'` 是新建独立测试环境时的可选安装项，本轮没有安装或升级主环境依赖。
原型使用已有本地模型，不会在检查过程中自动下载模型。通过 `--models` 指向包含以下文件的目录：

- `PP-OCRv6_det_small.onnx`
- `PP-OCRv6_rec_small.onnx`
- `ch_ppocr_mobile_v2.0_cls_mobile.onnx`

```powershell
# 在 tools/omr 中执行，路径用自己的独立本地目录
.venv/Scripts/python -m guitar_road_omr inspect-tab sample.png `
  --output C:/tmp/my-omr-check/tab.json `
  --models C:/tmp/my-omr-models `
  --diagnostics C:/tmp/my-omr-check/diagnostics
```

stdout 最后一行是 JSON，带 `experimental: true`、事件数量、`needsReview` 和 warnings。
`ok: true` 表示检查命令完成，不代表 TAB 或草稿已验收。JSON 记录每个事件的候选和来源；
冲突或未知数字不补成 0 品。OCR 分数不是校准后的正确率。

当前仅验证了三张同类教材片段的 48 个弦号/品位事件，与先前的人工候选标注一致。
小节归属各为 8+8 个事件；未做独立教材泛化评测或用户独立复核。
本轮字形检查改进后，Arial、Times 与 Segoe UI 各为 16/16，旧教材基线仍为 48/48。
新增扫描图的 24 个音乐事件可读，但另有一个疑似 C 拍号的未知事件，因此完整样本未通过，P2 尚未验收。
已参与调试的图片和字体不作为留出集成绩；详细记录见 [开发进展](../../docs/CREATOR_OMR_PROGRESS.md)。
纯 TAB、无符干 TAB、和弦、特殊奏法、明显倾斜及过稀/密的谱线不在已验证范围。
原型的谱线间距检测范围为 4–26 像素，最多 8 个系统、每系统 128 个候选事件。
输入上限为 20 MB / 2000 万像素。
工具尝试根据长谱线纠正小幅统一倾斜，不处理透视或页面弯曲。诊断图与 bbox/x 坐标均使用
分析图坐标；JSON `image_geometry` 提供与原图的双向矩阵变换。原图不被覆盖。
运行中会用最多两个 OCR CPU 线程；命令本身没有服务级超时，自动化调用时应由父进程限时。

```powershell
cd tools/omr
.venv/Scripts/python -B -m unittest discover -s tests -v
# 从项目根运行，验证当前 alphaTab 的原弦/品位、记谱八度和实际 MIDI 音符
node tools/omr/tests/check_musicxml.mjs
```

可选真实 OCR 检查使用原创合成图和自己准备的本地字体文件，不打包字体或权重。
从 `tools/omr` 执行，`PYTHONPATH` 指向该目录：

```powershell
$env:PYTHONPATH = (Get-Location).Path
.venv/Scripts/python -B tests/check_ocr.py --models C:/tmp/my-omr-models `
  --output C:/tmp/my-omr-check/fonts --font C:/Windows/Fonts/arial.ttf `
  --font C:/Windows/Fonts/times.ttf --font C:/Windows/Fonts/segoeui.ttf
```

每个字体检查 16 个事件，漏检、未知、错弦/品位、小节错误或重复均不能算作通过。
当前三种字体检查均通过；历史失败结果保留。新增字体或真实扫描图仍须独立检查，不能推定通过。

`tests/fixtures/guitar-technical.musicxml` 是原创兼容性小样本，可用于 Guitar Pro 导入验收。
alphaTab 模型和 MIDI 检查已通过；用户已确认该四音 fixture 的 Guitar Pro 8 检查可用。
新识别文件的 Guitar Pro 导入及真实设备试听仍需用户验收。
Creator 已对组合谱导入启用五线显示适配；浏览器显示切换和播放控件已检查，不能代替真实设备试听验收。
真实教材图片、模型和识别输出不得放进 Git；诊断目录应放在独立本地目录。
