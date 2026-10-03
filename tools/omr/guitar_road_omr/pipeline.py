"""Experimental paired-staff conversion with bounded, spatial alignment.

Standard recognition supplies timing. TAB supplies original fingering and
pitch only after geometry, per-bar counts and durations all agree.
"""
from __future__ import annotations

import copy
import json
import os
import subprocess
import sys
import tempfile
import time
from fractions import Fraction
from pathlib import Path
import xml.etree.ElementTree as ET

from .engine import OmrError, RecognitionResult
from .regions import deskew_image, detect_regions, load_image, pair_regions

OPEN_STRINGS = (64, 59, 55, 50, 45, 40)


def _pitch_midi(pitch: ET.Element) -> int:
    return (int(pitch.findtext('octave', '0')) + 1) * 12 + {
        'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11,
    }[pitch.findtext('step')] + int(pitch.findtext('alter', '0'))


def align_system(root: ET.Element, system: dict, geometry: dict, crop_width: int) -> list[tuple]:
    """Reject ambiguous input; never globally zip TAB to recognized notes."""
    parts = root.findall('part')
    if len(parts) != 1 or len(geometry['staffs']) != 1:
        raise OmrError('五线谱识别出现多个声部，当前 TAB 模式只支持单音单声部。')
    measures = parts[0].findall('measure')
    bounds = system['bar_lines']
    if len(measures) != len(bounds) - 1:
        raise OmrError('五线谱与 TAB 小节数不同，无法可靠合并。请裁剪更清晰的小节。')
    if system['unmatched_detections'] or any(e['needs_review'] for e in system['events']):
        raise OmrError('TAB 有无法确认的数字或额外符号（可能是拍号），请裁剪清晰片段，或选择“仅五线谱”。')
    if root.findall('.//backup') or root.findall('.//forward'):
        raise OmrError('当前 TAB 模式不支持多声部或不完整的时间轴。')
    scale = crop_width / geometry['width']
    positions = [x * scale for x in geometry['staffs'][0]['notes']]
    spacing = system['pair']['standard']['spacing']
    divisions = None
    beats, beat_type = None, None
    aligned = []
    for index, measure in enumerate(measures):
        if measure.findtext('attributes/divisions'):
            divisions = int(measure.findtext('attributes/divisions'))
        if measure.findtext('attributes/time/beats'):
            beats = int(measure.findtext('attributes/time/beats'))
            beat_type = int(measure.findtext('attributes/time/beat-type'))
        if not divisions or not beats or not beat_type:
            raise OmrError('未确认五线谱的拍号或时值，不能合并 TAB。')
        notes = measure.findall('note')
        if any(any(n.find(tag) is not None for tag in ('chord', 'grace', 'time-modification', 'tie', 'unpitched'))
               for n in notes):
            raise OmrError('当前 TAB 模式不支持和弦、倚音、连音或延音，请选择简单单音片段。')
        if any(n.find('duration') is None for n in notes):
            raise OmrError('五线谱有缺失的时值。')
        duration = sum(Fraction(n.findtext('duration')) / divisions for n in notes)
        if duration != Fraction(beats * 4, beat_type):
            raise OmrError(f'第 {index + 1} 小节时值不完整，需先人工校对。')
        pitched = [n for n in notes if n.find('pitch') is not None]
        xs = sorted(x for x in positions if bounds[index] < x < bounds[index + 1])
        events = sorted((e for e in system['events'] if e['bar'] == index + 1), key=lambda e: e['x'])
        if not len(pitched) == len(xs) == len(events) or not pitched:
            raise OmrError(f'第 {index + 1} 小节的音符与 TAB 数量不一致，不能自动合并。')
        for note, x, event in zip(pitched, xs, events):
            nearby = [e for e in events if abs(e['x'] - x) <= spacing * 1.25]
            if len(nearby) != 1 or nearby[0] is not event:
                raise OmrError(f'第 {index + 1} 小节的横向位置对齐不明确，不能自动合并。')
            aligned.append((note, event, index + 1))
    if len(positions) != len(aligned):
        raise OmrError('有五线谱音符落在小节边界之外，不能自动合并。')
    return aligned


