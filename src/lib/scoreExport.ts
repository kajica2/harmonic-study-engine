/**
 * Score exporters — MusicXML (4.0-compatible) and Score21 (markdown
 * friendly ASCII staff).
 *
 * Both take a HarmonicPath and an optional chord decomposition done by
 * `analyzeChord`. MusicXML needs durations; we render each step as a
 * 4-beat chord (whole note) inside a 4/4 measure, one bar per step.
 * Score21 formats the same content as monospaced stem/capo notation
 * plus a chord-symbol line — readable in any text editor / chat.
 *
 * No external deps; pure TypeScript.
 */

import { HarmonicPath } from "./paths";

// ---------------------------------------------------------------------------
// MusicXML 4.0 export
// ---------------------------------------------------------------------------

interface MusicXmlOptions {
  /** Title for the <work> element */
  title?: string;
  /** Composer (artist) */
  composer?: string;
  /** Beats per minute (default 80) */
  tempo?: number;
  /** Transpose everything by N semitones (e.g. +2 for Bb trumpet) */
  transpose?: number;
  /** Beats per measure (default 4) */
  beatsPerMeasure?: number;
  /** Steps per measure (default 1 — one chord per bar) */
  stepsPerMeasure?: number;
}

/** Encode a numeric MIDI to a musicXML pitch string e.g. 60 → C4, 61 → D♭4 */
function midiToXmlPitch(midi: number, transpose: number = 0): string {
  const m = midi + transpose;
  const pc = ((m % 12) + 12) % 12;
  const octave = Math.floor(m / 12) - 1;
  const STEPS = [
    { letter: "C", alter: 0 },
    { letter: "D", alter: -1 },
    { letter: "D", alter: 0 },
    { letter: "E", alter: -1 },
    { letter: "E", alter: 0 },
    { letter: "F", alter: 0 },
    { letter: "G", alter: -1 },
    { letter: "G", alter: 0 },
    { letter: "A", alter: -1 },
    { letter: "A", alter: 0 },
    { letter: "B", alter: -1 },
    { letter: "B", alter: 0 },
  ];
  const s = STEPS[pc];
  return `${s.letter}${s.alter !== 0 ? (s.alter < 0 ? "f" : "s") : ""}${octave}`;
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Render a HarmonicPath to a MusicXML 4.0 string.
 *
 * Layout: chord-per-bar in 4/4 at the given tempo. Each bar's pitches
 * are written as a <chord/> (no <note/> durations; the audience just
 * sees the chord per measure). Chords include step.name as a harmony
 * element so Finale/Sibelius/MuseScore will display a chord symbol.
 */
export function toMusicXml(
  path: HarmonicPath,
  opts: MusicXmlOptions = {},
): string {
  const {
    title = path.title,
    composer = "harmonic-study-engine",
    tempo = 80,
    transpose = 0,
    beatsPerMeasure = 4,
    stepsPerMeasure = 1,
  } = opts;
  const stepCount = path.steps.length;
  if (stepCount === 0) throw new Error("Cannot export empty path");

  const measures: string[] = [];
  let measureNumber = 1;
  for (let i = 0; i < stepCount; i += stepsPerMeasure) {
    const stepSlice = path.steps.slice(i, i + stepsPerMeasure);
    const noteElements = stepSlice.flatMap((step) => {
      const uniqueNotes = Array.from(new Set(step.notes)).sort((a, b) => a - b);
      const rootStep = escapeXml((step.name.replace(/[^A-G#b]/g, "").charAt(0) || "C"));
      const rootAlter = /Db|Eb|Gb|Ab|Bb|[#]/.test(step.name) ? "1" : "0";
      const inner = uniqueNotes
        .map(
          (n) => `
        <note>
          <pitch>${midiToXmlPitch(n, transpose)}</pitch>
          <duration>${4 / stepSlice.length}</duration>
          <voice>1</voice>
        </note>`,
        )
        .join("");
      return `
      <harmony>
        <root><root-step>${rootStep}</root-step><root-alter>${rootAlter}</root-alter></root>
        <kind text="${escapeXml(step.name)}">major</kind>
      </harmony>${inner}`;
    }).join("");

    // compute bar duration using the formula 4 quarters per measure
    const measureXml = `
    <measure number="${measureNumber}">
      ${noteElements}
    </measure>`;
    measures.push(measureXml);
    measureNumber++;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>${escapeXml(title)}</work-title>
  </work>
  <identification>
    <creator type="composer">${escapeXml(composer)}</creator>
  </identification>
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="0">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>${beatsPerMeasure}</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome></direction-type></direction>
    </measure>${measures.join("")}
  </part>
</score-partwise>`;
}

// ---------------------------------------------------------------------------
// Score21 — a markdown-friendly ASCII staff
//
// Reference: https://score21.app — scorable monospaced chord notation
// with stems-up/stems-down pitch representations.
//
// We emit:
//   • a header line with title / key / tempo
//   • chord symbols above each measure
//   • an ASCII pitch line per chord using a piano-roll style
// ---------------------------------------------------------------------------

/** Render a HarmonicPath to a Score21 (markdown) string. */
export function toScore21(
  path: HarmonicPath,
  opts: { title?: string; transpose?: number } = {},
): string {
  const { transpose = 0 } = opts;
  const title = opts.title ?? path.title;

  // Build a 13-string "piano" with one column per pitch class.
  const PITCH_LABELS = ["C", "D", "E", "F", "G", "A", "B"]; // white keys first
  const BAR_W = 16; // characters per bar
  const lines: string[] = [];

  // Header
  lines.push(`# ${title}`);
  const composer = (path as any).composer || "harmonic-study-engine";
  lines.push(`> composer=${composer}  length=${path.steps.length} bars  format=score21`);

  // Chord-symbol row (one label per step, padded to BAR_W)
  let chordRow = "";
  for (const step of path.steps) {
    // replace spaces inside the chord name with "_" so layout stays aligned;
    // keeps "blues over A" readable as "blues_over_A"
    const sym = step.name.replace(/\s+/g, "_");
    chordRow += "| " + sym.padEnd(BAR_W - 2).slice(0, BAR_W - 2) + " ";
  }
  lines.push("\n## chords");
  lines.push(chordRow + "|");

  // Pitch-class cells row (X = a hit)
  // Render across two octaves (rows = octave 5..2), columns = pitch class
  lines.push("\n## pitches (concert)");
  for (let oct = 5; oct >= 2; oct--) {
    let row = `|${oct} |`;
    for (const step of path.steps) {
      let cell = "";
      for (const c of PITCH_LABELS) {
        const targetPc = pitchLetterToTpc(c, oct) % 12;
        // A note "matches" this (letter, octave) iff its PC==targetPc AND its
        // rounded-to-nearest-octave equals oct.
        const hit = step.notes.some((n) => {
          const m = n + transpose;
          if (((m % 12) + 12) % 12 !== targetPc) return false;
          const noteOct = Math.floor(m / 12) - 1;
          return noteOct === oct;
        });
        cell += hit ? "X " : ". ";
      }
      row += "|" + cell.padEnd(BAR_W - 1) + "|";
    }
    lines.push(row + "|");
  }

  // Voice-leading summary
  lines.push("\n## voice-leading");
  let last: number[] = [];
  for (let i = 0; i < path.steps.length; i++) {
    const notes = path.steps[i].notes;
    const top = Math.max(...notes);
    const prevTop = last.length ? Math.max(...last) : top;
    const motion = last.length ? top - prevTop : 0;
    lines.push(
      `b${i + 1}: ${path.steps[i].name.padEnd(8)} top=${midiName(top)} motion=${motion >= 0 ? "+" : ""}${motion}st`,
    );
    last = notes;
  }

  return lines.join("\n");
}

function midiName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"][pc] + oct;
}
function pcOf(midi: number): number {
  return ((midi % 12) + 12) % 12;
}
function pitchLetterToTpc(letter: string, octave: number): number {
  // Map C/D/E/F/G/A/B + octave to tpc (0..11)
  const m: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return m[letter] + 12 * (octave + 1);
}
