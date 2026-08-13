/**
 * scalePlayer — generate the diatonic scale of a chord's root
 * by chord name, then play it up and down via the audio engine.
 *
 * The masterclass is built around diatonic practice (the Dorian
 * arpeggio prototype, the 3-to-9 line, the 12 levels of
 * paraphrase). This is the smallest useful slice — given a
 * chord name like "Cmaj7" or "Dm7b5", play the diatonic scale
 * up and down at the current tempo.
 *
 * No new dependencies. Just MIDI math + Web Audio scheduling
 * through audioEngine.playNote / stopNote.
 */
import { audioEngine } from "./audio";

const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Mode → semitone offsets from root, with the tonic emphasized.
// Index 0 = root, last index = octave (so the scale has 8 notes
// counting the octave; 7 distinct pitch classes + octave).
const MODES: Record<string, number[]> = {
  // Major (Ionian): 1 2 3 4 5 6 7 — W W H W W W H
  maj:     [0, 2, 4, 5, 7, 9, 11, 12],
  // Minor (Aeolian): 1 2 ♭3 4 5 ♭6 ♭7 — W H W W H W W
  min:     [0, 2, 3, 5, 7, 8, 10, 12],
  // Dorian: 1 2 ♭3 4 5 6 ♭7
  dorian:  [0, 2, 3, 5, 7, 9, 10, 12],
  // Mixolydian: 1 2 3 4 5 6 ♭7
  mix:     [0, 2, 4, 5, 7, 9, 10, 12],
  // Lydian: 1 2 3 ♯4 5 6 7
  lydian:  [0, 2, 4, 6, 7, 9, 11, 12],
  // Phrygian: 1 ♭2 ♭3 4 5 ♭6 ♭7
  phryg:   [0, 1, 3, 5, 7, 8, 10, 12],
  // Locrian: 1 ♭2 ♭3 4 ♭5 ♭6 ♭7
  locrian: [0, 1, 3, 5, 6, 8, 10, 12],
  // Harmonic minor: 1 2 ♭3 4 5 ♭6 ♮7 (raised 7)
  harmmin: [0, 2, 3, 5, 7, 8, 11, 12],
  // Melodic minor (asc.): 1 2 ♭3 4 5 6 7
  melmin:  [0, 2, 3, 5, 7, 9, 11, 12],
  // Whole tone (the masterclass uses this as Level 3)
  whole:   [0, 2, 4, 6, 8, 10, 12],
  // Diminished 7-tone (the "three diminished chords" study)
  dim7:    [0, 1, 3, 4, 6, 7, 9, 10, 12],
};

/**
 * Parse a chord name like "Cmaj7" / "Dm7b5" / "Bb7" / "F#m" / "A7"
 * into root + mode. Returns null if it can't.
 */
export function parseChordName(name: string): { root: number; mode: string } | null {
  // Match root: A-G, optional accidental (#/b), rest = quality.
  const m = name.trim().match(/^([A-G])([b#]?)(.*)$/);
  if (!m) return null;
  const letter = m[1];
  const accidental = m[2];
  const quality = m[3] ?? "";
  const letterIdx = NOTE_NAMES.findIndex((n) => n === letter || n[0] === letter);
  if (letterIdx < 0) return null;
  // Match NOTE_NAMES to determine the semitone index for the root.
  // Letter-only (e.g. "C") maps to NOTE_NAMES["C"] = 0.
  // "Db" maps to NOTE_NAMES["Db"] = 1.
  // "#" raises by 1 (so "F#" → "Gb" = 6).
  let rootIdx = NOTE_NAMES.indexOf(letter);
  if (accidental === "b") rootIdx = (rootIdx - 1 + 12) % 12;
  if (accidental === "#") rootIdx = (rootIdx + 1) % 12;

  // Quality → mode. Order matters — check the most specific first.
  let mode = "maj";
  if (/^maj7|^maj$|^M7$/.test(quality)) mode = "maj";
  else if (/^m7b5|^ø7|^m7b5$/.test(quality)) mode = "locrian";
  else if (/^m7$|^m$/.test(quality)) mode = "min";
  else if (/^7sus4$|^sus4$/.test(quality)) mode = "mix";
  else if (/^7alt|^alt$/.test(quality)) mode = "melmin";
  else if (/^7$/.test(quality)) mode = "mix";
  else if (/^mM7$/.test(quality)) mode="melmin";
  // else default major for unadorned major-7, etc.

  return { root: rootIdx, mode };
}

/** Returns the diatonic scale of a chord name, as MIDI note numbers
 *  centred around C4 = 60, one octave around the chord root. */
export function getDiatonicScale(name: string): number[] {
  const parsed = parseChordName(name);
  if (!parsed) return [];
  const intervals = MODES[parsed.mode];
  // Centre the scale around C4 (MIDI 60) so the typical practice
  // range works for trumpet (no extreme lows). For low roots, drop
  // an octave automatically.
  const baseRootMidi = 60 + parsed.root;
  return intervals.map((iv) => baseRootMidi + iv);
}

/** All mode names — used by the UI mode picker. */
export const SCALE_MODES = Object.keys(MODES);

/**
 * Play a scale up-and-down, one note per beat, at the given tempo.
 * Honours the active AudioContext's clock so the playback is
 * sample-accurate with the rhythm / backing engines.
 */
export function playScaleUpDown(
  scaleNotes: number[],
  tempoBpm: number,
  onNote?: (midi: number, when: number) => void,
) {
  const ctx = audioEngine.getCtx();
  if (!ctx || !scaleNotes.length) return;
  const beatSec = 60 / tempoBpm;
  const now = ctx.currentTime + 0.05;
  const seq = [...scaleNotes, ...scaleNotes.slice(0, -1).reverse()];
  seq.forEach((midi, i) => {
    const when = now + i * beatSec;
    audioEngine.playNote(midi);
    onNote?.(midi, when);
    // Auto-release after the next beat (or last note).
    const stopAt = when + beatSec * 0.95;
    const stopDelay = Math.max(0, (stopAt - ctx.currentTime) * 1000);
    setTimeout(() => audioEngine.stopNote(midi), stopDelay);
  });
  // Total duration estimate, useful for UI status.
  return seq.length * beatSec;
}