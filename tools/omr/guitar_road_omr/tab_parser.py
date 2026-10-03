"""Experimental single-note printed TAB inspector, not a MusicXML engine.

Whole-region text detection is complemented by stem-anchored original-pixel
recognition. OCR scores are diagnostic scores, not calibrated probabilities.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
import re
from .engine import OmrError, OmrUnavailableError
from .regions import StaffPair, deskew_image, detect_regions, load_image, pair_regions


@dataclass(frozen=True)
class DigitCandidate:
    x: float
    string: int
    fret: int
    score: float
    text: str
    bbox: tuple[int, int, int, int]
    source: str


def numeric_fret(text: str) -> int | None:
    # No stripping arbitrary symbols, no replacing a missing value with zero.
    if not re.fullmatch(r'(?:0|[1-9][0-9]?)', text.strip()):
        return None
    value = int(text.strip())
    return value if 0 <= value <= 24 else None


def _bands(values, max_gap: int = 2) -> list[list[int]]:
    result: list[list[int]] = []
    for value in values:
        if not result or value - result[-1][-1] > max_gap:
            result.append([int(value)])
        else:
            result[-1].append(int(value))
    return result


def _ocr(models: Path | None):
    try:
        import rapidocr
        from rapidocr import RapidOCR
    except ImportError as exc:
        raise OmrUnavailableError('TAB 原型需要可选的 RapidOCR 依赖。') from exc
    directory = models or Path(rapidocr.__file__).parent / 'models'
    # Prototype deliberately uses installed models; never downloads on status
    # or recognition. Model selection is pinned to the tested v6 CPU family.
    names = ('PP-OCRv6_det_small.onnx', 'PP-OCRv6_rec_small.onnx',
             'ch_ppocr_mobile_v2.0_cls_mobile.onnx')
    if any(not (directory / name).is_file() for name in names):
        raise OmrUnavailableError('TAB 原型缺少已验证的 RapidOCR 模型，请先准备本地模型。')
    return RapidOCR(params={
        'Global.model_root_dir': str(directory), 'Global.log_level': 'error',
        'Det.model_path': str(directory / names[0]),
        'Rec.model_path': str(directory / names[1]),
        'Cls.model_path': str(directory / names[2]),
        'EngineConfig.onnxruntime.intra_op_num_threads': 2,
        'EngineConfig.onnxruntime.inter_op_num_threads': 1,
    })


def _bar_positions(gray, pair: StaffPair) -> list[float]:
    import cv2
    import numpy as np
    y0, y1 = round(pair.standard.lines[0]), round(pair.tab.lines[-1]) + 1
    ink = cv2.adaptiveThreshold(gray[y0:y1], 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                cv2.THRESH_BINARY_INV, 25, 10)
    vertical = cv2.morphologyEx(ink, cv2.MORPH_OPEN,
                               np.ones((max(10, round((y1 - y0) * .8)), 1), np.uint8))
    cols = np.flatnonzero((vertical > 0).sum(axis=0) > (y1 - y0) * .75)
    # Merge close double barlines rather than inventing an empty measure.
    return [float(np.mean(b)) for b in _bands(cols, round(pair.tab.spacing))
            if pair.standard.left - pair.standard.spacing * 1.5 <= np.mean(b)
            <= pair.standard.right + pair.standard.spacing]


def _stem_columns(ink, pair: StaffPair, bars: list[float]) -> list[float]:
    import cv2
    import numpy as np
    tab = pair.tab
    top = max(0, round(tab.lines[0] - tab.spacing * 2.2))
    bottom = min(ink.shape[0], round(tab.lines[-1] + tab.spacing * .8))
    # A top-string digit interrupts a short stem. Requiring two full spaces
    # drops these events when glyphs are larger than in the initial textbook.
    minimum = max(3, round(tab.spacing * 1.25))
    vertical = cv2.morphologyEx(ink[top:bottom], cv2.MORPH_OPEN,
                               np.ones((minimum, 1), np.uint8))
    cols = np.flatnonzero((vertical > 0).sum(axis=0) >= minimum)
    xs = [float(np.mean(b)) for b in _bands(cols)]
    return [x for x in xs if tab.left + 3 * tab.spacing < x < tab.right - 3
            and all(abs(x - b) > tab.spacing * .8 for b in bars)]


def _detect_digits(image, pair: StaffPair, ocr) -> tuple[list[DigitCandidate], list[dict]]:
    import cv2
    import numpy as np
    tab = pair.tab
    y0 = max(0, round(tab.lines[0] - tab.spacing))
    y1 = min(image.shape[0], round(tab.lines[-1] + tab.spacing))
    # Include the full common-time symbol for explicit header classification,
    # rather than clipping its left half into an unread musical event.
    x0, x1 = round(tab.left + 2 * tab.spacing), tab.right - 3
    # Resize is only analytical preprocessing for the OCR model. Original
    # coordinates and pixels remain the input of record.
    scaled = cv2.resize(image[y0:y1, x0:x1], None, fx=3, fy=3,
                        interpolation=cv2.INTER_CUBIC)
    result = ocr(scaled, use_det=True, use_cls=False)
    candidates: list[DigitCandidate] = []
    rejected: list[dict] = []
    if result.boxes is None or result.txts is None:
        return candidates, rejected
    for box, text, score in zip(result.boxes, result.txts, result.scores):
        points = np.array(box) / 3 + np.array([x0, y0])
        x, y = points.mean(axis=0)
        string = int(np.argmin(abs(np.array(tab.lines) - y))) + 1
        fret = numeric_fret(text)
        bbox = (int(points[:, 0].min()), int(points[:, 1].min()),
                int(points[:, 0].max()) + 1, int(points[:, 1].max()) + 1)
        if fret is None or abs(y - tab.lines[string - 1]) > tab.spacing * .45 or score < .90:
            rejected.append({'bbox': bbox, 'text': text, 'score': float(score),
                             'reason': 'non_numeric_or_uncertain_detection'})
            continue
        candidates.append(DigitCandidate(float(x), string, fret, float(score),
                                         text, bbox, 'text_detection'))
    return candidates, rejected


def _glyph_box(ink, center: int) -> tuple[int, int, int, int] | None:
    """Locate glyph ink without feeding line-erased pixels into recognition."""
    import cv2
    import numpy as np
    bw = ink.copy()
    bw[max(0, center - 1):center + 2] = 0
    # Scanned lines can be thicker or locally displaced from the global
    # center. Remove broad rows near the string only for glyph localization;
    # recognition still receives the unchanged grayscale pixels.
    for row in range(max(0, center - 4), min(bw.shape[0], center + 5)):
        if np.count_nonzero(bw[row]) >= bw.shape[1] * .55:
            bw[row] = 0
    # A neighbouring string/beam clipped at the crop edge can join a stem into
    # a false '7'. It is not evidence of a bounded glyph at this string.
    for row in (0, 1, bw.shape[0] - 2, bw.shape[0] - 1):
        if np.count_nonzero(bw[row]) >= bw.shape[1] * .4:
            bw[row] = 0
    # The central band must contain glyph width of its own. A fragment of a
    # digit on the next string cannot supply the width for a thin passing stem.
    radius = max(2, round(bw.shape[0] * .3))
    central = bw[max(0, center - radius):min(bw.shape[0], center + radius + 1)]
    if np.count_nonzero(np.count_nonzero(central, axis=0) >= 2) < 3:
        return None
    _, _, stats, _ = cv2.connectedComponentsWithStats(bw, connectivity=8)
    # Long one-pixel stems are geometry, not candidate digits. Union the
    # remaining pieces because removing the string row can split a glyph.
    pieces = [s for s in stats[1:] if s[cv2.CC_STAT_WIDTH] >= 2
              and s[cv2.CC_STAT_AREA] >= 3]
    if not pieces:
        return None
    left = min(int(s[0]) for s in pieces)
    right = max(int(s[0] + s[2]) for s in pieces)
    glyph_top = min(int(s[1]) for s in pieces)
    glyph_bottom = max(int(s[1] + s[3]) for s in pieces)
    if glyph_bottom - glyph_top < max(3, round(bw.shape[0] * .5)):
        return None
    # A stem passes through both crop edges on an unrelated string. A narrow
    # actual '1' has a bounded glyph or a stem ending at it. Checking continuity
    # is safer than requiring four columns, which rejected real narrow digits.
    top = np.flatnonzero(np.any(ink[:2, left:right] > 0, axis=0))
    bottom = np.flatnonzero(np.any(ink[-2:, left:right] > 0, axis=0))
    if (right - left <= max(3, round(bw.shape[0] * .55)) and len(top) and len(bottom)
            and min(abs(int(a) - int(b)) for a in top for b in bottom) <= 2):
        return None
    return (max(0, min(int(s[0]) for s in pieces) - 1),
            max(0, min(int(s[1]) for s in pieces) - 1),
            min(bw.shape[1], max(int(s[0] + s[2]) for s in pieces) + 1),
            min(bw.shape[0], max(int(s[1] + s[3]) for s in pieces) + 1))


def _stem_digits(gray, ink, pair: StaffPair, columns: list[float], ocr) -> list[DigitCandidate]:
    import cv2
    import numpy as np
    from rapidocr.ch_ppocr_rec.typings import TextRecInput
    boxes: list[tuple[float, int, tuple[int, int, int, int]]] = []
    crops = []
    for x in columns:
        for string, line in enumerate(pair.tab.lines, 1):
            gap = pair.tab.spacing
            x0, x1 = max(0, round(x - gap * 1.1)), min(gray.shape[1], round(x + gap * 1.1))
            y0, y1 = max(0, round(line - gap * .7)), min(gray.shape[0], round(line + gap * .7))
            glyph = _glyph_box(ink[y0:y1, x0:x1], round(line - y0))
            if glyph is None:
                continue
            a, b, c, d = glyph
            crop = cv2.copyMakeBorder(gray[y0+b:y0+d, x0+a:x0+c], 6, 6, 6, 6,
                                      cv2.BORDER_CONSTANT, value=255)
            crops.append(cv2.cvtColor(crop, cv2.COLOR_GRAY2BGR))
            boxes.append((x, string, (x0+a, y0+b, x0+c, y0+d)))
    if not crops:
        return []
    recognized = ocr.text_rec(TextRecInput(img=crops))
    result = []
    for (x, string, bbox), text, score in zip(boxes, recognized.txts or (), recognized.scores):
        fret = numeric_fret(text)
        if fret is not None and score >= .90:
            result.append(DigitCandidate(x, string, fret, float(score), text, bbox, 'stem_crop'))
    return result


def reconcile_column(x: float, candidates: list[DigitCandidate], tolerance: float) -> dict:
    nearby = [c for c in candidates if abs(c.x - x) <= tolerance]
    values = {(c.string, c.fret) for c in nearby}
    if len(values) != 1:
        return {'x': x, 'string': None, 'fret': None, 'needs_review': True,
                'reason': 'conflicting_candidates' if values else 'unread_digit',
                'candidates': [asdict(c) for c in nearby]}
    best = max(nearby, key=lambda c: c.score)
    return {'x': x, 'string': best.string, 'fret': best.fret,
            'bbox': best.bbox, 'ocr_score': best.score, 'needs_review': False,
            'sources': sorted({c.source for c in nearby}), 'candidates': [asdict(c) for c in nearby]}


def common_time_columns(columns: list[float], rejected: list[dict],
                        candidates: list[DigitCandidate], pair: StaffPair) -> list[float]:
    """Classify a complete leading C symbol; never discard unknown digits."""
    first_digit = min((c.x for c in candidates), default=pair.tab.right)
    gap = pair.tab.spacing
    result = []
    for item in rejected:
        a, b, c, d = item['bbox']
        center = (a + c) / 2
        if (item['text'].strip() != 'C' or item['score'] < .9 or d - b < 1.5 * gap
                or center > pair.tab.left + 6 * gap or center >= first_digit - gap * .8):
            continue
        result.extend(x for x in columns if a - 2 <= x <= c + 2
                      and not any(abs(x - digit.x) <= gap * .8 for digit in candidates))
    return result


def inspect_tab(input_path: Path, *, models: Path | None = None,
                diagnostic_dir: Path | None = None) -> dict:
    image = load_image(input_path)
    import cv2
    import numpy as np
    image, geometry = deskew_image(image)
    regions = detect_regions(image)
    pairs = pair_regions(regions, image.shape[0])
    if len(pairs) > 8:
        raise OmrError('原型最多检查 8 个乐谱系统，请裁剪较小的区域。')
    if diagnostic_dir is not None:
        outputs = [diagnostic_dir / 'tab-events.png'] + [
            diagnostic_dir / f'system-{p.system}-standard.png' for p in pairs]
        if any(p.resolve() == input_path.resolve() for p in outputs):
            raise OmrError('诊断输出会覆盖输入原图，请使用独立诊断目录。')
    ocr = _ocr(models)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    ink = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                cv2.THRESH_BINARY_INV, 25, 10)
    systems = []
    warnings = []
    canvas = image.copy()
    for pair in pairs:
        bars = _bar_positions(gray, pair)
        if len(bars) < 2:
            raise OmrError('未找到可靠的小节边界；不能确定 TAB 事件所属小节。')
        columns = _stem_columns(ink, pair, bars)
        if not columns or len(columns) > 128:
            raise OmrError('TAB 事件数量不在原型支持范围，请裁剪较小的片段。')
        detected, rejected = _detect_digits(image, pair, ocr)
        cropped = _stem_digits(gray, ink, pair, columns, ocr)
        candidates = detected + cropped
        signatures = common_time_columns(columns, rejected, candidates, pair)
        columns = [x for x in columns if x not in signatures]
        # Every detected number requires a matching stem. Numbers outside stems
        # are evidence of unsupported layout, not silently discarded music.
        unmatched = [asdict(c) for c in detected if not any(abs(c.x-x) <= pair.tab.spacing*.8 for x in columns)]
        events = []
        for x in columns:
            event = reconcile_column(x, candidates, pair.tab.spacing * .8)
            enclosing = [j for j in range(len(bars) - 1) if bars[j] < x < bars[j+1]]
            event.update(system=pair.system, bar=enclosing[0] + 1 if len(enclosing) == 1 else None)
            if event['bar'] is None:
                event.update(needs_review=True, reason='outside_bar_boundaries')
            if event['needs_review']:
                warnings.append(f"系统 {pair.system} 的 TAB 事件需要人工核对。")
            events.append(event)
            if 'bbox' in event:
                a, b, c, d = event['bbox']
                cv2.rectangle(canvas, (a, b), (c, d), (0, 0, 255), 1)
        if unmatched:
            warnings.append(f"系统 {pair.system} 有未对齐数字，可能包含不支持的 TAB 结构。")
        systems.append({'pair': pair.to_dict(), 'bar_lines': bars, 'events': events,
                        'header_common_time_columns': signatures,
                        'unmatched_detections': unmatched, 'rejected_detections': rejected})
        if diagnostic_dir is not None:
            diagnostic_dir.mkdir(parents=True, exist_ok=True)
            cv2.imencode('.png', image[pair.crop_top:pair.crop_bottom])[1].tofile(
                str(diagnostic_dir / f'system-{pair.system}-standard.png'))
    if diagnostic_dir is not None:
        cv2.imencode('.png', canvas)[1].tofile(str(diagnostic_dir / 'tab-events.png'))
    return {'ok': True, 'experimental': True, 'input_kind': 'standard_and_tab',
            'image_geometry': geometry,
            'timing_available': False, 'systems': systems,
            'warnings': list(dict.fromkeys(warnings))}
