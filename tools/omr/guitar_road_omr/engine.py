"""OMR 引擎抽象层。

业务层（Next.js / Creator UI）**不得**直接依赖 homr 的 API。
后续若要接入 Audiveris 或自研引擎，只要再实现一个 OmrEngine 子类即可，
Node 侧与 UI 完全不用改（SPEC §4.5 / §4.8）。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path


class OmrError(RuntimeError):
    """识别过程中的可预期错误（输入非法、引擎崩溃、输出缺失等）。"""


class OmrUnavailableError(OmrError):
    """引擎未安装 / 不可用。调用方应据此在 UI 上提示「识别引擎未安装」。"""


@dataclass
class RecognitionResult:
    """一次识别的结果。"""

    ok: bool
    output_path: Path | None
    engine: str
    warnings: list[str] = field(default_factory=list)

    def to_json_dict(self) -> dict:
        return {
            "ok": self.ok,
            "output": str(self.output_path) if self.output_path else None,
            "engine": self.engine,
            "warnings": self.warnings,
        }


@dataclass
class EngineStatus:
    """引擎可用性探测结果，供 Creator 页面展示（SPEC §4.11 / §4.12）。"""

    available: bool
    engine: str | None = None
    message: str | None = None
    #: 实际可用的推理设备：`cuda` / `cpu`。UI 不做 GPU 配置，这里只用于状态展示。
    device: str | None = None

    def to_json_dict(self) -> dict:
        return {
            "available": self.available,
            "engine": self.engine,
            "message": self.message,
            "device": self.device,
        }


class OmrEngine(ABC):
    """引擎接口。实现必须是纯函数式的：图片进，MusicXML 出。"""

    #: 引擎标识，会写进 CLI 的 JSON 输出里
    name: str = "unknown"

    @abstractmethod
    def status(self) -> EngineStatus:
        """探测引擎是否可用。不应下载模型，也不应做重计算。"""

    @abstractmethod
    def recognize(self, input_path: Path, output_path: Path) -> RecognitionResult:
        """把 `input_path` 的乐谱图片识别为 `output_path` 的 MusicXML。

        失败时抛 `OmrError`（引擎缺失抛 `OmrUnavailableError`）。
        """
