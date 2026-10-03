"""Guitar Road Creator 的可选 OMR wrapper。

本包是 **可选 sidecar**：Guitar Road（Next.js）核心只依赖 Node.js，
Python / homr / PyTorch 缺失时应用照常运行，Creator 页面显示「识别引擎未安装」。

对外只暴露两个稳定契约：

    python -m guitar_road_omr status
    python -m guitar_road_omr recognize <input> --output <output.musicxml>

详见 README.md。
"""

from .engine import (
    EngineStatus,
    OmrEngine,
    OmrError,
    OmrUnavailableError,
    RecognitionResult,
)

__all__ = [
    "EngineStatus",
    "OmrEngine",
    "OmrError",
    "OmrUnavailableError",
    "RecognitionResult",
]

__version__ = "0.1.0"
