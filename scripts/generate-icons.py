"""生成 Guitar Road 的 PWA PNG 图标（纯标准库，无第三方依赖）。

设计：深松绿圆角方块背景 + 陶土色吉他拨片（Pick）主体，底部三道弦痕。
既满足 maskable（安全区 80%）也满足 any 用途。
"""
import math
import struct
import zlib
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[1] / "public" / "icons"

BG = (41, 62, 53)          # 深松绿
PICK_TOP = (196, 108, 75)   # 陶土渐变
PICK_BOTTOM = (182, 76, 53) # --color-accent
STRING = (247, 243, 236)    # --color-canvas


def png_bytes(width: int, height: int, rgba: bytes) -> bytes:
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)  # filter type 0
        raw.extend(rgba[y * stride : (y + 1) * stride])

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def rounded_rect_alpha(x: float, y: float, s: float, radius_ratio: float) -> float:
    """单位坐标 (0..1) 下圆角方块的覆盖度（带 1px 抗锯齿）。"""
    r = s * radius_ratio
    dx = max(r - x, 0.0) + max(x - (s - r), 0.0)
    dy = max(r - y, 0.0) + max(y - (s - r), 0.0)
    if dx == 0.0 and dy == 0.0:
        return 1.0
    dist = math.hypot(dx, dy)
    return min(1.0, max(0.0, r - dist + 0.5))


def mix(a, b, k):
    return tuple(a[i] + (b[i] - a[i]) * k for i in range(3))


def pick_sdf(ux: float, uy: float, tx: float, ty: float, apex_y: float, s: float) -> float:
    """拨片轮廓 = Reuleaux 三角形（三个顶点的半径为 s 的圆盘之交），顶点朝下。

    返回 >0 表示在内部（距离边界的有符号值，单位同 ux/uy）。
    """
    da = math.hypot(ux - tx, uy - ty)
    db = math.hypot(ux - (1.0 - tx), uy - ty)
    dc = math.hypot(ux - 0.5, uy - apex_y)
    return s - max(da, db, dc)


def render(size: int) -> bytes:
    ss = 2  # 2x 超采样（形状本身已带解析抗锯齿）
    w = size * ss
    canvas = [[(0.0, 0.0, 0.0, 0.0)] * w for _ in range(w)]

    # 拨片几何（归一化到整图）—— 顶边 y=ty，顶点 y=apex_y，顶边半宽 = s/2
    s = 0.60
    tx = 0.5 - s / 2          # 顶点 A / B 的 x
    ty = 0.24
    apex_y = ty + s * math.sqrt(3) / 2

    for py in range(w):
        for px in range(w):
            ux = (px + 0.5) / w
            uy = (py + 0.5) / w

            bg_a = rounded_rect_alpha(ux * w, uy * w, w, 0.22)

            d = pick_sdf(ux, uy, tx, ty, apex_y, s)
            pick_a = min(1.0, max(0.0, d * w + 0.5))

            # 弦痕：拨片上三道浅色细线（被拨片轮廓自然裁切）
            string_a = 0.0
            if pick_a > 0.0:
                for k, thick in ((0.0, 0.0075), (0.105, 0.006), (0.21, 0.0048)):
                    sy = ty + 0.155 + k
                    gap = abs(uy - sy)
                    string_a = max(
                        string_a, min(1.0, max(0.0, (thick - gap) * w + 0.5))
                    )

            grad = min(1.0, max(0.0, (uy - ty) / max(1e-6, apex_y - ty)))
            rgb = mix(PICK_TOP, PICK_BOTTOM, grad)
            if string_a > 0:
                rgb = mix(rgb, STRING, string_a * pick_a * 0.6)

            out = [BG[i] for i in range(3)]
            if pick_a > 0:
                out = [out[i] + (rgb[i] - out[i]) * pick_a for i in range(3)]
            canvas[py][px] = (out[0], out[1], out[2], bg_a)

    # 下采样
    buf = bytearray(size * size * 4)
    area = ss * ss
    for y in range(size):
        for x in range(size):
            r = g = b = a = 0.0
            for dy in range(ss):
                for dx in range(ss):
                    pr, pg, pb, pa = canvas[y * ss + dy][x * ss + dx]
                    r += pr * pa
                    g += pg * pa
                    b += pb * pa
                    a += pa
            a /= area
            idx = (y * size + x) * 4
            if a > 0:
                buf[idx] = int(round(r / (a * area)))
                buf[idx + 1] = int(round(g / (a * area)))
                buf[idx + 2] = int(round(b / (a * area)))
            buf[idx + 3] = int(round(a * 255))
    return bytes(buf)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        data = png_bytes(size, size, render(size))
        path = OUT_DIR / f"icon-{size}.png"
        path.write_bytes(data)
        print(f"wrote {path} ({len(data)} bytes)")


if __name__ == "__main__":
    main()
