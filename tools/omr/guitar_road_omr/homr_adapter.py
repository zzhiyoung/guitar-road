"""homr 引擎适配器。

homr 的 CLI 形态（SPEC §4.5）：

    homr <image>            # 结果写到「输入文件同目录 / 同名 .musicxml」

它**没有** `--output` 参数，所以这里：
1. 在受控的工作目录里调用 homr；
2. 按「同目录 + 同名 + .musicxml/.xml/.mxl」定位产物；
3. 移动到调用方指定的 `--output` 路径。

用法与安装说明见 ../README.md。
"""

from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

from .engine import (
    EngineStatus,
    OmrEngine,
    OmrError,
    OmrUnavailableError,
    RecognitionResult,
)

#: homr 会写出的候选产物后缀（按优先级）
OUTPUT_SUFFIXES = (".musicxml", ".xml", ".mxl")

DEFAULT_TIMEOUT_SECONDS = 120

#: 允许用环境变量覆盖调用方式，便于 uvx / poetry / conda 等安装形态：
#:   GUITAR_ROAD_HOMR_CMD='["uvx", "--from", "homr[cpu]", "homr"]'
COMMAND_OVERRIDE_ENV = "GUITAR_ROAD_HOMR_CMD"

#: 额外透传给 homr 的参数（JSON 数组）
EXTRA_ARGS_ENV = "GUITAR_ROAD_HOMR_ARGS"

#: 推理设备：`auto` / `cpu` / `cuda`（默认 auto）
DEVICE_ENV = "GUITAR_ROAD_OMR_DEVICE"

DeviceMode = str  # "auto" | "cpu" | "cuda"

#: 我们的设备名 → homr 的 `--gpu` 取值
_GPU_ARG: dict[str, str] = {"auto": "auto", "cpu": "no", "cuda": "force"}

# `python -c` 的兜底启动器：homr 没有 __main__.py 时也能跑
_FALLBACK_RUNNER = (
    "import sys;from homr.main import main;sys.argv=['homr']+sys.argv[1:];main()"
)


def _log(message: str) -> None:
    """人可读日志走 stderr —— stdout 最后一行必须是机器可读 JSON。"""
    print(message, file=sys.stderr, flush=True)


def _resolve_command() -> list[str] | None:
    """按「环境变量 → PATH → 当前解释器」的顺序解析 homr 的调用方式。"""
    raw = os.environ.get(COMMAND_OVERRIDE_ENV, "").strip()
    if raw:
        try:
            parsed: object = json.loads(raw)
        except json.JSONDecodeError:
            # 允许写成一行 shell（带引号），用 shlex 安全拆分
            parsed = shlex.split(raw)
        if isinstance(parsed, list) and all(isinstance(x, str) for x in parsed):
            return list(parsed)
        _log(f"[omr] 忽略非法的 {COMMAND_OVERRIDE_ENV}")

    # 先看当前解释器同目录（venv/Scripts、venv/bin）——
    # 用 venv 的 python 调用时，homr 的 console script 通常不在 PATH 上。
    exe_dir = Path(sys.executable).parent
    for name in ("homr.exe", "homr"):
        candidate = exe_dir / name
        if candidate.is_file():
            return [str(candidate)]

    which = shutil.which("homr")
    if which:
        return [which]

    # 没有 console script 时，尝试在当前解释器里 import homr.main
    probe = subprocess.run(
        [sys.executable, "-c", "import homr.main"],
        capture_output=True,
    )
    if probe.returncode == 0:
        return [sys.executable, "-c", _FALLBACK_RUNNER]

    return None


_device_cache: str | None = None


def _cuda_runtime_present() -> bool:
    """CUDA 运行时是否真的装齐。

    这里**故意不去建 InferenceSession**：实测在本机（装了 onnxruntime-gpu 但缺
    CUDA 13 / cuDNN 9 运行时）时，初始化 CUDA provider 会**把整个 Python 进程带崩**
    （exit -1，且时好时坏）。`status` 是每次打开 Creator 都要跑的，绝不能崩，
    所以改成检查 `nvidia-*-cu*` pip 包是否落地。
    """
    try:
        import onnxruntime as ort

        if "CUDAExecutionProvider" not in ort.get_available_providers():
            return False

        site_packages = Path(ort.__file__).parent.parent
        nvidia = site_packages / "nvidia"
        if not nvidia.is_dir():
            return False

        installed = {p.name.lower() for p in nvidia.iterdir() if p.is_dir()}
        # ORT 的 CUDA provider 至少依赖这几组运行时
        return all(
            any(key in name for name in installed)
            for key in ("cublas", "cudnn", "cuda_runtime", "nvrtc")
        )
    except Exception:  # noqa: BLE001
        return False


def _detect_device() -> str:
    """当前实际可用的推理设备：`cuda` 或 `cpu`。"""
    global _device_cache
    if _device_cache is None:
        _device_cache = "cuda" if _cuda_runtime_present() else "cpu"
    return _device_cache


