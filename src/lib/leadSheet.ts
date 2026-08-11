/**
 * Lead sheet generation for a HarmonicPath.
 *
 * Renders the chord progression as compact 4-bar lines of ABC notation
 * with chord symbols above and minor voice-leading annotations underneath.
 */

import abcjs from "abcjs";
import { HarmonicPath } from "./paths";
import { TRANSPOSITIONS, InstrumentPitch } from "./scoreGenerator";

const NOTE_TO_ABC: Record<number, string> = {
  0: "c", 1: "_d", 2: "d", 3: "_e", 4: "e", 5: "f",
  6: "_g", 7: "g", 8: "_a", 9: "a", 10: "_b", 11: "b",
};

function midiToABC(midiPitch: number, octaveShift: number): string {
  const name = NOTE_TO_ABC[((midiPitch % 12) + 12) % 12];
  const octave = Math.floor(midiPitch / 12) - 1 + octaveShift;
  const o = octave >= 1 ? String(octave).repeat(octave - 1) : "";
  const down = octave < 1 ? ",".repeat(1 - octave) : "";
  return `${name}${o}${down === "" ? (octaveShift === 0 ? "" : (octaveShift > 0 ? "'".repeat(octaveShift) : ",".repeat(-octaveShift))) : down}`;
}

function chordOffsetForInstrument(name: string, instrument: InstrumentPitch): string {
  if (instrument === "Concert") return name;
  // Naive: append "_Bb" / "_F" suffix as a visual indicator
  return `${name} (${instrument})`;
}

/**
 * Build an ABC string for a HarmonicPath as a compact lead sheet.
 * Each chord becomes a quarter chord-symbol. Voice-leading delta is
 * shown between consecutive chords (semitones moved by the bass).
 */
export function buildLeadSheetAbc(
  path: HarmonicPath,
  instrument: InstrumentPitch,
): string {
  const transpose = TRANSPOSITIONS[instrument];
  const lines: string[] = [];

  // X: header, M: 4/4, L:1/4, Q: 100bpm default
  lines.push(`X:${path.id}`);
  lines.push(`T:${path.title} (${instrument})`);
  lines.push(`M:4/4`);
  lines.push(`L:1/4`);
  lines.push(`Q:1/4=100`);

  // For visual anchor we render a melodic line of the root of each chord
  // (transposed for instrument); chord symbols rest above.
  const stepCount = path.steps.length;
  const barCount = Math.ceil(stepCount / 4);

  for (let bar = 0; bar < barCount; bar++) {
    const barSteps = path.steps.slice(bar * 4, bar * 4 + 4);
    const barTokens: string[] = [];
    barSteps.forEach((s, i) => {
      const rootMidi = Math.min(...s.notes);
      const abc = midiToABC(rootMidi, transpose === 0 ? 0 : Math.round(transpose / 12));
      barTokens.push(`[${abc}]`);
      if (i < barSteps.length - 1) barTokens.push(" ");
    });
    lines.push(`| ${barTokens.join("")} |`);
  }

  // Chord symbols as a separate "voice" — placed above the staff
  const chordLines: string[] = [];
  path.steps.forEach((s, idx) => {
    const sym = chordOffsetForInstrument(s.name, instrument);
    chordLines.push(`"^${sym}"`);
    if ((idx + 1) % 4 === 0) chordLines.push("\n");
  });

  // Voice-leading annotation text at end (memos)
  lines.push("%%MIDI");
  const vlos: string[] = [];
  for (let i = 1; i < path.steps.length; i++) {
    const prev = Math.min(...path.steps[i - 1].notes);
    const curr = Math.min(...path.steps[i].notes);
    const semitones = Math.abs(curr - prev);
    if (semitones > 0) vlos.push(`${path.steps[i].name}: bass +${semitones}st`);
  }
  lines.push("%%text " + vlos.join(" / "));

  const chordHeader =
    `%%MIDI chordprogram 1\nV:1\n%%MIDI chordvol 80\n${chordLines.join(" ")}\n`;
  return chordHeader + lines.join("\n");
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
    add_classes: true,
    paddingtop: 12,
    paddingbottom: 12,
    staffwidth: container.clientWidth || 600,
  });
}