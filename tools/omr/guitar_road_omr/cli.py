"""命令行入口 —— Node 层唯一依赖的契约（SPEC §4.7）。

    python -m guitar_road_omr status
    python -m guitar_road_omr recognize <input> --output <output.musicxml>

约定：
- **成功**：exit code = 0，stdout 最后一行是 JSON `{"ok": true, ...}`
- **失败**：exit code != 0，stdout 最后一行是 JSON `{"ok": false, "error": "..."}`
- 所有人类可读日志走 stderr，绝不污染 stdout 的最后一行
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from .engine import OmrError, OmrUnavailableError, RecognitionResult
from .homr_adapter import DEFAULT_TIMEOUT_SECONDS, DEVICE_ENV, HomrEngine

#: 允许的引擎名。新增引擎时在这里登记即可，Node 层无需改动。
ENGINES: dict[str, type] = {"homr": HomrEngine}

#: 推理设备：auto = 有 CUDA 就用，cpu = 强制 CPU，cuda = 强制 GPU
DEVICES = ("auto", "cpu", "cuda")

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_UNAVAILABLE = 2


def _emit(payload: dict) -> None:
    """把机器可读结果作为 stdout 的最后一行输出。"""
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def _build_engine(name: str, timeout: int, device: str):
    engine_cls = ENGINES.get(name)
    if engine_cls is None:
        raise OmrError(f"未知的识别引擎：{name}（可选：{', '.join(ENGINES)}）")
    return engine_cls(timeout=timeout, device=device)


def _device_arg(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--device",
        default=os.environ.get(DEVICE_ENV, "auto"),
        choices=DEVICES,
        help=f"推理设备（默认取环境变量 {DEVICE_ENV}，缺省 auto）",
    )


def cmd_status(args: argparse.Namespace) -> int:
    engine = _build_engine(args.engine, args.timeout, args.device)
    status = engine.status()
    _emit(status.to_json_dict())
    return EXIT_OK if status.available else EXIT_UNAVAILABLE


def cmd_recognize(args: argparse.Namespace) -> int:
    engine = _build_engine(args.engine, args.timeout, args.device)

    status = engine.status()
    if not status.available:
        _emit({"ok": False, "error": status.message or "识别引擎未安装"})
        return EXIT_UNAVAILABLE

    input_path = Path(args.input)
    output_path = Path(args.output)

    try:
        if args.mode:
            from .pipeline import recognize_paired
            result = recognize_paired(engine, input_path, output_path, args.mode)
        else:
            result = engine.recognize(input_path, output_path)
    except OmrUnavailableError as exc:
        _emit({"ok": False, "error": str(exc)})
        return EXIT_UNAVAILABLE
    except OmrError as exc:
        _emit({"ok": False, "error": str(exc)})
        return EXIT_ERROR
    except Exception as exc:  # 兜底：任何未预期异常都必须变成可读 JSON
        _emit({"ok": False, "error": f"{type(exc).__name__}: {exc}"})
        return EXIT_ERROR

    if not result.ok:
        _emit({"ok": False, "error": "识别未完成"})
        return EXIT_ERROR

    _emit(result.to_json_dict())
    return EXIT_OK


def cmd_inspect_tab(args: argparse.Namespace) -> int:
    """Independent experimental tool; the existing recognition path is unchanged."""
    try:
        from .tab_parser import inspect_tab

        input_path = Path(args.input).resolve()
        output_path = Path(args.output).resolve()
        if input_path == output_path or output_path.suffix.lower() != '.json':
            raise OmrError('TAB 检查输出必须是独立的 .json 文件，不能覆盖原图。')
        result = inspect_tab(input_path,
                             models=Path(args.models) if args.models else None,
                             diagnostic_dir=Path(args.diagnostics) if args.diagnostics else None)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        events = [event for system in result['systems'] for event in system['events']]
        _emit({'ok': True, 'experimental': True, 'output': str(output_path),
               'events': len(events), 'needsReview': sum(e['needs_review'] for e in events),
               'warnings': result['warnings'], 'timingAvailable': False})
        return EXIT_OK
    except OmrUnavailableError as exc:
        _emit({'ok': False, 'error': str(exc)})
        return EXIT_UNAVAILABLE
    except Exception as exc:
        _emit({'ok': False, 'error': str(exc)})
        return EXIT_ERROR


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="guitar_road_omr",
        description="Guitar Road Creator 的可选 OMR 识别命令行",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    status = sub.add_parser("status", help="探测识别引擎是否可用")
    status.add_argument("--engine", default="homr", choices=sorted(ENGINES))
    status.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    _device_arg(status)
    status.set_defaults(func=cmd_status)

    rec = sub.add_parser("recognize", help="把乐谱图片识别为 MusicXML")
    rec.add_argument("input", help="输入图片路径（png / jpg / jpeg）")
    rec.add_argument(
        "--output",
        required=True,
        help="输出的 MusicXML 路径",
    )
    rec.add_argument("--engine", default="homr", choices=sorted(ENGINES))
    rec.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    rec.add_argument('--mode', choices=('auto', 'standard', 'standard-tab'),
                     help='Creator 模式；不指定时保留旧 CLI 行为')
    _device_arg(rec)
    rec.set_defaults(func=cmd_recognize)

    inspector = sub.add_parser('inspect-tab', help='实验性 TAB 检查：输出弦号/品位 JSON，不生成 MusicXML')
    inspector.add_argument('input', help='五线谱 + TAB 图片路径')
    inspector.add_argument('--output', required=True, help='独立 JSON 输出路径')
    inspector.add_argument('--models', help='已下载 RapidOCR 模型的目录（不会自动下载）')
    inspector.add_argument('--diagnostics', help='可选的独立本地诊断目录，保留裁剪图和数字框')
    inspector.set_defaults(func=cmd_inspect_tab)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
