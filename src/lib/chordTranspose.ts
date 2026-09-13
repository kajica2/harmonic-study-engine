/**
 * src/lib/chordTranspose.ts — pure helpers used by App.tsx and the
 * etude/leadSheet consumers. No React, no DOM, no side effects.
 *
 * Extracted from App.tsx so the chord-name transposition logic can
 * be unit-tested independently of the audio engine singletons that
 * the App component pulls in. Mirrors the conventions in src/lib/theory.ts.
 */

const NOTE_WHEEL = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

/**
 * The 12 pitch-class names in transposition order, flat-first so
 * the keyboard-range label renders enharmonically consistent with
 * the rest of the UI (Eb, Ab, Bb rather than D#, G#, A#). Reused
 * by the keyboard-range slider labels in App.tsx.
 */
export const PITCH_CLASSES: readonly string[] = NOTE_WHEEL;

const ENHARMONIC_TO_SHARP: Record<string, string> = {
  "C#": "Db",
  "D#": "Eb",
  "F#": "Gb",
  "G#": "Ab",
  "A#": "Bb",
};

/**
 * Transpose every note name in a chord symbol by N semitones.
 *
 * Handles slash chords (C/E), parentheticals (Cmaj7(b9)), and the
 * usual enharmonics (Db -> C# -> Db). Notes that don't match the
 * pitch-class regex (e.g. the "T44" time tag in iReal charts, or
 * section labels like "INTRO") are passed through unchanged.
 *
 * @param name    chord symbol like "Cmaj7" or "Dm7/G"
 * @param shift   semitones to transpose by (negative = down)
 * @returns       transposed symbol, or the input unchanged if shift
 *                is a multiple of 12
 */
export function transposeChordName(name: string, shift: number): string {
  if (shift % 12 === 0) return name;
  return name.replace(/(^|[\s/(-])([A-G][b#]?)/g, (match, prefix, note) => {
    let index = NOTE_WHEEL.indexOf(note);
    if (index === -1) {
      const enharmonic = ENHARMONIC_TO_SHARP[note];
      index = enharmonic ? NOTE_WHEEL.indexOf(enharmonic) : -1;
    }
    if (index === -1) return match;
    // +120 keeps the modulo positive even for negative shifts
    const newIndex = (index + shift + 120) % 12;
    return prefix + NOTE_WHEEL[newIndex];
  });
}