def guitar_attributes(root: ET.Element, *, tab: bool) -> None:
    score_part = root.find('part-list/score-part')
    score_part.clear()
    score_part.set('id', 'P1')
    ET.SubElement(score_part, 'part-name').text = 'Guitar'
    instrument = ET.SubElement(score_part, 'score-instrument', id='I1')
    ET.SubElement(instrument, 'instrument-name').text = 'Acoustic Guitar'
    midi = ET.SubElement(score_part, 'midi-instrument', id='I1')
    ET.SubElement(midi, 'midi-channel').text = '1'
    ET.SubElement(midi, 'midi-program').text = '25'
    part = root.find('part')
    part.set('id', 'P1')
    for item in root.findall('.//note/instrument'):
        item.set('id', 'I1')
    for attrs in root.findall('.//attributes'):
        for tag in ('staves', 'clef', 'staff-details', 'transpose'):
            for element in attrs.findall(tag):
                attrs.remove(element)
        clef = ET.SubElement(attrs, 'clef')
        ET.SubElement(clef, 'sign').text = 'TAB' if tab else 'G'
        ET.SubElement(clef, 'line').text = '5' if tab else '2'
        if tab:
            details = ET.SubElement(attrs, 'staff-details')
            ET.SubElement(details, 'staff-lines').text = '6'
            for line, (step, octave) in enumerate((('E', 2), ('A', 2), ('D', 3), ('G', 3), ('B', 3), ('E', 4)), 1):
                tuning = ET.SubElement(details, 'staff-tuning', line=str(line))
                ET.SubElement(tuning, 'tuning-step').text = step
                ET.SubElement(tuning, 'tuning-octave').text = str(octave)
        transpose = ET.SubElement(attrs, 'transpose')
        for tag, value in (('diatonic', 0), ('chromatic', 0), ('octave-change', -1)):
            ET.SubElement(transpose, tag).text = str(value)


