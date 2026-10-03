// Authored fixture only; never loads the practice database or user scores.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { importer, midi, Settings } from '../../../node_modules/@coderline/alphatab/dist/alphaTab.core.mjs';

const xml = fs.readFileSync(new URL('./fixtures/guitar-technical.musicxml', import.meta.url));
const score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(xml));
assert.equal(score.tracks.length, 1);
assert.equal(score.masterBars.length, 1);
const track = score.tracks[0];
assert.equal(track.staves.length, 1, 'TAB must not become a second musical part');
assert.equal(track.playbackInfo.program, 24, 'nylon guitar, zero-based MIDI program');
const staff = track.staves[0];
assert.deepEqual(staff.tuning, [64, 59, 55, 50, 45, 40]);
const notes = staff.bars.flatMap(b => b.voices.flatMap(v => v.beats.flatMap(b => b.notes)));
const expected = [[2, 5, 64], [1, 0, 64], [1, 10, 74], [6, 0, 40]];
assert.equal(notes.length, expected.length);
for (let i = 0; i < notes.length; i++) {
  const note = notes[i];
  const [string, fret, pitch] = expected[i];
  assert.equal(staff.tuning.length - note.string + 1, string, `note ${i}: source string`);
  assert.equal(note.fret, fret, `note ${i}: source fret`);
  assert.equal(note.beat.duration, 4, `note ${i}: quarter-note duration`);
  assert.equal(note.realValue, pitch, `note ${i}: sounding pitch`);
  assert.equal(note.displayValue, pitch + 12, `note ${i}: written guitar octave`);
}
const midiFile = new midi.MidiFile();
const handler = new midi.AlphaSynthMidiFileHandler(midiFile);
new midi.MidiFileGenerator(score, new Settings(), handler).generate();
const noteOns = midiFile.events.filter(event => event instanceof midi.NoteOnEvent);
assert.deepEqual(noteOns.map(event => event.noteKey), expected.map(note => note[2]),
  'actual MIDI generation must play each sounding pitch exactly once');
console.log('CREATOR_MUSICXML_IMPORT_PASS: original strings/frets, guitar octave and MIDI notes preserved');
