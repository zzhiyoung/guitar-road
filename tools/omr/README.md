# Guitar Road OMR sidecar

把乐谱截图识别成 MusicXML，供 **Guitar Road Creator** 预览与下载。

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

**homr 只读五线谱，不读 TAB。** 截图里同时有五线谱和 TAB 时，TAB 会被忽略 —— 这与
SPEC 的定位一致：识别出的是草稿，指法与把位仍需在 Guitar Pro 里补。

homr 会在输入图片旁边生成 `<名字>_teaser.png` 可视化图；`tools/omr` 的适配器只在
受控临时目录里运行，Node 层任务结束后整目录清理，不会污染用户目录。

## 7. 已知限制（v0.1）

- 只做「图片 → MusicXML 草稿」，**不做修谱**。复杂校对继续用 Guitar Pro。
- 不支持 PDF、整本教材、批量识别、拍照透视矫正。
- 截图建议先用 `Win + Shift + S` 裁到 4–16 小节，成功率明显更高。
- homr 主要覆盖高低音谱号的音高与节奏；力度、演奏法、重升重降等可能丢失。

官方仓库与许可证：<https://github.com/liebharc/homr>