def apply_tab(aligned: list[tuple], system_number: int) -> list[str]:
    warnings = []
    bar_counts = {}
    pitch_names = ('C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B')
    spellings = (('C', 0), ('C', 1), ('D', 0), ('D', 1), ('E', 0), ('F', 0),
                 ('F', 1), ('G', 0), ('G', 1), ('A', 0), ('A', 1), ('B', 0))
    for note, event, bar in aligned:
        bar_counts[bar] = bar_counts.get(bar, 0) + 1
        string, fret = event['string'], event['fret']
        if not isinstance(string, int) or not 1 <= string <= 6 or not isinstance(fret, int) or not 0 <= fret <= 24:
            raise OmrError('TAB 弦号或品位无效。')
        written = OPEN_STRINGS[string - 1] + fret + 12
        pitch = note.find('pitch')
        previous = _pitch_midi(pitch)
        if previous != written:
            before = f'{pitch_names[previous % 12]}{previous // 12 - 1}'
            after = f'{pitch_names[written % 12]}{written // 12 - 1}'
            warnings.append(f'系统 {system_number} 第 {bar} 小节第 {bar_counts[bar]} 音：五线谱 {before} 与 TAB {after} 冲突；草稿采用 {string} 弦 {fret} 品，请核对。')
        # Preserve the original spelling if it agrees; otherwise use explicit
        # pitch from standard EADGBE. MIDI pitch does not depend on the key.
        if previous != written:
            pitch.clear()
            step, alter = spellings[written % 12]
            ET.SubElement(pitch, 'step').text = step
            if alter:
                ET.SubElement(pitch, 'alter').text = str(alter)
            ET.SubElement(pitch, 'octave').text = str(written // 12 - 1)
            for accidental in note.findall('accidental'):
                note.remove(accidental)
        for tag in ('staff', 'notations'):
            for old in note.findall(tag):
                if tag == 'notations' and len(old):
                    raise OmrError('识别结果含奏法标记，当前模式不能可靠保留。')
                note.remove(old)
        notations = ET.SubElement(note, 'notations')
        technical = ET.SubElement(notations, 'technical')
        ET.SubElement(technical, 'string').text = str(string)
        ET.SubElement(technical, 'fret').text = str(fret)
    return warnings


def recognize_paired(engine, input_path: Path, output_path: Path, mode: str) -> RecognitionResult:
    input_path, output_path = input_path.resolve(), output_path.resolve()
    if input_path == output_path or output_path.suffix.lower() != '.musicxml':
        raise OmrError('识别输出必须是独立的 .musicxml 文件，不能覆盖原图。')
    output_path.parent.mkdir(parents=True, exist_ok=True)
    start = time.monotonic()
    image, _ = deskew_image(load_image(input_path))
    regions = detect_regions(image)
    has_tab = any(r.kind == 'tab' for r in regions)
    if not has_tab:
        if mode == 'standard-tab':
            raise OmrError('未检测到五线谱与 TAB 组合，请选择“仅五线谱”或裁剪更清晰的图片。')
        if not regions:
            raise OmrError('未可靠定位谱线，请裁剪更清晰的完整小节后重试。')
        result = engine.recognize(input_path, output_path)
        recognized = ET.parse(output_path).getroot()
        staff_count = sum(max([1] + [int(n.text) for n in part.findall('.//staves')])
                          for part in recognized.findall('part'))
        if staff_count > len(regions):
            raise OmrError('识别出的谱表比原图多，无法排除多余声部，请裁剪较小片段。')
        return result
    pairs = pair_regions(regions, image.shape[0])
    if len(pairs) > 8:
        raise OmrError('最多处理 8 个系统，请裁剪较小片段。')
    import cv2
    warnings = ['识别结果是待校对草稿；拍号、时值、速度和音高请用 Guitar Pro 核对。',
                '组合谱按标准 EADGBE、无变调夹处理；当前不支持纯 TAB、和弦及复杂奏法。']
    tab = mode != 'standard'
    # Keep every file under this call's private directory. Never writes to DB.
    with tempfile.TemporaryDirectory(prefix='paired-', dir=output_path.parent) as work:
        directory = Path(work)
        inspection = None
        if tab:
            from .tab_parser import inspect_tab
            inspection = inspect_tab(input_path)
            if any(s['unmatched_detections'] or any(e['needs_review'] for e in s['events'])
                   for s in inspection['systems']):
                raise OmrError('TAB 有无法确认的数字或额外符号（可能是拍号），请裁剪清晰片段，或选择“仅五线谱”。')
        merged = None
        total_notes = 0
        for pair in pairs:
            remaining = engine.timeout - (time.monotonic() - start) - 5
            if remaining <= 0:
                raise OmrError('识别超时，请裁剪较小片段。')
            crop = directory / f'system-{pair.system}.png'
            cv2.imencode('.png', image[pair.crop_top:pair.crop_bottom])[1].tofile(str(crop))
            geometry_path = crop.with_suffix('.json')
            args = [sys.executable, '-m', 'guitar_road_omr.homr_geometry', str(geometry_path),
                    *engine._device_args(), *engine._extra_args(), str(crop)]
            env = os.environ.copy()
            env['PYTHONPATH'] = str(Path(__file__).resolve().parent.parent) + os.pathsep + env.get('PYTHONPATH', '')
            try:
                completed = subprocess.run(args, cwd=directory, env=env, capture_output=True,
                                           timeout=remaining)
            except subprocess.TimeoutExpired as exc:
                raise OmrError('识别超时，请裁剪较小片段。') from exc
            if completed.returncode or not crop.with_suffix('.musicxml').exists():
                # Detailed engine paths/logs stay on the server.
                print(completed.stderr.decode('utf-8', errors='replace')[-3000:], file=sys.stderr)
                raise OmrError('五线谱裁剪识别失败；组合谱需要 homr 0.7.0 和本地模型，请查看服务日志。')
            root = ET.parse(crop.with_suffix('.musicxml')).getroot()
            if len(root.findall('part')) != 1 or any(int(x.text) != 1 for x in root.findall('.//staves')):
                raise OmrError('裁剪后仍识别出多个谱表，拒绝生成多余声部。')
            if tab:
                system = inspection['systems'][pair.system - 1]
                geometry = json.loads(geometry_path.read_text(encoding='utf-8'))
                aligned = align_system(root, system, geometry, image.shape[1])
                warnings.extend(apply_tab(aligned, pair.system))
                total_notes += len(aligned)
            guitar_attributes(root, tab=tab)
            if merged is None:
                merged = root
            else:
                for measure in root.find('part').findall('measure'):
                    merged.find('part').append(copy.deepcopy(measure))
        for number, measure in enumerate(merged.find('part').findall('measure'), 1):
            measure.set('number', str(number))
        # OCR guesses of title such as "e eto e f" are not metadata.
        for tag in ('work', 'movement-title', 'identification'):
            for item in merged.findall(tag):
                merged.remove(item)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        ET.ElementTree(merged).write(output_path, encoding='utf-8', xml_declaration=True)
    if tab:
        warnings.insert(0, f'已对齐 {len(pairs)} 个系统、{total_notes} 个 TAB 音符；保留原弦号和品位。OCR 未经人工确认。')
    else:
        warnings.insert(0, '已隔离六线谱，仅识别五线谱；此文件没有保留原 TAB 指法。')
    return RecognitionResult(True, output_path, 'homr+tab' if tab else 'homr-standard-crop', warnings)
