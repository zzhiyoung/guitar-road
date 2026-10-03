"""Deterministic tests use original synthetic diagrams, not private scores."""
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from guitar_road_omr.engine import OmrError
from guitar_road_omr.regions import StaffRegion, deskew_image, detect_regions, load_image, pair_regions
from guitar_road_omr.tab_parser import (DigitCandidate, numeric_fret, reconcile_column,
                                       _bar_positions, _stem_columns, _glyph_box, common_time_columns)


def paired_diagram(systems=1, *, with_extra_row=False):
    import cv2
    import numpy as np
    image = np.full((systems * 260 + 30, 640, 3), 255, dtype=np.uint8)
    for system in range(systems):
        base = system * 260
        for y in (50, 60, 70, 80, 90):
            cv2.line(image, (20, y + base), (610, y + base), (30, 30, 30), 1)
        for y in (160, 170, 180, 190, 200, 210):
            cv2.line(image, (20, y + base), (610, y + base), (130, 130, 130), 1)
        if with_extra_row:
            # A beam above the six strings must not shift the detected group.
            cv2.line(image, (100, 150 + base), (290, 150 + base), (30, 30, 30), 1)
        for x in (20, 315, 610):
            cv2.line(image, (x, 50 + base), (x, 210 + base), (30, 30, 30), 1)
    return image


class RegionTests(unittest.TestCase):
    def test_pairs_and_multiple_systems(self):
        image = paired_diagram(2)
        regions = detect_regions(image)
        pairs = pair_regions(regions, image.shape[0])
        self.assertEqual([r.kind for r in regions], ['standard', 'tab', 'standard', 'tab'])
        self.assertEqual(len(pairs), 2)
        self.assertEqual(pairs[1].tab.lines[0], 420)

    def test_small_tilt_and_source_mapping(self):
        import cv2
        import numpy as np
        for angle in (-1.5, .5, 1.5):
            with self.subTest(angle=angle):
                image = paired_diagram()
                matrix = cv2.getRotationMatrix2D((320, 145), angle, 1)
                tilted = cv2.warpAffine(image, matrix, (640, 290), borderValue=(255, 255, 255))
                corrected, geometry = deskew_image(tilted)
                self.assertAlmostEqual(geometry['deskew_degrees'], -angle, delta=.15)
                pairs = pair_regions(detect_regions(corrected), corrected.shape[0])
                self.assertEqual(len(pairs), 1)
                forward = np.vstack([geometry['source_to_analysis'], [0, 0, 1]])
                inverse = np.vstack([geometry['analysis_to_source'], [0, 0, 1]])
                np.testing.assert_allclose(inverse @ forward, np.eye(3), atol=1e-8)
                self.assertEqual(geometry['source_size'], [640, 290])

    def test_horizontal_image_not_resampled(self):
        image = paired_diagram(2)
        corrected, geometry = deskew_image(image)
        self.assertIs(corrected, image)
        self.assertEqual(geometry['deskew_degrees'], 0)

    def test_beam_not_counted_as_first_string(self):
        regions = detect_regions(paired_diagram(with_extra_row=True))
        self.assertEqual(regions[1].lines, (160, 170, 180, 190, 200, 210))

    def test_does_not_skip_real_lines_to_form_fake_tab(self):
        import cv2
        image = paired_diagram()
        for y in (100, 120, 140):
            cv2.line(image, (100, y), (420, y), (60, 60, 60), 1)
        regions = detect_regions(image)
        self.assertEqual(regions[0].kind, 'standard')
        self.assertEqual(regions[0].lines, (50, 60, 70, 80, 90))

    def test_pure_tab_rejected(self):
        tab = StaffRegion('tab', (100, 110, 120, 130, 140, 150), 20, 600, 10, .9)
        with self.assertRaises(OmrError):
            pair_regions([tab], 200)

    def test_five_line_piano_control_not_discarded(self):
        standard = StaffRegion('standard', (50, 60, 70, 80, 90), 20, 600, 10, .9)
        lower = StaffRegion('standard', (150, 160, 170, 180, 190), 20, 600, 10, .9)
        with self.assertRaises(OmrError):
            pair_regions([standard, lower], 240)

    def test_extra_standard_staff_is_not_silently_dropped(self):
        image = paired_diagram()
        regions = detect_regions(image)
        extra = StaffRegion('standard', (0, 10, 20, 30, 40), 20, 600, 10, .9)
        with self.assertRaises(OmrError):
            pair_regions([extra] + regions, image.shape[0])

    def test_bar_lines_do_not_include_picture_frame(self):
        import cv2
        image = paired_diagram()
        cv2.rectangle(image, (1, 1), (638, image.shape[0] - 2), (0, 0, 0), 1)
        pair = pair_regions(detect_regions(image), image.shape[0])[0]
        bars = _bar_positions(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), pair)
        self.assertEqual(bars, [20, 315, 610])

    def test_crop_preserves_ledger_margin(self):
        image = paired_diagram()
        pair = pair_regions(detect_regions(image), image.shape[0])[0]
        self.assertGreaterEqual(pair.crop_bottom, 130)
        self.assertLessEqual(pair.crop_bottom, 150)

    def test_short_top_string_stem_is_an_event(self):
        import cv2
        import numpy as np
        image = paired_diagram()
        pair = pair_regions(detect_regions(image), image.shape[0])[0]
        ink = np.zeros(image.shape[:2], dtype=np.uint8)
        cv2.line(ink, (100, 138), (100, 154), 255, 1)
        # A digit-sized vertical stroke is too short to be a musical stem.
        cv2.line(ink, (180, 155), (180, 163), 255, 1)
        self.assertEqual(_stem_columns(ink, pair, [20, 315, 610]), [100])

    def test_digit_locator_excludes_thin_stem(self):
        import numpy as np
        ink = np.zeros((20, 24), dtype=np.uint8)
        ink[:, 12:14] = 255
        self.assertIsNone(_glyph_box(ink, 10))
        ink[:, 12:14] = 0
        ink[5:15, 8:12] = 255
        self.assertEqual(_glyph_box(ink, 10), (7, 4, 13, 16))

    def test_narrow_bounded_one_is_not_a_continuous_stem(self):
        import numpy as np
        ink = np.zeros((22, 35), dtype=np.uint8)
        ink[5:17, 16:19] = 255
        self.assertIsNotNone(_glyph_box(ink, 11))
        ink[:, 16:19] = 255
        ink[0, :19] = 255  # neighbouring beam at the edge
        self.assertIsNone(_glyph_box(ink, 11))

    def test_tiny_stem_endpoint_is_not_a_digit(self):
        import numpy as np
        ink = np.zeros((14, 24), dtype=np.uint8)
        ink[9:12, 11:13] = 255
        self.assertIsNone(_glyph_box(ink, 7))

    def test_neighbor_digit_fragment_cannot_widen_a_stem(self):
        import numpy as np
        ink = np.zeros((14, 24), dtype=np.uint8)
        ink[:, 11:13] = 255
        ink[-2:, 8:17] = 255
        self.assertIsNone(_glyph_box(ink, 6))

    def test_large_compressed_image_rejected_before_decode(self):
        from PIL import Image
        with TemporaryDirectory() as root:
            path = Path(root) / 'large.png'
            Image.new('1', (5000, 5000)).save(path)
            with self.assertRaises(OmrError):
                load_image(path)

    def test_large_encoded_file_rejected_before_decode(self):
        with TemporaryDirectory() as root:
            path = Path(root) / 'large.png'
            with path.open('wb') as stream:
                stream.truncate(21 * 1024 * 1024)
            with self.assertRaises(OmrError):
                load_image(path)


