/**
 * Lead sheet generation for a HarmonicPath.
 *
 * Renders the chord progression as compact 4-bar lines of ABC notation
 * with chord symbols above. Each chord is **arpeggiated into the bar**
 * so the trumpet player sees every note they have to play — not just
 * the bass — and can blow them in order.
 *
 * Audio truth (F3, D110): one HarmonicStep = one BAR of rendered
 * audio. The transport and the WAV renderer both honor that
 * 1:1 mapping, so this builder emits **one ABC bar per step** rather
 * than grouping 4 steps into one visual bar (the legacy v1 layout).
 * If the path has been padded past its form (padPath cycles steps
 * until the bar-count policy is met), we detect the form boundary
 * via detectFormPeriod and render the form exactly once — a `%%text`
 * footer reports the form length and the repeat count the live
 * transport will play through.
 */

import abcjs from "abcjs";
import { HarmonicPath } from "./paths";
import {
  TRANSPOSITIONS,
  InstrumentPitch,
  transposeMidiList,
} from "./scoreGenerator";
import { transposeChordName } from "./theory";
import { detectFormPeriod } from "./formPeriod";
import { totalFormBars } from "../../engine/practice/windows";

const NOTE_TO_ABC: Record<number, string> = {
  0: "c", 1: "_d", 2: "d", 3: "_e", 4: "e", 5: "f",
  6: "_g", 7: "g", 8: "_a", 9: "a", 10: "_b", 11: "b",
};

/**
 * Convert a MIDI pitch to an ABC note token. Handles octaves above
 * and below middle C correctly (commas for low, apostrophes for high).
 *
 * Exported so composerChartAbc.ts can reuse the same MIDI→spelling
 * convention (one source of truth for how the engine spells pitches
 * in ABC).
 */
export function midiToABC(midiPitch: number): string {
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
 * Derive the ABC key-signature token (the value that follows `K:`) from
 * a HarmonicPath's `key` field, transposed for the target instrument.
 *
 * Rules, in order:
 *   1. `undefined` / empty → "C" (the safe default; abcjs treats
 *      `K:C` as no key signature, which reads as C major / A minor).
 *   2. Take the substring before "→" so progressive-tonality keys like
 *      `"D minor → C major"` use the starting key, then trim.
 *   3. Detect minor by trailing dash (e.g. `"G-"`), or trailing
 *     `"m"` / `"min"` / `" minor"` (case-insensitive), and strip it.
 *   4. Transpose the root by `transposeSemitones` so a Bb instrument's
 *      written key is a whole step up from concert pitch.
 *   5. Return minor ? `${root}m` : root. ABC accepts the flat-preferred
 *      spellings that `transposeChordName` produces ("Bb", "F#", "Gm").
 *
 * Exported for direct unit pinning.
 */
export function abcKeySignature(
  key: string | undefined,
  transposeSemitones: number,
): string {
  if (!key) return "C";
  const starting = key.split("→")[0].trim();
  if (!starting) return "C";
  const isMinor =
    starting.endsWith("-") ||
    /\s(min|minor|m)$/i.test(starting) ||
    /(min|minor|m)$/i.test(starting);
  let raw = starting;
  if (isMinor) {
    // Strip the minor marker in any of: trailing "-", "m", "min",
    // " minor" (case-insensitive). Whitespace inside the key string
    // is unusual but defensive — strip optional whitespace first.
    raw = raw
      .replace(/\s+$/, "")
      .replace(/\s*(min|minor)$/i, "")
      .replace(/m$/i, "")
      .replace(/-$/, "");
  }
  raw = raw.trim();
  if (!raw) return "C";
  const transposed = transposeChordName(raw, transposeSemitones).trim();
  return isMinor ? `${transposed}m` : transposed;
}

/**
 * Build an ABC string for a HarmonicPath. One ABC bar per HarmonicStep
 * (F3 audio truth: 1 step = 1 bar). Chord symbols sit above each bar;
 * the chord's voicing is arpeggiated across the bar in ascending
 * pitch order so the trumpet player sees every note they have to play.
 *
 * If `path.steps` has been padded past its form (padPath cycles the
 * form to satisfy the bar-count policy), we render the form exactly
 * once and append a `%%text` footer reporting the repeat count the
 * live transport will play through.
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
  const abcKey = abcKeySignature(path.key, transposeSemitones);
  lines.push(`K:${abcKey}`);
  if (path.key && path.key.includes("→")) {
    lines.push(`%%text Modulates: ${path.key}`);
  }

  // Form-trim the steps. detectFormPeriod finds the smallest p such
  // that every step matches (i % p); steps.length === p for paths that
  // padPath left untouched. totalFormBars honors "at least one bar"
  // for degenerate forms.
  const formLen = totalFormBars(detectFormPeriod(path.steps));
  const formSteps = path.steps.slice(0, formLen);
  const repeatCount = Math.round(path.steps.length / formLen);

  // Build ABC bars. ONE bar per HarmonicStep. Four bars per source line.
  const barLines: string[] = [];
  let barBuffer: string[] = [];
  formSteps.forEach((s, idx) => {
    const transposed = transposeMidiList(s.notes, transposeSemitones);
    const playable = transposed.map(clampToPlayableRange);

    const barTokens: string[] = [];
    if (s.name) {
      barTokens.push(`"^${s.name}"`);
    }

    // Arpeggiate across 4 quarter beats. If we have more notes
    // than beats, switch to 8ths at the end of the arpeggio.
    const quarterNotes = playable.slice(0, 4);
    const overflow = playable.slice(4);

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

    barBuffer.push(`| ${barTokens.join("")} |`);
    // Four bars per source line.
    if (barBuffer.length === 4 || idx === formSteps.length - 1) {
      barLines.push(barBuffer.join(" "));
      barBuffer = [];
    }
  });
  lines.push(...barLines);

  // If the live transport will loop the form, leave a one-line note.
  if (path.steps.length > formLen) {
    lines.push(
      `%%text Form: ${formLen} bars, repeats ${repeatCount}x in practice.`,
    );
  }

  // Voice-leading annotation at the end (informational only) — over
  // the form steps, NOT the padded list, so the report is honest.
  const vlos: string[] = [];
  for (let i = 1; i < formSteps.length; i++) {
    const prev = Math.min(...formSteps[i - 1].notes);
    const curr = Math.min(...formSteps[i].notes);
    const semitones = Math.abs(curr - prev);
    if (semitones > 0) vlos.push(`${formSteps[i].name}: bass +${semitones}st`);
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
export function clampToPlayableRange(midi: number): number {
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