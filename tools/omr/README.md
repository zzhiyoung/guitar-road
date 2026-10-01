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

### 1.4 验证

```bash
python -m guitar_road_omr status
```

可用时 stdout 最后一行：

```json
{"available": true, "engine": "homr", "message": "homr 已就绪"}
```

缺失时退出码为 `2`：

```json
{"available": false, "engine": null, "message": "未检测到 homr。请参考 tools/omr/README.md 安装识别引擎。"}
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

## 3. 环境变量

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

## 4. 为什么 homr 没有 `--output`

homr 的 CLI 只接受一个位置参数（图片或目录），产物固定写在
**输入文件同目录、同名、`.musicxml`**。因此适配器会在受控目录里调用它，
再把产物移动到 `--output` 指定的位置。

---

## 5. 已知限制（v0.1）

- 只做「图片 → MusicXML 草稿」，**不做修谱**。复杂校对继续用 Guitar Pro。
- 不支持 PDF、整本教材、批量识别、拍照透视矫正。
- 截图建议先用 `Win + Shift + S` 裁到 4–16 小节，成功率明显更高。
- homr 主要覆盖高低音谱号的音高与节奏；力度、演奏法、重升重降等可能丢失。

官方仓库与许可证：<https://github.com/liebharc/homr>