class CandidateTests(unittest.TestCase):
    def test_zero_and_double_digit_frets(self):
        for text, expected in [('0', 0), ('1', 1), ('10', 10), ('24', 24)]:
            self.assertEqual(numeric_fret(text), expected)

    def test_bad_numbers_and_symbols_are_not_guessed(self):
        for text in ('', 'x', '-4', '01', '25', '100', '4/5', 'O'):
            self.assertIsNone(numeric_fret(text))

    def test_agreement_preserves_original_string(self):
        a = DigitCandidate(100, 2, 5, .99, '5', (95, 95, 105, 105), 'text_detection')
        b = DigitCandidate(101, 2, 5, .98, '5', (95, 95, 105, 105), 'stem_crop')
        result = reconcile_column(100, [a, b], 8)
        self.assertEqual((result['string'], result['fret']), (2, 5))
        self.assertFalse(result['needs_review'])

    def test_same_pitch_different_strings_remain_a_conflict(self):
        a = DigitCandidate(100, 2, 5, .99, '5', (95, 95, 105, 105), 'text_detection')
        b = DigitCandidate(100, 1, 0, .99, '0', (95, 85, 105, 95), 'stem_crop')
        self.assertEqual(reconcile_column(100, [a, b], 8)['reason'], 'conflicting_candidates')

    def test_missing_digit_remains_unknown(self):
        result = reconcile_column(100, [], 8)
        self.assertIsNone(result['fret'])
        self.assertTrue(result['needs_review'])

    def test_outside_candidates_do_not_shift_events(self):
        a = DigitCandidate(140, 2, 5, .99, '5', (135, 95, 145, 105), 'text_detection')
        self.assertEqual(reconcile_column(100, [a], 8)['reason'], 'unread_digit')

    def test_only_explicit_leading_common_time_is_classified(self):
        image = paired_diagram()
        pair = pair_regions(detect_regions(image), image.shape[0])[0]
        a = DigitCandidate(100, 2, 5, .99, '5', (95, 175, 105, 185), 'text_detection')
        c = {'text': 'C', 'score': .99, 'bbox': (50, 165, 75, 200)}
        self.assertEqual(common_time_columns([60, 100], [c], [a], pair), [60])
        self.assertEqual(common_time_columns([60, 100], [], [a], pair), [])
        zero = DigitCandidate(60, 1, 0, .99, '0', (55, 155, 65, 165), 'text_detection')
        self.assertEqual(common_time_columns([60, 100], [c], [zero, a], pair), [])
        self.assertEqual(common_time_columns([60, 100], [dict(c, text='?')], [a], pair), [])


if __name__ == '__main__':
    unittest.main()
