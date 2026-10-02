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

#: 额外透传给 homr 的参数（JSON 数组），例如 GPU 选择：
#:   GUITAR_ROAD_HOMR_ARGS='["--gpu", "no"]'
EXTRA_ARGS_ENV = "GUITAR_ROAD_HOMR_ARGS"

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


class HomrEngine(OmrEngine):
    name = "homr"

    def __init__(self, timeout: int = DEFAULT_TIMEOUT_SECONDS) -> None:
        self.timeout = timeout
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
        return EngineStatus(
            available=True,
            engine=self.name,
            message="homr 已就绪",
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
        args = [*command, *self._extra_args(), str(input_path)]
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
    @staticmethod
    def _extra_args() -> list[str]:
        raw = os.environ.get(EXTRA_ARGS_ENV, "").strip()
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return raw.split()
        return [str(x) for x in parsed] if isinstance(parsed, list) else []

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