class HomrEngine(OmrEngine):
    name = "homr"

    def __init__(
        self,
        timeout: int = DEFAULT_TIMEOUT_SECONDS,
        device: DeviceMode = "auto",
    ) -> None:
        self.timeout = timeout
        self.device = device if device in _GPU_ARG else "auto"
        self._command: list[str] | None = None

    # ------------------------------------------------------------------
    # 可用性探测
    # ------------------------------------------------------------------
    def status(self) -> EngineStatus:
        command = _resolve_command()
        if command is None:
            return EngineStatus(
                available=False,
                engine=None,
                message="未检测到 homr。请参考 tools/omr/README.md 安装识别引擎。",
            )
        self._command = command

        runtime = _detect_device()
        # cpu 模式下显式说明，避免用户以为 GPU 没生效是 bug
        using = "cuda" if (self.device != "cpu" and runtime == "cuda") else "cpu"
        suffix = "（GPU）" if using == "cuda" else "（CPU）"
        return EngineStatus(
            available=True,
            engine=self.name,
            message=f"homr 已就绪{suffix}",
            device=using,
        )

    # ------------------------------------------------------------------
    # 识别
    # ------------------------------------------------------------------
    def recognize(self, input_path: Path, output_path: Path) -> RecognitionResult:
        # 必须用绝对路径：下面把 cwd 切到输入所在目录，相对路径会相对它解析而失效
        input_path = Path(input_path).resolve()
        output_path = Path(output_path).resolve()

        if not input_path.is_file():
            raise OmrError(f"输入文件不存在：{input_path}")

        command = self._command or _resolve_command()
        if command is None:
            raise OmrUnavailableError(
                "未检测到 homr。请参考 tools/omr/README.md 安装识别引擎。"
            )

        # homr 把结果写在输入文件旁边，因此必须在受控目录里跑：
        # 调用方（Node 层）每次任务都会给一个独立 temp 目录。
        workdir = input_path.parent
        produced_before = set(workdir.iterdir())

        # 不默认塞 --gpu / --debug 等可选参数：不同 homr 版本参数集合不同，
        # 需要时通过 GUITAR_ROAD_HOMR_ARGS 透传（README 有示例）。
        args = [*command, *self._device_args(), *self._extra_args(), str(input_path)]
        _log(f"[omr] 执行：{' '.join(args)}")

        try:
            completed = subprocess.run(
                args,
                cwd=str(workdir),
                capture_output=True,
                text=True,
                timeout=self.timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise OmrError(
                f"识别超时（>{self.timeout}s）。请裁剪更小的乐谱区域后重试。"
            ) from exc
        except FileNotFoundError as exc:
            raise OmrUnavailableError(
                f"无法执行识别引擎：{command[0]}"
            ) from exc

        if completed.stdout:
            _log(completed.stdout.strip())
        if completed.stderr:
            _log(completed.stderr.strip())

        if completed.returncode != 0:
            tail = (completed.stderr or completed.stdout or "").strip()[-500:]
            raise OmrError(
                f"homr 退出码 {completed.returncode}"
                + (f"：{tail}" if tail else "")
            )

        found = self._locate_output(input_path, produced_before)
        if found is None:
            raise OmrError(
                "homr 已执行但没有生成 MusicXML 文件，请换一张更清晰的乐谱截图。"
            )

        output_path.parent.mkdir(parents=True, exist_ok=True)
        if found.resolve() != output_path.resolve():
            shutil.move(str(found), str(output_path))

        if output_path.stat().st_size == 0:
            raise OmrError("生成的 MusicXML 为空文件。")

        return RecognitionResult(
            ok=True,
            output_path=output_path,
            engine=self.name,
            warnings=["自动识别结果仅供参考，请用 Guitar Pro 校正后再练习。"],
        )

    # ------------------------------------------------------------------
    def _extra_args(self) -> list[str]:
        raw = os.environ.get(EXTRA_ARGS_ENV, "").strip()
        args: list[str] = []
        if raw:
            try:
                parsed: object = json.loads(raw)
            except json.JSONDecodeError:
                parsed = shlex.split(raw)
            if isinstance(parsed, list):
                args = [str(x) for x in parsed]

        # --gpu 由 --device 统一管理，避免两处配置打架
        if "--gpu" in args:
            index = args.index("--gpu")
            args = args[:index] + args[index + 2 :]

        return args

    def _device_args(self) -> list[str]:
        if self.device == "auto":
            # homr 自己的 `cuda_available()` 只看 provider 名单，缺运行时时会误判为有 GPU，
            # 然后去拉 fp16 模型并初始化 CUDA —— 本机实测可能直接崩进程。
            # 所以 auto 由我们拍板：运行时没装齐就明确走 CPU。
            return ["--gpu", "auto" if _detect_device() == "cuda" else "no"]
        return ["--gpu", _GPU_ARG[self.device]]

    @staticmethod
    def _locate_output(
        input_path: Path, previously: set[Path]
    ) -> Path | None:
        """homr 产物 = 输入同目录 + 同名 + .musicxml（也可能是 .xml / .mxl）。"""
        workdir = input_path.parent
        stem = input_path.stem

        for suffix in OUTPUT_SUFFIXES:
            candidate = workdir / f"{stem}{suffix}"
            if candidate.is_file():
                return candidate

        # 兜底：找本次新出现的乐谱文件
        for path in sorted(workdir.iterdir()):
            if path in previously or not path.is_file():
                continue
            if path.suffix.lower() in OUTPUT_SUFFIXES:
                return path
        return None
