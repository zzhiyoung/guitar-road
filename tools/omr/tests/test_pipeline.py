"""Fusion contracts: ambiguity must fail, timing and original fingering survive."""
import copy
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from tempfile import TemporaryDirectory

from guitar_road_omr.engine import OmrError
from guitar_road_omr.pipeline import align_system, apply_tab, guitar_attributes, recognize_paired


class FusionTests(unittest.TestCase):
    def setUp(self):
        self.root = ET.parse(Path(__file__).parent / 'fixtures/guitar-technical.musicxml').getroot()
        self.system = {'bar_lines': [0, 200], 'pair': {'standard': {'spacing': 10}},
                       'unmatched_detections': [], 'events': [
                           {'x': x, 'bar': 1, 'string': string, 'fret': fret, 'needs_review': False}
                           for x, string, fret in ((40, 2, 5), (80, 1, 0), (120, 1, 10), (160, 6, 0))]}
        self.geometry = {'width': 200, 'staffs': [{'notes': [40, 80, 120, 160]}]}
        # The recognition input has no original TAB; fusion adds it.
        for note in self.root.findall('.//note'):
            note.remove(note.find('notations'))

    def align(self):
        return align_system(self.root, self.system, self.geometry, 200)

    def test_fingering_and_timing(self):
        before = [n.findtext('duration') for n in self.root.findall('.//note')]
        self.assertEqual(apply_tab(self.align(), 1), [])
        guitar_attributes(self.root, tab=True)
        self.assertEqual([n.findtext('notations/technical/string') for n in self.root.findall('.//note')], ['2', '1', '1', '6'])
        self.assertEqual([n.findtext('duration') for n in self.root.findall('.//note')], before)
        self.assertEqual(len(self.root.findall('part')), 1)
        self.assertEqual(self.root.findtext('.//midi-program'), '25')

    def test_pitch_conflict_is_reported(self):
        self.root.find('.//note/pitch/step').text = 'F'
        warnings = apply_tab(self.align(), 2)
        self.assertEqual(len(warnings), 1)
        self.assertIn('冲突', warnings[0])
        self.assertEqual(self.root.findtext('.//note/pitch/step'), 'E')

    def test_equal_counts_do_not_override_bad_positions(self):
        self.geometry['staffs'][0]['notes'] = [40, 80, 101, 160]
        with self.assertRaises(OmrError):
            self.align()

    def test_extra_header_candidate_is_not_discarded(self):
        self.system['events'].insert(0, {'x': 15, 'bar': 1, 'needs_review': True})
        with self.assertRaises(OmrError):
            self.align()

    def test_missing_note_is_not_filled(self):
        self.geometry['staffs'][0]['notes'].pop()
        with self.assertRaises(OmrError):
            self.align()

    def test_incomplete_duration_is_not_padded(self):
        self.root.find('.//note/duration').text = '2'
        with self.assertRaises(OmrError):
            self.align()

    def test_chord_and_tuplet_rejected(self):
        for tag in ('chord', 'grace', 'time-modification', 'tie'):
            root = copy.deepcopy(self.root)
            ET.SubElement(self.root.find('.//note'), tag)
            with self.assertRaises(OmrError):
                self.align()
            self.root = root

    def test_ambiguous_neighbor_rejected(self):
        self.system['events'][1]['x'] = 50
        with self.assertRaises(OmrError):
            self.align()

    def test_second_staff_rejected(self):
        self.geometry['staffs'].append({'notes': []})
        with self.assertRaises(OmrError):
            self.align()

    def test_output_cannot_replace_source(self):
        with TemporaryDirectory() as directory:
            source = Path(directory) / 'score.png'
            source.write_bytes(b'preserve-original')
            with self.assertRaises(OmrError):
                recognize_paired(None, source, source, 'auto')
            self.assertEqual(source.read_bytes(), b'preserve-original')


if __name__ == '__main__':
    unittest.main()
