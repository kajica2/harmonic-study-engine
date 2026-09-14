# 8-way chromatic-dir selectable arpeggiator (judgment: go)
Ways 1-8 mapped in JSON + MusicXML. Selectable by interval_dir × instrument_dir × paired.
Engraving: no 8va; quartal voicings; marcato+tenuto highs; acciaccatura grace; ghost notes (x); exact slurs.
Identity: Inkling (OpenRouter). Engine: harmonic-study-engine. Path: ./arpeggiator.

--- Tone.js integration (A) ---
Import: import { playWay, stopAll } from './8-way-tone.js';
8-way selectable (1 at a time): Way 1-8 via playWay(way, rootPitch, intervalDir, instrumentDir)
Constraints: no 8va; quartal voicing; per-note articulation; single-playback (no overlap)
