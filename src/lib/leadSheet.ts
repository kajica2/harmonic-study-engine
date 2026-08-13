/**
 * Lead sheet generation for a HarmonicPath.
 *
 * Renders the chord progression as compact 4-bar lines of ABC notation
 * with chord symbols above. Each chord's voicing is **arpeggiated into
 * the bar** so the trumpet player sees every note they have to play —
 * not just the bass — and can blow them in order.
 */

import abcjs from "abcjs";
import { HarmonicPath } from "./paths";
import {
  TRANSPOSITIONS,
  InstrumentPitch,
  transposeMidiList,
} from "./scoreGenerator";

const NOTE_TO_ABC: Record<number, string> = {
  0: "c", 1: "_d", 2: "d", 3: "_e", 4: "e", 5: "f",
  6: "_g", 7: "g", 8: "_a", 9: "a", 10: "_b", 11: "b",
};

/**
 * Convert a MIDI pitch to an ABC note token. Handles octaves above
 * and below middle C correctly (commas for low, apostrophes for high).
 */
function midiToABC(midiPitch: number): string {
  const name = NOTE_TO_ABC[((midiPitch % 12) + 12) % 12];
  const octave = Math.floor(midiPitch / 12) - 1; // MIDI 60 = C4
  let suffix = "";
  if (octave >= 1) {
    // C4 = c, C5 = c', C6 = c''
    suffix = "'".repeat(octave - 3); // C4: 0, C5: 1, C6: 2
  } else {
    // C3 = C, C2 = C,, C1 = C,,,
    suffix = ",".repeat(3 - octave); // C3: 0, C2: 1, C1: 2
  }
  // Safety: if the pitch is below C1 or above C7, fall back to the
  // nearest playable octave so abcjs doesn't silently drop the note.
  if (octave < 0) return `${name}${",".repeat(2)}`;
  if (octave > 6) return `${name}${"'".repeat(3)}`;
  return `${name}${suffix}`;
}

/**
 * Build an ABC duration token for a fractional note. 1 = whole,
 * 1/2 = half, 1/4 = quarter, 1/8 = eighth, 1/16 = sixteenth.
 */
function duration(d: number): string {
  if (d === 1) return "";
  if (d === 1 / 2) return "2";
  if (d === 1 / 4) return "4";
  if (d === 1 / 8) return "8";
  if (d === 1 / 16) return "16";
  return "4";
}

/**
 * Build an ABC string for a HarmonicPath. Each chord is **arpeggiated**
 * across the bar in ascending order so the trumpet player sees every
 * note. Notes longer than 4 get split into two 8ths.
 *
 * Bar shape for 4 chords per bar (4/4):
 *   | c4 d4 e4 g4 |       — Dm7 in C: D F A C
 *   | a4 c'4 e'4 g'4 |     — G7:  G B D F
 *
 * Bar shape when a chord has more than 4 notes:
 *   | c4 d4 e4 f4 [g8a8] | — split into 8ths at the end
 */
export function buildLeadSheetAbc(
  path: HarmonicPath,
  instrument: InstrumentPitch,
): string {
  const transposeSemitones = TRANSPOSITIONS[instrument];
  const lines: string[] = [];

  // X: header, M: 4/4, L:1/4, Q: 100bpm default
  lines.push(`X:${path.id}`);
  lines.push(`T:${path.title} (${instrument})`);
  lines.push(`M:4/4`);
  lines.push(`L:1/4`);
  lines.push(`Q:1/4=100`);
  lines.push(`K:C`);

  const stepCount = path.steps.length;
  const barCount = Math.ceil(stepCount / 4);

  for (let bar = 0; bar < barCount; bar++) {
    const barSteps = path.steps.slice(bar * 4, bar * 4 + 4);
    const barTokens: string[] = [];

    barSteps.forEach((s, stepIdx) => {
      const transposed = transposeMidiList(s.notes, transposeSemitones);
      // Take only notes that fall within a reasonable trumpet range
      // (written C2 to written C7; concert is D3..F#5 typical).
      // Out-of-range notes are clamped to the nearest playable pitch.
      const playable = transposed.map(clampToPlayableRange);
      const notes = playable;

      // Render chord symbol on the FIRST note of the bar (abcjs
      // attaches the symbol to the next note). Subsequent steps in
      // the bar get a leading space.
      if (stepIdx === 0 && s.name) {
        barTokens.push(`"^${s.name}"`);
      } else if (s.name) {
        // Inline chord symbol on each chord's first note
        barTokens.push(`"^${s.name}"`);
      }

      // Arpeggiate across 4 quarter beats. If we have more notes
      // than beats, switch to 8ths at the end of the arpeggio.
      const quarterNotes = notes.slice(0, 4);
      const overflow = notes.slice(4);

      quarterNotes.forEach((midi, noteIdx) => {
        barTokens.push(`${midiToABC(midi)}4`);
        if (noteIdx < quarterNotes.length - 1) barTokens.push(" ");
      });
      if (overflow.length > 0) {
        // First quarter slot is already used — switch overflow to
        // 8ths and tack them onto the end of the bar. The bar
        // already has 4 quarters; we add 8ths after.
        if (quarterNotes.length > 0) barTokens.push(" ");
        overflow.forEach((midi) => {
          barTokens.push(`[${midiToABC(midi)}8`);
        });
        if (overflow.length > 0) barTokens.push("]");
      }
      if (stepIdx < barSteps.length - 1) barTokens.push(" ");
    });

    lines.push(`| ${barTokens.join("")} |`);
  }

  // Voice-leading annotation at the end (informational only)
  const vlos: string[] = [];
  for (let i = 1; i < path.steps.length; i++) {
    const prev = Math.min(...path.steps[i - 1].notes);
    const curr = Math.min(...path.steps[i].notes);
    const semitones = Math.abs(curr - prev);
    if (semitones > 0) vlos.push(`${path.steps[i].name}: bass +${semitones}st`);
  }
  if (vlos.length > 0) {
    lines.push(`%%text ${vlos.join(" / ")}`);
  }

  return lines.join("\n");
}

/**
 * Written range of a Bb trumpet: written F#3 to D6 (sounding D3 to F#5
 * for Bb, +2 semitones lower than written). We allow a slightly wider
 * range than the practical standard so the engraving doesn't drop
 * notes. Anything outside this is shifted up/down by an octave to the
 * nearest playable pitch.
 */
function clampToPlayableRange(midi: number): number {
  const MIN = 48; // C3 (written low end)
  const MAX = 84; // C6 (written high end)
  let n = midi;
  while (n < MIN) n += 12;
  while (n > MAX) n -= 12;
  return n;
}

/**
 * Render the lead-sheet ABC to the given HTMLElement using abcjs.
 */
export function renderLeadSheet(
  container: HTMLElement,
  path: HarmonicPath,
  instrument: InstrumentPitch,
): void {
  const abc = buildLeadSheetAbc(path, instrument);
  abcjs.renderAbc(container, abc, {
    responsive: "resize",
    staffwidth: 800,
    add_classes: true,
  });
}