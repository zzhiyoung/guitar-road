"""Optional real-OCR check on authored diagrams; no fonts or weights bundled.

Run from tools/omr with a prepared local model directory and font files.
This tests TAB geometry/digits only, not music recognition or real-score quality.
"""
from pathlib import Path
import argparse
import json
import time

from guitar_road_omr.tab_parser import inspect_tab

EXPECTED = [(1, 0), (2, 10), (3, 24), (4, 12), (5, 1), (6, 0), (1, 11), (6, 20)]


def draw_diagram(font_path: Path, path: Path) -> None:
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype(str(font_path), 20)
    image = Image.new('RGB', (900, 680), 'white')
    draw = ImageDraw.Draw(image)
    for system in range(2):
        base = system * 330
        for y in [60 + i * 16 for i in range(5)]:
            draw.line((50, y + base, 840, y + base), fill='black')
        for y in [200 + i * 16 for i in range(6)]:
            draw.line((50, y + base, 840, y + base), fill=(130, 130, 130))
        for x in (50, 460, 840):
            draw.line((x, 60 + base, x, 280 + base), fill='black')
        for i, (string, fret) in enumerate(EXPECTED):
            x = 145 + i * 82 if i < 4 else 540 + (i - 4) * 82
            y = 200 + (string - 1) * 16 + base
            draw.line((x, 170 + base, x, y), fill='black')
            draw.ellipse((x - 4, 82 + base, x + 4, 89 + base), fill='black')
            draw.line((x + 4, 86 + base, x + 4, 40 + base), fill='black')
            a, b, c, d = draw.textbbox((x, y), str(fret), font=font, anchor='mm')
            draw.rectangle((a - 1, b - 1, c + 1, d + 1), fill='white')
            draw.text((x, y), str(fret), font=font, fill='black', anchor='mm')
    image.save(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--models', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--font', required=True, action='append', type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    passed = True
    for index, font in enumerate(args.font, 1):
        folder = args.output / f'font-{index}'
        folder.mkdir(exist_ok=True)
        path = folder / 'authored.png'
        draw_diagram(font, path)
        start = time.monotonic()
        result = inspect_tab(path, models=args.models, diagnostic_dir=folder)
        (folder / 'tab.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf8')
        systems = result['systems']
        matched = 0
        # Compare only within independently known system/x windows. Missing or
        # duplicate events cannot shift subsequent matches as with array zip.
        for system in systems:
            for i, expected in enumerate(EXPECTED):
                x = 145 + i * 82 if i < 4 else 540 + (i - 4) * 82
                near = [e for e in system['events'] if abs(e['x'] - x) <= 12]
                if (len(near) == 1 and (near[0]['string'], near[0]['fret']) == expected
                        and near[0]['bar'] == (1 if i < 4 else 2)
                        and not near[0]['needs_review']):
                    matched += 1
        events = [e for s in systems for e in s['events']]
        ok = len(systems) == 2 and len(events) == matched == 16 and not result['warnings']
        passed &= ok
        print(json.dumps({'font': font.name, 'matched': matched, 'expected': 16,
                          'events': len(events), 'needs_review': sum(e['needs_review'] for e in events),
                          'passed': ok, 'seconds': round(time.monotonic() - start, 2)}, ensure_ascii=False),
              flush=True)
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
