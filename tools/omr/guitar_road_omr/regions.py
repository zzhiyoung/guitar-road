"""Bounded printed-score region detection for the experimental TAB inspector.

Image dependencies are imported only when this optional tool is invoked.
No homr internals or fixed screenshot crop coordinates are used.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from .engine import OmrError, OmrUnavailableError


def deskew_image(image):
    """Correct a small, consistent long-line tilt; preserve the source mapping."""
    import cv2
    import numpy as np
    import math
    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    ink = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                cv2.THRESH_BINARY_INV, 25, 3)
    lines = cv2.HoughLinesP(ink, 1, np.pi / 1800, threshold=max(50, width // 6),
                          minLineLength=max(80, round(width * .45)),
                          maxLineGap=max(5, width // 60))
    angles = []
    if lines is not None:
        for x0, y0, x1, y1 in np.asarray(lines).reshape(-1, 4):
            angle = math.degrees(math.atan2(int(y1) - int(y0), int(x1) - int(x0)))
            if abs(angle) <= 3:
                angles.append(angle)
    angle = float(np.median(angles)) if len(angles) >= 5 else 0.0
    # Inconsistent lines can indicate perspective or curved pages. Do not
    # invent a correction from a single beam or short musical annotation.
    if angles and float(np.median(np.abs(np.array(angles) - angle))) > .35:
        angle = 0.0
    if abs(angle) < .12:
        angle = 0.0
    matrix = np.array([[1., 0., 0.], [0., 1., 0.]])
    analysis = image
    if angle:
        matrix = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1)
        cosine, sine = abs(matrix[0, 0]), abs(matrix[0, 1])
        target_width = math.ceil(height * sine + width * cosine)
        target_height = math.ceil(height * cosine + width * sine)
        if target_width * target_height > 22_000_000:
            raise OmrError('纠偏后的图片过大，请裁剪较小的片段。')
        matrix[0, 2] += (target_width - width) / 2
        matrix[1, 2] += (target_height - height) / 2
        analysis = cv2.warpAffine(image, matrix, (target_width, target_height),
                                  flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255))
    return analysis, {'coordinate_space': 'analysis_image', 'deskew_degrees': angle,
                      'source_size': [width, height],
                      'analysis_size': [analysis.shape[1], analysis.shape[0]],
                      'source_to_analysis': matrix.tolist(),
                      'analysis_to_source': cv2.invertAffineTransform(matrix).tolist()}


@dataclass(frozen=True)
class StaffRegion:
    kind: str
    lines: tuple[float, ...]
    left: int
    right: int
    spacing: float
    support: float

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class StaffPair:
    system: int
    standard: StaffRegion
    tab: StaffRegion
    crop_top: int
    crop_bottom: int

    def to_dict(self) -> dict:
        return asdict(self)


def load_image(path: Path):
    if path.stat().st_size > 20 * 1024 * 1024:
        raise OmrError('图片文件超过 20 MB，请裁剪到需要识别的乐谱区域。')
    try:
        import cv2
        import numpy as np
        from PIL import Image
    except ImportError as exc:
        raise OmrUnavailableError('TAB 工具需要可选的 OpenCV、NumPy 和 Pillow 依赖。') from exc
    # Pillow checks dimensions before OpenCV allocates the decoded image.
    with Image.open(path) as source:
        if source.width * source.height > 20_000_000:
            raise OmrError('图片像素过多，请裁剪到需要识别的乐谱区域。')
        if min(source.size) < 40:
            raise OmrError('图片过小，无法定位谱线。')
    data = np.frombuffer(Path(path).read_bytes(), dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise OmrError('无法解码乐谱图片。')
    return image


def detect_regions(image) -> list[StaffRegion]:
    import cv2
    import numpy as np
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    ink = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                cv2.THRESH_BINARY_INV, 25, 3)
    width = image.shape[1]
    kernel = max(15, round(width * .04))
    horizontal = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((1, kernel), np.uint8))
    strength = (horizontal > 0).sum(axis=1)
    rows = np.flatnonzero(strength > width * .22)
    bands: list[list[int]] = []
    for y in rows:
        if not bands or y - bands[-1][-1] > 1:
            bands.append([int(y)])
        else:
            bands[-1].append(int(y))
    centers = np.array([np.average(b, weights=strength[b]) for b in bands])
    if len(centers) > 160:
        raise OmrError('谱线数量过多，请裁剪到 4–16 小节后重试。')
    candidates: dict[tuple[int, ...], StaffRegion] = {}
    # Prefer six-line groups before five-line subsets; support chooses between
    # a real first string and an accidental extra beam above the TAB.
    for count in (6, 5):
        for first in range(len(centers)):
            for last in range(first + count - 1, len(centers)):
                spacing = float((centers[last] - centers[first]) / (count - 1))
                if not 4 <= spacing <= 26:
                    continue
                predicted = np.linspace(centers[first], centers[last], count)
                indices = tuple(int(np.argmin(abs(centers - y))) for y in predicted)
                if len(set(indices)) != count:
                    continue
                # Reject harmonics formed by skipping every other real staff
                # line. Nearby duplicate rows from thick/skewed ink may remain.
                skipped = [j for j in range(indices[0], indices[-1] + 1) if j not in indices]
                if any(np.min(abs(centers[list(indices)] - centers[j])) > spacing * .40
                       for j in skipped):
                    continue
                error = float(np.max(abs(centers[list(indices)] - predicted)))
                if error > spacing * .20 + .35:
                    continue
                line_rows = [bands[i] for i in indices]
                spans = []
                for band in line_rows:
                    line_xs = np.flatnonzero(np.any(horizontal[band] > 0, axis=0))
                    spans.append(int(line_xs[-1] - line_xs[0]) if len(line_xs) else 0)
                # Short beams/ledger lines cannot extend a five-line staff
                # into a six-string region, even when spacing happens to match.
                if min(spans) < max(spans) * .75:
                    continue
                pixels = np.any(horizontal[np.concatenate(line_rows)] > 0, axis=0)
                xs = np.flatnonzero(pixels)
                if len(xs) < width * .40:
                    continue
                support = float(np.mean([strength[b].max() for b in line_rows]) / width)
                region = StaffRegion('tab' if count == 6 else 'standard',
                    tuple(float(centers[i]) for i in indices), int(xs[0]), int(xs[-1]),
                    spacing, support)
                candidates[indices] = region
    chosen: list[StaffRegion] = []
    used: set[int] = set()
    ordered = sorted(candidates.items(), key=lambda item:
                     (len(item[0]), item[1].support), reverse=True)
    for indices, region in ordered:
        if used.intersection(indices):
            continue
        chosen.append(region)
        used.update(indices)
    return sorted(chosen, key=lambda r: r.lines[0])


def pair_regions(regions: list[StaffRegion], height: int) -> list[StaffPair]:
    pairs: list[StaffPair] = []
    for index, tab in enumerate(regions):
        if tab.kind != 'tab':
            continue
        if index == 0 or regions[index - 1].kind != 'standard':
            raise OmrError('检测到未配对的 TAB。当前原型需要上方有对应五线谱。')
        standard = regions[index - 1]
        gap = tab.lines[0] - standard.lines[-1]
        overlap = min(tab.right, standard.right) - max(tab.left, standard.left)
        if not 1.5 * standard.spacing <= gap <= 14 * standard.spacing or overlap < (tab.right - tab.left) * .7:
            raise OmrError('五线谱与 TAB 的配对不明确，请使用更清晰的单个乐谱系统。')
        previous_bottom = regions[index - 2].lines[-1] if index >= 2 else 0
        # Four line spaces retain ledger lines. Keep one TAB line-space clear
        # above its first string, rather than bisecting low ledger notes.
        top = max(0, round(standard.lines[0] - 6 * standard.spacing),
                  round(previous_bottom + standard.spacing) if index >= 2 else 0)
        bottom = min(height, round(standard.lines[-1] + 4 * standard.spacing),
                     round(tab.lines[0] - tab.spacing))
        pairs.append(StaffPair(len(pairs) + 1, standard, tab, top, bottom))
    if not pairs:
        raise OmrError('未定位到五线谱与六线谱组合；此命令不处理纯 TAB 或普通五线谱。')
    if sum(r.kind == 'standard' for r in regions) != len(pairs):
        raise OmrError('检测到额外的未配对五线谱；当前原型不处理混合或多声部布局。')
    return pairs
